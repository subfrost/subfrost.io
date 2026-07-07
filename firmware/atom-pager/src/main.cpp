// SUBFROST hardware pager — M5Stack Atom Echo + Grove passive buzzer.
//
// Subscribes to the owner's ntfy topics (page-<id> + page-all) on
// https://page.subfrost.io over a streaming /json connection and turns pages
// into noise:
//   urgent (priority >= 4): siren + red strobe until the top button is
//     pressed; the press POSTs the page's ACK action URL, which marks the
//     page acknowledged in /admin/pager and stops the server-side repeats.
//   info: three short beeps, no ack required.
//
// First boot (or after a 5s button hold): purple LED, AP "SUBFROST-PAGER",
// captive portal collects Wi-Fi + member id + device credentials (issued by
// the "📟 Device" button in /admin/pager). Stored in NVS.
//
// LED language: purple = setup portal, yellow = connecting, dim blue = armed,
// red strobe = urgent page, cyan blink = info page, green = ack delivered.

#include <Arduino.h>
#include <FastLED.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <base64.h>

// ---- hardware (Atom Echo) ----
static const int PIN_BUTTON = 39; // top button, active LOW
static const int PIN_LED = 27;    // single SK6812
static const int PIN_BUZZER = 26; // Grove yellow wire; try 32 if silent
static const int BUZZ_CH = 0;

static const char *NTFY_HOST = "page.subfrost.io";
static const uint32_t STALL_MS = 150000; // ntfy keepalives every ~45s; 150s silent = dead

CRGB led;
Preferences prefs;
String memberId, devUser, devPass;

// pending urgent page
bool alarming = false;
String pendingAckUrl;

static void setLed(const CRGB &c) {
  led = c;
  FastLED.show();
}

static void buzz(uint32_t freq, uint32_t ms) {
  ledcWriteTone(BUZZ_CH, freq);
  delay(ms);
  ledcWriteTone(BUZZ_CH, 0);
}

static bool buttonDown() { return digitalRead(PIN_BUTTON) == LOW; }

// ---------------------------------------------------------------- provisioning

static void factoryReset() {
  prefs.begin("pager", false);
  prefs.clear();
  prefs.end();
  WiFiManager wm;
  wm.resetSettings();
  ESP.restart();
}

// Captive portal for Wi-Fi + pager identity. Blocks until configured.
static void runPortalIfNeeded() {
  prefs.begin("pager", false);
  memberId = prefs.getString("member", "");
  devUser = prefs.getString("user", "");
  devPass = prefs.getString("pass", "");

  WiFiManager wm;
  wm.setTitle("SUBFROST pager setup");
  WiFiManagerParameter pMember("member", "Member id (e.g. alice)", memberId.c_str(), 32);
  WiFiManagerParameter pUser("duser", "Device username (dev-...)", devUser.c_str(), 40);
  WiFiManagerParameter pPass("dpass", "Device password", "", 48);
  wm.addParameter(&pMember);
  wm.addParameter(&pUser);
  wm.addParameter(&pPass);
  wm.setConfigPortalTimeout(0); // wait forever — this is a set-up-once device
  wm.setSaveParamsCallback([&]() {
    prefs.putString("member", pMember.getValue());
    prefs.putString("user", pUser.getValue());
    if (strlen(pPass.getValue()) > 0) prefs.putString("pass", pPass.getValue());
  });

  bool needPortal = memberId.isEmpty() || devUser.isEmpty() || devPass.isEmpty();
  setLed(needPortal ? CRGB::Purple : CRGB::Yellow);
  // autoConnect: joins saved Wi-Fi, else opens the portal. Force the portal
  // when identity is missing even if Wi-Fi creds exist.
  bool ok = needPortal ? wm.startConfigPortal("SUBFROST-PAGER") : wm.autoConnect("SUBFROST-PAGER");
  if (!ok) ESP.restart();

  memberId = prefs.getString("member", "");
  devUser = prefs.getString("user", "");
  devPass = prefs.getString("pass", "");
  prefs.end();
  if (memberId.isEmpty() || devUser.isEmpty() || devPass.isEmpty()) factoryReset();
}

// ------------------------------------------------------------------------ ack

static void sendAck() {
  if (pendingAckUrl.isEmpty()) return;
  WiFiClientSecure client;
  client.setInsecure(); // pager, not a bank; ntfy auth still protects topics
  HTTPClient http;
  if (http.begin(client, pendingAckUrl)) {
    int code = http.POST("");
    Serial.printf("ack POST -> %d\n", code);
    http.end();
    if (code >= 200 && code < 300) {
      setLed(CRGB::Green);
      buzz(1568, 80);
      buzz(2093, 120);
      delay(600);
    }
  }
  pendingAckUrl = "";
}

// ---------------------------------------------------------------------- pages

