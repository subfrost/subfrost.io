# subfrost-cli

`subfrost` — a CLI for subfrost.io admin operations, at full parity with the
subfrost.io admin webapp. Built on
[tlsfetch](../..)'s fingerprint-emulating HTTP client.

It drives the `/api/v1` Bearer-key REST API (`Authorization: Bearer sk_...`).
Every command maps to exactly one documented endpoint.

## Why it lives in the tlsfetch workspace

The CLI uses tlsfetch's `HttpClient`, which presents a real Chrome 144 TLS
ClientHello (matching JA3) + `h2`/`http/1.1` ALPN. That only takes effect
when the consumer inherits the workspace `[patch.crates-io]` block (the
vendored rustls/h2 forks). So this crate is a member of the tlsfetch
workspace rather than a standalone repo.

## Auth & configure

The CLI needs a base URL plus a credential. There are two auth modes:

- **Bearer API key** (preferred, for the `/api/v1` REST surface): set
  `SUBFROST_API_KEY` (an `sk_...` key). The client sends
  `Authorization: Bearer <key>`.
- **Admin secret** (the bootstrap routes only): set `SUBFROST_ADMIN_SECRET`
  (the app's `ADMIN_SECRET`). The client sends it as the `x-admin-secret`
  header. Used to mint the first API key — see **Bootstrapping**.

When both are present the Bearer key wins. At least one must be set.

Resolution order (per field, first hit wins):

1. Environment: `SUBFROST_API_URL`, `SUBFROST_API_KEY`,
   `SUBFROST_ADMIN_SECRET`.
2. `~/.config/subfrost/config.toml` (respects `XDG_CONFIG_HOME`):

   ```toml
   api_url      = "https://subfrost.io"
   api_key      = "sk_..."          # Bearer key for /api/v1
   admin_secret = "your-admin-secret"  # only needed for bootstrapping
   ```

`SUBFROST_API_URL` defaults to `https://subfrost.io`. An `http://` base URL
(e.g. a local `next dev` server) is dialed in plaintext; `https://` URLs get
the Chrome fingerprint + browser ALPN.

## Build & run

```sh
cargo build -p subfrost-cli
./target/debug/subfrost --help
```

## Bootstrapping (minting the first key)

The `/api/v1` surface needs an API key, but you mint the first one via the
`x-admin-secret`-gated bootstrap route:

```sh
export SUBFROST_ADMIN_SECRET=your-admin-secret
# POST /api/admin/keys returns the new key's token once:
./target/debug/subfrost --json ... # (or curl the route directly)

# Then switch to Bearer auth for everything else:
export SUBFROST_API_KEY=sk_...
unset SUBFROST_ADMIN_SECRET
```

Today `keys create` targets `/api/v1/keys` (Bearer). To bootstrap before you
have any key, hit the bootstrap route directly, e.g.:

```sh
curl -s https://subfrost.io/api/admin/keys \
  -H "x-admin-secret: $SUBFROST_ADMIN_SECRET" \
  -H 'content-type: application/json' \
  -d '{"name":"bootstrap"}'
```

then `export SUBFROST_API_KEY=sk_...` from the returned token.

## Commands

All commands accept a global `--json` flag (raw JSON instead of a table).
Mutation commands expose typed flags for common fields plus a `--data
'<json>'` escape hatch whose object fields are merged over (and override) the
typed flags.

### whoami

| Command | Endpoint |
| --- | --- |
| `whoami` | `GET /api/v1/me` (prints id, email, role, keyId, privileges) |

### users

| Command | Endpoint |
| --- | --- |
| `users list` | `GET /api/v1/users` |
| `users get <id>` | `GET /api/v1/users/:id` |
| `users create --email <e> [--name] [--role] [--password] [--privileges …] [--data]` | `POST /api/v1/users` (no password ⇒ server returns `tempPassword`) |
| `users update <id> [--name] [--role] [--active <bool>] [--privileges …] [--data]` | `PATCH /api/v1/users/:id` |
| `users delete <id>` | `DELETE /api/v1/users/:id` |
| `users set-password <id> --password <p>` | `POST /api/v1/users/:id/password` |

### keys

| Command | Endpoint |
| --- | --- |
| `keys list` | `GET /api/v1/keys` |
| `keys create [--name] [--scopes …] [--expires-in-days <n>] [--data]` | `POST /api/v1/keys` (returns `token` once) |
| `keys delete <id>` | `DELETE /api/v1/keys/:id` |

### sessions

| Command | Endpoint |
| --- | --- |
| `sessions list --user <id>` | `GET /api/v1/sessions?user=<id>` |
| `sessions revoke-all --user <id>` | `DELETE /api/v1/sessions?user=<id>` |
| `sessions revoke <id> --user <id>` | `DELETE /api/v1/sessions/:id?user=<id>` |

### fuel

| Command | Endpoint |
| --- | --- |
| `fuel list` | `GET /api/v1/fuel` |
| `fuel set [--user] [--amount] [--data]` | `POST /api/v1/fuel` (upsert) |
| `fuel delete <id>` | `DELETE /api/v1/fuel/:id` |

### codes

| Command | Endpoint |
| --- | --- |
| `codes list` | `GET /api/v1/codes` |
| `codes tree` | `GET /api/v1/codes/tree` |
| `codes redemptions` | `GET /api/v1/codes/redemptions` |
| `codes create [--code] [--max-uses] [--data]` | `POST /api/v1/codes` |
| `codes bulk --data '<json>'` | `POST /api/v1/codes/bulk` |
| `codes update <id> [--active <bool>] [--max-uses] [--data]` | `PATCH /api/v1/codes/:id` |
| `codes delete <id>` | `DELETE /api/v1/codes/:id` |

### communities

| Command | Endpoint |
| --- | --- |
| `communities list` | `GET /api/v1/communities` |
| `communities get <rootId>` | `GET /api/v1/communities/:rootId` |

### kyc

| Command | Endpoint |
| --- | --- |
| `kyc list` | `GET /api/v1/kyc` |
| `kyc rescreen [--data]` | `POST /api/v1/kyc/rescreen` |
| `kyc disposition <id> [--decision] [--note] [--data]` | `POST /api/v1/kyc/:id/disposition` |
| `kyc sync [--data]` | `POST /api/v1/kyc/sync` |

### fincen

| Command | Endpoint |
| --- | --- |
| `fincen list` | `GET /api/v1/fincen` |
| `fincen sar [--data]` | `POST /api/v1/fincen/sar` |
| `fincen sar-update <id> [--data]` | `PATCH /api/v1/fincen/sar/:id` |
| `fincen ctr [--data]` | `POST /api/v1/fincen/ctr` |
| `fincen ctr-update <id> [--data]` | `PATCH /api/v1/fincen/ctr/:id` |
| `fincen queue --draft-id <id>` | `POST /api/v1/fincen/queue` |

### mtl

| Command | Endpoint |
| --- | --- |
| `mtl list` | `GET /api/v1/mtl` |
| `mtl seed [--data]` | `POST /api/v1/mtl/seed` |
| `mtl update <id> [--data]` | `PATCH /api/v1/mtl/:id` |

### billing

| Command | Endpoint |
| --- | --- |
| `billing subscriptions` | `GET /api/v1/billing/subscriptions` |
| `billing promo` | `GET /api/v1/billing/promo` |
| `billing promo-create [--data]` | `POST /api/v1/billing/promo` |
| `billing customers` | `GET /api/v1/billing/customers` |
| `billing customer <id>` | `GET /api/v1/billing/customers/:id` |
| `billing transactions` | `GET /api/v1/billing/transactions` |
| `billing balances` | `GET /api/v1/billing/balances` |
| `billing intents` | `GET /api/v1/billing/intents` |
| `billing intent-create [--data]` | `POST /api/v1/billing/intents` (queue ACH) |
| `billing intent-action <id> --action <confirm\|cancel>` | `POST /api/v1/billing/intents/:id?action=…` |
| `billing applications` | `GET /api/v1/billing/applications` |
| `billing events` | `GET /api/v1/billing/events` |

### financials

| Command | Endpoint |
| --- | --- |
| `financials treasury [--refresh]` | `GET /api/v1/financials/treasury` (`?refresh=true` with the flag) |
| `financials accounting` | `GET /api/v1/financials/accounting` |
| `financials ledger-csv` | `GET /api/v1/financials/accounting/ledger.csv` (raw CSV, printed verbatim) |
| `financials payees` | `GET /api/v1/financials/accounting/payees` |
| `financials payee-create [--data]` | `POST /api/v1/financials/accounting/payees` |
| `financials payee-update <id> [--data]` | `PATCH /api/v1/financials/accounting/payees/:id` |
| `financials invoices` | `GET /api/v1/financials/accounting/invoices` |
| `financials invoice-create [--data]` | `POST /api/v1/financials/accounting/invoices` |
| `financials invoice-status <id> [--data]` | `PATCH /api/v1/financials/accounting/invoices/:id` |
| `financials payment-record [--data]` | `POST /api/v1/financials/accounting/payments` |
| `financials equity` | `GET /api/v1/financials/equity` |
| `financials share-class-create [--data]` | `POST /api/v1/financials/equity/share-classes` |
| `financials shareholder-create [--data]` | `POST /api/v1/financials/equity/shareholders` |
| `financials holding-create [--data]` | `POST /api/v1/financials/equity/holdings` |
| `financials instrument-create [--data]` | `POST /api/v1/financials/equity/instruments` |
| `financials balance-sheet` | `GET /api/v1/financials/balance-sheet` |
| `financials bs-item-create [--data]` | `POST /api/v1/financials/balance-sheet/items` |

Cap-table mutations are creates only — updates/deletes of share classes,
shareholders, holdings, and instruments are intentionally not exposed here to
keep the surface tractable.

### documents

| Command | Endpoint |
| --- | --- |
| `documents list` | `GET /api/v1/documents` |
| `documents get <id>` | `GET /api/v1/documents/:id` |
| `documents create [--data]` | `POST /api/v1/documents` |
| `documents send <id>` | `POST /api/v1/documents/:id/send` |
| `documents void <id> [--reason <text>]` | `POST /api/v1/documents/:id/void` (body `{reason}` if set) |
| `documents resend <id>` | `POST /api/v1/documents/:id/resend` |
| `documents refresh <id>` | `POST /api/v1/documents/:id/refresh` |
| `documents templates` | `GET /api/v1/documents/templates` |
| `documents from-template [--data]` | `POST /api/v1/documents/from-template` |

### files

The Documents file manager — folders + file objects. Upload sends the raw
file bytes as the request body (not multipart); download follows the
short-lived signed GCS URL the API returns and writes the bytes locally.

| Command | Endpoint |
| --- | --- |
| `files ls [--folder <id>]` | `GET /api/v1/files?folder=<id>` (prints breadcrumb + folders then files) |
| `files mkdir <name> [--parent <id>]` | `POST /api/v1/files/folders` |
| `files upload <local-path> [--folder <id>] [--name <name>]` | `POST /api/v1/files` (raw bytes body; `X-File-Name`, `X-Folder-Id`, guessed `Content-Type`) |
| `files download <id> [--out <path>]` | `GET /api/v1/files/:id?download=1`, then GET the signed `url` → writes bytes |
| `files mv <id> --folder <id>` | `PATCH /api/v1/files/:id` (body `{folderId}`) |
| `files rename <id> <newname>` | `PATCH /api/v1/files/:id` (body `{name}`) |
| `files rm <id>` | `DELETE /api/v1/files/:id` |
| `files rmdir <id>` | `DELETE /api/v1/files/folders/:id` |
| `files meta <id> [--tag <t>...] [--data <json>]` | `PATCH /api/v1/files/:id` (body `{tags?, metadata?}`) |

### articles

| Command | Endpoint |
| --- | --- |
| `articles list` | `GET /api/v1/articles` |
| `articles delete <id>` | `DELETE /api/v1/articles/:id` |
| `articles publish <id>` | `POST /api/v1/articles/:id/publish` |
| `articles upload <file>` | `POST /api/admin/articles` (raw markdown/json body) |

### audit

| Command | Endpoint |
| --- | --- |
| `audit [--limit <n>] [--action <a>]` | `GET /api/v1/audit?limit=&action=` |
