# tlsfetch-timeout

Lazy-init shared-timer timeout primitive. Drop-in faster replacement for
`tokio::time::timeout`.

## Attribution

This crate is adapted from
[cloudflare/pingora-timeout](https://github.com/cloudflare/pingora) at the
revision currently cloned at `~/pingora/pingora-timeout/` (Apache-2.0).

The code is lifted with minor renames; no algorithmic changes. The crate
keeps the upstream license (Apache-2.0) — the rest of the tlsfetch
workspace is MIT, but this one crate inherits Apache-2.0 from upstream.

## Divergence list

- `pingora_timeout::*` → `tlsfetch_timeout::*` paths.
- Timer thread name `"Timer thread"` → `"tlsfetch-timer"` for easier `top -H` correlation.
- Slight test rewording + a handful of additional tests that don't rely on multi-second sleeps (`#[ignore]`d the slow watchdog test).
- Dropped the `benches/` directory; pingora's published numbers stand. (We'd add a `criterion` bench if our own profiling ever needed it.)

## Why we vendored instead of depending on pingora-timeout

The tlsd plan keeps `pingora-*` out of our dependency graph (see
`~/.claude/plans/stateful-tinkering-tarjan.md` "Why we keep pingora-* out").
Vendoring this one leaf crate is cheap (~600 LOC), it has no other pingora
deps, and it lets the rest of the tlsfetch workspace replace
`tokio::time::timeout` consistently without splitting Cargo.toml semantics
across "ours" and "pingora's".

## Usage

```rust
use tlsfetch_timeout::{timeout, sleep};
use std::time::Duration;

let result = timeout(Duration::from_secs(5), some_async_op()).await;
sleep(Duration::from_millis(100)).await;
```

Both create a tokio clock thread named `tlsfetch-timer` on first use.
