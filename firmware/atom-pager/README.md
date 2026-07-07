# SUBFROST hardware pager (M5Stack Atom Echo)

Physical pager for the team pager system (`/admin/pager` + page.subfrost.io).
Each Echo belongs to one person: it holds a streaming connection to their ntfy
topics (`page-<id>` + `page-all`) and sirens on urgent pages until the top
button is pressed — the press fires the page's ACK URL, so the console shows ✓
and the server-side repeats stop.

One firmware image serves all devices; identity is entered per-device in a
Wi-Fi setup portal, so nothing secret lives in this repo or the binary.

## Hardware

- M5Stack **Atom Echo S3R** (ESP32-S3; USB id 303a:8000) — nothing else.
  Alarms play through the built-in speaker (ES8311 codec, amp enable G18;
  I2C 45/0, I2S WS 3 / BCLK 17 / data-out 48 — pin map verified on hardware).
- USB-C power (no battery — this is a desk pager). Use a USB-A→C data cable
  for flashing; the board has no CC resistors, so C-to-C often gets no power.

## Flash (once per device, identical for all 5)

1. Put the board in download mode: hold the reset button ~2 s until the
   internal green LED lights, then release. It enumerates as
   `Espressif USB JTAG/serial` → `/dev/ttyACM0` (user must be in `dialout`).
2. ```sh
   cd firmware/atom-pager
   pio run -t upload --upload-port /dev/ttyACM0
   pio device monitor           # optional: watch logs at 115200
   ```
3. **Unplug and replug the device** — the download-mode latch survives
   esptool's software reset, so until a physical power cycle the app does
   not start (the board sits silently in the bootloader).

## Provision (once per person)

1. In `/admin/pager`, click **📟 Device** next to the person → note the
   member id, device username (`dev-<id>`) and one-time device password.
   (Re-clicking rotates the password; an already-configured device stops
   working and must be re-provisioned.)
2. Power the Echo. **Three slow beeps** = it broadcasts Wi-Fi AP
   `SUBFROST-PAGER`.
3. Join that AP; the setup page opens (or go to `192.168.4.1`). Choose the
   office Wi-Fi, enter its password plus the three values from step 1. Save.
4. **Two rising chirps** = connected and armed. Send a test page from the
   console; the Echo should siren and the button-press should show ✓ ACK.

## Sound / button reference (built-in speaker; the S3R has no user LED)

| Signal | Meaning |
| --- | --- |
| Three slow beeps | Setup portal active (AP `SUBFROST-PAGER`) |
| Descending two-tone | ntfy rejected the credentials — re-provision |
| Two rising chirps | Connected, armed |
| Siren | Urgent page — **press the button to ACK** |
| Three mid beeps | Info page (no ack needed) |
| Rising chirp after button | ACK delivered |
| Low beep | Factory reset triggered |

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
