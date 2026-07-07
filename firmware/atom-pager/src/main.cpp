// SUBFROST hardware pager — M5Stack Atom Echo S3R (built-in speaker).
//
// Subscribes to the owner's ntfy topics (page-<id> + page-all) on
// https://page.subfrost.io over a streaming /json connection and turns pages
// into noise:
//   urgent (priority >= 4): siren until the top button is pressed; the press
//     POSTs the page's ACK action URL, which marks the page acknowledged in
//     /admin/pager and stops the server-side repeats.
//   info: three short beeps, no ack required.
//
// First boot (or after a 5s button hold): AP "SUBFROST-PAGER", captive portal
// collects Wi-Fi + member id + device credentials (issued by the "📟 Device"
// button in /admin/pager). Stored in NVS.
//
// Sound comes from the EchoS3R's built-in speaker (ES8311 codec + NS4150B
// amp) — no external buzzer unit needed. No user LED, so all status is audible:
//   two rising chirps      = powered up, connected, armed
//   slow lone beep (x3)    = setup portal open (join AP SUBFROST-PAGER)
//   descending two-tone    = ntfy rejected credentials — re-provision
//   siren                  = urgent page, press button
//   three mid beeps        = info page
//   rising chirp after ack = ACK delivered

#include <Arduino.h>
#include <HTTPClient.h>
#include <M5EchoBase.h>
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <base64.h>

// ---- hardware (Atom Echo S3R) ----
static const int PIN_BUTTON = 41;  // top button, active LOW
static const int PIN_AMP_EN = 18;  // NS4150B amplifier enable
static const int PIN_BUZZER = 2;   // optional Grove passive buzzer; harmless if absent
static const int BUZZ_CH = 0;
// ES8311 codec: I2C SDA 45 / SCL 0; I2S WS 3, BCLK 17, ESP->codec data 48,
// codec->ESP data 4 (verified on hardware — the datasheet names are ambiguous).
static const int SAMPLE_RATE = 16000;

static const char *NTFY_HOST = "page.subfrost.io";
static const uint32_t STALL_MS = 150000; // ntfy keepalives every ~45s; 150s silent = dead

Preferences prefs;
String memberId, devUser, devPass;
M5EchoBase speaker;

// pending urgent page
bool alarming = false;
String pendingAckUrl;

// Blocking tone (max 500ms per call) through the built-in speaker, doubled
// on the Grove buzzer when one is plugged in — louder, and a fallback if
// either transducer dies.
static void buzz(uint32_t freq, uint32_t ms) {
  static int16_t buf[SAMPLE_RATE / 2];
  size_t n = min((size_t)(ms * SAMPLE_RATE / 1000), sizeof(buf) / sizeof(buf[0]));
  // Square wave at full scale — much louder than a sine on this tiny driver.
  for (size_t i = 0; i < n; i++) buf[i] = (sinf(2 * PI * freq * i / (float)SAMPLE_RATE) >= 0) ? 30000 : -30000;
  ledcWriteTone(BUZZ_CH, freq);
  speaker.play((uint8_t *)buf, n * 2); // blocks for the tone duration
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
  if (needPortal) {
    for (int i = 0; i < 3; i++) { buzz(880, 300); delay(300); } // "portal open"
  }
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
      buzz(1568, 80);
      buzz(2093, 120);
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
    for (int i = 0; i < 3; i++) { buzz(1319, 120); delay(120); } // info beeps
  }
}

// Siren until the button is pressed. Server keeps repeating the page anyway,
// so even a reboot mid-alarm re-alarms within ~90s.
static void runAlarm() {
  Serial.println("ALARM — waiting for button");
  uint32_t phase = 0;
  while (alarming) {
    buzz((phase & 1) ? 3200 : 2400, 250); // near resonance = loudest; blocks ~250ms
    phase++;
    for (int i = 0; i < 5 && alarming; i++) { // brief button poll between bursts
      if (buttonDown()) alarming = false;
      delay(2);
    }
  }
  sendAck();
  while (buttonDown()) delay(10); // wait for release
}

// --------------------------------------------------------------------- stream

// One streaming subscribe connection. HTTP/1.0 on purpose: the server then
// skips chunked encoding, so every line on the socket is one JSON event.
static void streamLoop() {
  WiFiClientSecure client;
  client.setInsecure();
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
    // 401/403 = bad or rotated credentials — descending two-tone, retry rarely
    client.stop();
    buzz(1200, 250);
    buzz(600, 500);
    for (int i = 0; i < 30 && !buttonDown(); i++) delay(1000);
    return;
  }
  while (client.connected()) {
    String h = client.readStringUntil('\n');
    if (h == "\r" || h.isEmpty()) break;
  }

  Serial.println("armed");
  uint32_t lastRx = millis();
  String line;
  while (client.connected() || client.available()) {
    // long-press (5s) anywhere = factory reset
    if (buttonDown()) {
      uint32_t t0 = millis();
      while (buttonDown()) {
        if (millis() - t0 > 5000) {
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
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_AMP_EN, OUTPUT);
  digitalWrite(PIN_AMP_EN, HIGH);
  ledcSetup(BUZZ_CH, 2000, 10);
  ledcAttachPin(PIN_BUZZER, BUZZ_CH);
  // sample_rate, i2c_sda, i2c_scl, i2s_di, i2s_ws, i2s_do, i2s_bck
  if (!speaker.init(SAMPLE_RATE, 45, 0, 4, 3, 48, 17)) Serial.println("codec init FAILED");
  speaker.setSpeakerVolume(100);
  speaker.setMute(false);

  // button held at power-on = factory reset
  if (buttonDown()) {
    delay(3000);
    if (buttonDown()) {
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
    WiFi.reconnect();
    for (int i = 0; i < 100 && WiFi.status() != WL_CONNECTED; i++) delay(100);
    if (WiFi.status() != WL_CONNECTED) { delay(5000); return; }
  }
  streamLoop(); // returns on disconnect; loop reconnects
  delay(2000);
}
