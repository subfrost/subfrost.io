# SUBFROST hardware pager (M5Stack Atom Echo)

Physical pager for the team pager system (`/admin/pager` + page.subfrost.io).
Each Echo belongs to one person: it holds a streaming connection to their ntfy
topics (`page-<id>` + `page-all`) and sirens on urgent pages until the top
button is pressed — the press fires the page's ACK URL, so the console shows ✓
and the server-side repeats stop.

One firmware image serves all devices; identity is entered per-device in a
Wi-Fi setup portal, so nothing secret lives in this repo or the binary.

## Hardware

- M5Stack **Atom Echo** (ESP32-PICO)
- M5Stack **passive buzzer unit**, plugged into the Grove port (signal on
  G26 — if it stays silent, change `PIN_BUZZER` to 32)
- USB-C power (no battery — this is a desk pager)

## Flash (once per device, identical for all 5)

```sh
cd firmware/atom-pager
pio run -t upload            # PlatformIO CLI; device on /dev/ttyUSB0 or ACM0
pio device monitor           # optional: watch logs at 115200
```

## Provision (once per person)

1. In `/admin/pager`, click **📟 Device** next to the person → note the
   member id, device username (`dev-<id>`) and one-time device password.
   (Re-clicking rotates the password; an already-configured device stops
   working and must be re-provisioned.)
2. Power the Echo. LED **purple** = it broadcasts Wi-Fi AP `SUBFROST-PAGER`.
3. Join that AP; the setup page opens (or go to `192.168.4.1`). Choose the
   office Wi-Fi, enter its password plus the three values from step 1. Save.
4. LED goes **dim blue** = connected and armed. Send a test page from the
   console; the Echo should siren and the button-press should show ✓ ACK.

## LED / button reference

| Signal | Meaning |
| --- | --- |
| Purple steady | Setup portal active (AP `SUBFROST-PAGER`) |
| Purple blinking | ntfy rejected the credentials — re-provision |
| Yellow | Connecting to Wi-Fi / ntfy |
| Dim blue | Armed, listening |
| Red strobe + siren | Urgent page — **press the button to ACK** |
| Cyan blinks + 3 beeps | Info page (no ack needed) |
| Green + chirp | ACK delivered |

Button: short press during alarm = ACK. Hold **5 s** (anytime, or at
power-on) = factory reset, back to the setup portal.

## Design notes

- Devices authenticate as a dedicated read-only ntfy user `dev-<id>` (created
  by `/api/admin/pager/members/device`), separate from the member's phone
  login, so either credential can be rotated independently.
- The subscribe request is deliberately HTTP/1.0: ntfy then streams plain
  newline-delimited JSON without chunked framing, which keeps the parser tiny.
- No `since=` catch-up on reconnect: urgent pages repeat every ~90 s until
  acked (see `lib/pager/send.ts`), so a briefly offline device still alarms.
- TLS is unvalidated (`setInsecure`) — acceptable here: the device only ever
  *receives* pages and posts an unguessable single-purpose ACK token.
