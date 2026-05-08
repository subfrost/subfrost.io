# subfrost.io meeting stack (Rust)

Pure-Rust meeting backend, ported in spirit from `~/snorchat.xyz` and built on top
of `~/ghostmobile/rust/gh0stdial-core`'s WebRTC primitives. Replaces the Node-side
`media-server/` (which stays in place for HLS streams — different concern).

## Workspace layout

```
rust/
├── crates/
│   ├── subfrost-meet-proto/           # wire schema (auth, rtc, room)
│   ├── subfrost-meet-wallet-verify/   # BIP-322 simple + BIP-137 verification
│   └── subfrost-meet-session/         # HMAC-signed bearer tokens
├── services/
│   └── meet-api/                      # axum HTTP: auth, signaling, TURN cred mint
└── deploy/
    └── local/docker-compose.yaml      # meet-api + redis + coturn for local dev
```

Future: `services/meet-sfu/` (RTP forwarder built on `gh0stdial-core`'s ICE/DTLS/SRTP).

## Local dev

```sh
docker compose -f rust/deploy/local/docker-compose.yaml up --build
```

Smoke test:

```sh
curl -s http://localhost:8080/healthz
# ok

curl -s -X POST http://localhost:8080/v1/auth/challenge \
  -H content-type:application/json \
  -d '{"address":"bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0z","action":"join test-room"}'
```

## Deploy target

Single Aliyun HK ECS (`cn-hongkong`) running `meet-api + redis + coturn` via
`docker compose`. No CDN. GeoDNS routes CN clients to HK; rest of world stays
on the existing infra.

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MEET_API_BIND` | no | `0.0.0.0:8080` | |
| `MEET_API_SESSION_SECRET` | yes | — | ≥32 bytes, HMAC-SHA256 key for bearer signing |
| `MEET_API_TURN_SECRET` | yes | — | shared with coturn `use-auth-secret` |
| `MEET_API_TURN_URLS` | no | HK defaults | comma-separated TURN URIs |
| `MEET_API_TURN_TTL_SECS` | no | `3600` | TURN credential lifetime |
| `MEET_API_BEARER_TTL_MS` | no | 24h | session bearer lifetime |
| `MEET_API_REDIS_URL` | no | `redis://127.0.0.1:6379` | |
| `MEET_API_CHALLENGE_TTL_SECS` | no | `300` | wallet-challenge freshness window |
