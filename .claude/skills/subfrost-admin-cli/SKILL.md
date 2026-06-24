---
name: subfrost-admin-cli
description: >-
  Operating blueprint for the `subfrost` admin CLI — drive every subfrost.io
  admin/IAM/billing/compliance/financials operation programmatically over the
  /api/v1 REST API. Use this when asked to manage users, roles & privileges,
  API keys, sessions/devices, fuel allocations, referral codes, communities,
  articles, the audit log, KYC/FinCEN/MTL compliance, billing, financials
  (treasury/accounting/cap-table/balance-sheet), or e-sign documents from the
  command line instead of the /admin web UI.
---

# subfrost admin CLI

`subfrost` is the command-line client for the subfrost.io admin platform. It
talks to the Bearer-key REST API at `/api/v1/*` and can do everything the
`/admin` web UI does. A key's authority is always **its scopes ∩ its owner's
privileges** — the CLI can never do more than the key's owner can in the UI.

## 1. Get the binary

The CLI is the `subfrost-cli` crate in the **pyrosec/tlsfetch** workspace
(binary name `subfrost`). It vendors tlsfetch as its HTTP client.

```bash
# from a tlsfetch checkout:
cargo build -p subfrost-cli --release      # → target/release/subfrost
cp target/release/subfrost ~/.local/bin/   # or anywhere on $PATH
subfrost --help
```

## 2. Authenticate

Two env vars (or `~/.config/subfrost/config.toml` with `api_url` / `api_key`):

```bash
export SUBFROST_API_URL=https://subfrost.io   # default; override for staging/local
export SUBFROST_API_KEY=sk_xxxxxxxx           # your personal key
```

**Get a key** — two ways:
- **Self-service (recommended):** log into `https://subfrost.io/admin/profile` →
  **"API keys & CLI"** → create a key (optionally scoped to a subset of your
  privileges). The token is shown once. Any user can do this; the key is capped
  to your privileges.
- **Bootstrap (no key yet):** with the shared `ADMIN_SECRET`,
  `POST /api/admin/keys` mints an unscoped key for an existing user
  (`{"email":"you@subfrost.io"}`) — it inherits that user's full privileges.

Verify: `subfrost whoami` → your id, email, role, and effective scopes.

## 3. Conventions

- Global `--json` prints raw JSON (otherwise a table for lists / key:value for
  objects). Use `--json` when you need to parse output.
- Create/update commands take typed flags **plus** a `--data '<json>'` escape
  hatch that merges arbitrary fields over the flags (for fields without a flag).
- Every command is gated by the **same IAM privilege** as its web counterpart
  (listed below). A missing scope returns `403 Insufficient scope: requires '<priv>'`.
- `financials.view` and `billing.treasury_view` are **restricted** privileges:
  they are NOT in the ADMIN role bundle and must be granted explicitly per-user.

## 4. Command reference

`subfrost <group> <command> [args] [--json]`. Privilege needed in (parens).

### whoami
- `subfrost whoami` — identity + effective scopes of your key. (any key)

### users  (IAM)
- `users list` (`iam.list_users`)
- `users get <id>` (`iam.list_users`)
- `users create --email <e> [--name <n>] [--role ADMIN|EDITOR|AUTHOR|STAFF] [--password <p>] [--privileges <code>...]` — no `--password` ⇒ a temp password is returned once. (`iam.create_user`; role/privs also need `iam.manage_roles`)
- `users update <id> [--name <n>] [--role <r>] [--active true|false] [--privileges <code>...] [--data <json>]` (`iam.modify_user`; role/privs need `iam.manage_roles`)
- `users set-password <id> --password <p>` (`iam.modify_user`)
- `users delete <id>` (`iam.delete_user`)

### keys  (API keys)
- `keys list` · `keys create --name <n> [--scopes <code>...] [--expires-days <N>]` (token shown once) · `keys delete <id>`  (`apikeys.manage`)