static void handleMessage(JsonDocument &doc) {
  int priority = doc["priority"] | 3;
  const char *msg = doc["message"] | "";
  Serial.printf("page (prio %d): %s\n", priority, msg);

  String ackUrl;
  for (JsonObject a : doc["actions"].as<JsonArray>()) {
    if (strcmp(a["action"] | "", "http") == 0) { ackUrl = (const char *)(a["url"] | ""); break; }
  }

  if (priority >= 4) {
    alarming = true;
    pendingAckUrl = ackUrl;
  } else {
    // info: three cyan beeps, done
    for (int i = 0; i < 3; i++) {
      setLed(CRGB::Cyan);
      buzz(1319, 120);
      setLed(CRGB::Black);
      delay(120);
    }
    setLed(CRGB(0, 0, 24));
  }
}

// Siren + strobe until the button is pressed. Server keeps repeating the page
// anyway, so even a reboot mid-alarm re-alarms within ~90s.
static void runAlarm() {
  Serial.println("ALARM — waiting for button");
  uint32_t phase = 0;
  while (alarming) {
    setLed((phase & 1) ? CRGB::Red : CRGB::Black);
    ledcWriteTone(BUZZ_CH, (phase & 1) ? 2400 : 1800);
    for (int i = 0; i < 25; i++) { // 250ms per phase, polling the button
      if (buttonDown()) {
        alarming = false;
        break;
      }
      delay(10);
    }
    phase++;
  }
  ledcWriteTone(BUZZ_CH, 0);
  sendAck();
  while (buttonDown()) delay(10); // wait for release
  setLed(CRGB(0, 0, 24));
}

// --------------------------------------------------------------------- stream

// One streaming subscribe connection. HTTP/1.0 on purpose: the server then
// skips chunked encoding, so every line on the socket is one JSON event.
static void streamLoop() {
  WiFiClientSecure client;
  client.setInsecure();
  setLed(CRGB::Yellow);
  if (!client.connect(NTFY_HOST, 443)) {
    Serial.println("connect failed");
    delay(5000);
    return;
  }

  String auth = base64::encode(devUser + ":" + devPass);
  client.printf("GET /page-%s,page-all/json HTTP/1.0\r\n"
                "Host: %s\r\n"
                "Authorization: Basic %s\r\n\r\n",
                memberId.c_str(), NTFY_HOST, auth.c_str());

  // status + headers
  String status = client.readStringUntil('\n');
  Serial.print("ntfy: " + status);
  if (status.indexOf(" 200") < 0) {
    // 401/403 = bad or rotated credentials — slow purple blink, retry rarely
    client.stop();
    for (int i = 0; i < 30; i++) {
      setLed((i & 1) ? CRGB::Purple : CRGB::Black);
      if (buttonDown()) break;
      delay(1000);
    }
    return;
  }
  while (client.connected()) {
    String h = client.readStringUntil('\n');
    if (h == "\r" || h.isEmpty()) break;
  }

  setLed(CRGB(0, 0, 24)); // armed
  uint32_t lastRx = millis();
  String line;
  while (client.connected() || client.available()) {
    // long-press (5s) anywhere = factory reset
    if (buttonDown()) {
      uint32_t t0 = millis();
      while (buttonDown()) {
        if (millis() - t0 > 5000) {
          setLed(CRGB::White);
          buzz(440, 400);
          factoryReset();
        }
        delay(10);
      }
    }
    while (client.available()) {
      char c = client.read();
      lastRx = millis();
      if (c == '\n') {
        line.trim();
        if (!line.isEmpty()) {
          JsonDocument doc;
          if (deserializeJson(doc, line) == DeserializationError::Ok &&
              strcmp(doc["event"] | "", "message") == 0) {
            handleMessage(doc);
          }
        }
        line = "";
      } else if (line.length() < 4000) {
        line += c;
      }
    }
    if (alarming) runAlarm();
    if (millis() - lastRx > STALL_MS) {
      Serial.println("stream stalled — reconnecting");
      break;
    }
    delay(20);
  }
  client.stop();
  Serial.println("stream closed");
}

// ----------------------------------------------------------------------- main

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT);
  FastLED.addLeds<SK6812, PIN_LED, GRB>(&led, 1);
  FastLED.setBrightness(255);
  ledcSetup(BUZZ_CH, 2000, 10);
  ledcAttachPin(PIN_BUZZER, BUZZ_CH);

  // button held at power-on = factory reset
  if (buttonDown()) {
    delay(3000);
    if (buttonDown()) {
      setLed(CRGB::White);
      buzz(440, 400);
      factoryReset();
    }
  }

  runPortalIfNeeded();
  Serial.printf("pager for '%s' as '%s'\n", memberId.c_str(), devUser.c_str());
  buzz(1047, 80); // power-on chirp
  buzz(1568, 80);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setLed(CRGB::Yellow);
    WiFi.reconnect();
    for (int i = 0; i < 100 && WiFi.status() != WL_CONNECTED; i++) delay(100);
    if (WiFi.status() != WL_CONNECTED) { delay(5000); return; }
  }
  streamLoop(); // returns on disconnect; loop reconnects
  delay(2000);
}
