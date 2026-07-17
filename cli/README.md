# subfrost CLI

`subfrost` is the command-line client for the subfrost.io admin platform. It
drives the same `/api/v1/*` (Bearer-key) and `x-admin-secret` bootstrap routes
the `/admin` web UI uses. A key's authority is always **its scopes ∩ its
owner's privileges**.

This is a **vendored slice of the [pyrosec/tlsfetch](https://github.com/pyrosec/tlsfetch)
workspace** — the `subfrost-cli` crate plus the minimal `tlsfetch-common` /
`-sys` HTTP client and the vendored `rustls` / `h2` / `quinn` / `h3` forks it
needs. Those forks (swapped in via the `[patch.crates-io]` block in
`cli/Cargo.toml`) are what make the Chrome ClientHello + JA3/JA4 fingerprint
emulation take effect on the wire, so the CLI presents a real-browser handshake
to the subfrost.io tlsd ingress (which is HTTP/1.1-only and forwards the inbound
TLS fingerprint).

`~/tlsfetch` remains the source of truth; re-vendor from there when bumping.

## Build

```bash
cd cli
cargo build --release -p subfrost-cli   # → cli/target/release/subfrost
```

## Authenticate

```bash
export SUBFROST_API_URL=https://subfrost.io   # default
export SUBFROST_API_KEY=sk_xxxxxxxx           # personal Bearer key
subfrost whoami
```

Get a key from `https://subfrost.io/admin/profile` → **API keys & CLI**, or via
the `x-admin-secret` bootstrap route (`SUBFROST_ADMIN_SECRET`). Config can also
live in `~/.config/subfrost/config.toml` (`api_url` / `api_key` / `admin_secret`).

## Command groups

`users`, `keys`, `sessions`, `fuel`, `codes`, `communities`, `articles`,
`audit`, `kyc`, `fincen`, `mtl`, `billing`, `financials`, `documents`, `files`,
`whoami`. Add `--json` for machine-readable output. Every command is gated by
the same IAM privilege as its web counterpart.

```bash
# Upload an article as a draft (JSON in ArticleInput shape) and preview it
subfrost --json articles upload article.json
# → open https://subfrost.io/admin/articles/<id>/preview
```