### sessions  (devices)
- `sessions list --user <id>` · `sessions revoke-all --user <id>` · `sessions revoke <sessionId> --user <id>`  (`iam.manage_sessions`)

### fuel
- `fuel list` (`fuel.read`) · `fuel set --data '<json>'` (`fuel.edit`) · `fuel delete <id>` (`fuel.edit`)

### codes  (referral)
- `codes list` · `codes tree` · `codes redemptions`  (`referral.read`)
- `codes create --data <json>` · `codes bulk --data <json>` · `codes update <id> --data <json>` · `codes delete <id>`  (`referral.edit`)

### communities
- `communities list` · `communities get <rootId>`  (`referral.read` OR `fuel.read`)

### articles
- `articles list` (any key) · `articles delete <id>` · `articles publish <id>` (`articles.edit_any` or own) · `articles upload <file.md>` (`articles.write`)

### audit
- `audit [--limit <N>] [--action <name>]`  (`audit.view`)

### kyc / fincen / mtl  (compliance)
- `kyc list` (`aml.read`) · `kyc rescreen` · `kyc disposition <id> --data <json>` · `kyc sync`  (`aml.edit`)
- `fincen list` (`aml.read`) · `fincen sar --data` · `fincen sar-update <id> --data` · `fincen ctr --data` · `fincen ctr-update <id> --data` · `fincen queue --draft-id <id>`  (`aml.edit`)
- `mtl list` (`aml.read`) · `mtl seed` · `mtl update <id> --data <json>`  (`aml.edit`)

### billing
- reads (`billing.read`): `billing subscriptions` · `promo` · `customers` · `customer <id>` · `transactions` · `balances` · `intents` · `applications` · `events`
- writes (`billing.edit`): `billing promo-create --data` · `billing intent-create --data` (queue ACH) · `billing intent-action <id> --action confirm|cancel`

### financials  (all `financials.view` — RESTRICTED)
- reads: `financials treasury [--refresh]` · `accounting` · `ledger-csv` · `payees` · `invoices` · `equity` · `balance-sheet`
- writes: `payee-create --data` · `payee-update <id> --data` · `invoice-create --data` · `invoice-status <id> --data` · `payment-record --data` · `share-class-create --data` · `shareholder-create --data` · `holding-create --data` · `instrument-create --data` · `bs-item-create --data`

### documents  (e-sign)
- `documents list` · `get <id>` · `templates`  (`documents.read`)
- `documents create --data` · `send <id>` · `void <id> [--reason <t>]` · `resend <id>` · `refresh <id>` · `from-template --data`  (`documents.write`)

## 5. Common workflows

```bash
# Who am I / what can this key do
subfrost whoami

# Provision a staff user (temp password returned once)
subfrost users create --email newhire@subfrost.io --name "New Hire" --role STAFF

# Mint a least-privilege CI key (read-only fuel) and use it
subfrost keys create --name ci-fuel --scopes fuel.read
SUBFROST_API_KEY=sk_... subfrost fuel list

# Investigate a user's devices, then sign them out everywhere
subfrost sessions list --user <userId> --json
subfrost sessions revoke-all --user <userId>

# Audit trail of the last 50 IAM events
subfrost audit --limit 50 --action update_user --json

# Pull the accounting ledger as CSV
subfrost financials ledger-csv > ledger.csv
```

## 6. Troubleshooting

- `403 Insufficient scope: requires '<priv>'` — your key's owner (or the key's
  scopes) lacks that privilege. Grant it in `/admin/users`, or mint a key whose
  scopes include it (you can only scope a key to privileges you hold).
- `financials …` 403 even as ADMIN — `financials.view` is **restricted**; it must
  be granted explicitly (same for treasury via `billing.treasury_view`).
- The subfrost.io ingress (tlsd) is **HTTP/1.1-only**; the CLI offers `http/1.1`
  ALPN accordingly. If you point it at an h2-only server, expect an ALPN error.
- `documents templates` may 502 if the upstream e-sign provider (Documenso) is
  down — the route surfaces the upstream status; retry later.
