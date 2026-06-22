# Financials › Treasury (design)

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branch: `feat/financials-treasury`

## Context

flex wants a **Financials** section in the subfrost.io `/admin` to produce stats for a
**409A**. It has three pages — **Treasury**, **Reserve**, **Revenue** — with very different
data sources, so the feature is decomposed into one sub-project per page (each its own
spec → plan → build). **This spec is sub-project 1: Treasury.** It also introduces the
shared **Financials nav group** that Reserve/Revenue will hang off later.

Web-admin / data surface, **not** on-chain writes (read-only).

## Goal

`/admin/financials/treasury` shows the **on-chain holdings of two BSC (BEP20) treasury
wallets** — native BNB + every BEP20 token with a non-zero balance — valued in **USD**,
broken down per wallet with a grand total. Current snapshot, read-only, cached.

## Decisions (locked during brainstorming)

1. **Show everything held** — native BNB + all BEP20 tokens with balance > 0,
   auto-discovered, valued in USD. (Not a hand-curated token list.)
2. **Data provider = GoldRush (Covalent)** `balances_v2` — one call per address returns
   native + all token balances **with USD quotes**, which maps exactly to "everything + USD."
3. **Snapshot only** for v1 — no historical balance-over-time (no DB table, no snapshot job).
   History, if wanted, is a later iteration (over-time charting belongs more to Reserve).
4. **IAM is flex's lane.** He is building the Financials gating (auditor-grantable, hidden
   from general staff). We do **not** add the privilege or a migration; our nav/pages
   **consume** his financials privilege. Nav-wiring + gating are the **last** build step
   (can't reference an enum value before it exists), pending his IAM landing / the name.

## Non-goals (explicitly out of scope)

- **No IAM / privilege / migration** — flex owns it (see Decision 4).
- **No history / time-series** — snapshot only (Decision 3).
- **No write actions** — read-only dashboard. No moving funds, no tx construction.
- **No multi-chain** — BSC only for these two wallets. (Reserve/Revenue are separate.)
- **No price math of our own** — USD comes from GoldRush `quote`; we don't run a price oracle.
- **No Reserve/Revenue** — separate sub-projects/specs.

## Architecture (mirrors the existing `lib/stripe/` source/shape split)

### `lib/financials/treasury/config.ts`
The two BSC addresses (provisional — Vitor 2026-06-22, ~90%; flex may change) + optional
labels. A plain constant so it's testable and a one-line change to update:
```ts
export const TREASURY_WALLETS: { address: string; label?: string }[] = [
  { address: "0x74deeb5b221f257532e3ba1483dc214605025b81" },
  { address: "0x35E18d19c8B63B168B6049ed0a97073A847CE9e4" },
]
export const BSC_CHAIN = "bsc-mainnet"
```

### `lib/financials/treasury/shapes.ts` (pure — unit-tested, no network)
Types + a **pure normalizer** `normalizeBalances(goldrushItems, address, label?) → TreasuryWallet`:
```ts
interface TreasuryToken { contract: string; symbol: string; name: string; amount: number; usd: number | null; isNative: boolean; logo?: string }
interface TreasuryWallet { address: string; label?: string; totalUsd: number; tokens: TreasuryToken[] }
interface TreasurySnapshot { wallets: TreasuryWallet[]; grandTotalUsd: number; fetchedAt: string }
```
Normalizer rules: `amount = Number(balance) / 10**contract_decimals`; `usd = quote ?? null`;
**keep** non-spam items with `amount > 0`; **drop** `is_spam` and zero-balance; native token
(`native_token: true`) → `isNative`; sort tokens by `usd` desc (nulls last); `totalUsd` =
sum of known `usd`; tokens with no price contribute 0 to the total but still show (flagged
"no price").

### `lib/financials/treasury/source/live.ts`
`fetchWalletBalances(address): Promise<TreasuryWallet>` — GoldRush call + normalize:
- `GET https://api.covalenthq.com/v1/${BSC_CHAIN}/address/${address}/balances_v2/?quote-currency=USD`
- Auth header `Authorization: Bearer ${process.env.GOLDRUSH_API_KEY}`.
- Throws a typed error on non-OK / missing key (caller degrades — never 500).

`fetchTreasurySnapshot(): Promise<TreasurySnapshot>` — `Promise.all` over `TREASURY_WALLETS`,
assemble `grandTotalUsd` + `fetchedAt`.

### `actions/cms/financials.ts`
`treasuryOverviewAction(): Promise<TreasuryResult>` — gated on the financials privilege
(Decision 4), **Redis-cached** (`lib/redis`, key `financials:treasury`, TTL 300s) with a
**last-good** fallback key (24h) so a GoldRush blip serves the previous snapshot instead of
an error. Result is a discriminated union: `{ ok: true; snapshot; stale?: boolean }` |
`{ ok: false; error: "unauthorized" | "not_configured" | "upstream" }`.

### UI
- `app/admin/financials/treasury/page.tsx` — server shell: `currentUser()` → login redirect;
  privilege check → `/admin`; renders `<TreasuryManager>`. `force-dynamic`.
- `components/cms/financials/TreasuryManager.tsx` — grand total (USD) on top, then a card per
  wallet (label/address, wallet total, token rows: logo, symbol, amount, USD), tokens sorted
  by USD desc; a **Refresh** control (re-invokes the action, bypassing cache); a "stale"
  badge when served from last-good; an empty/degraded state when `not_configured`/`upstream`.

### `lib/cms/admin-nav.ts`
New top-level group **"Financials"** (icon e.g. `Banknote`/`Coins`) with a **"Treasury"** leaf
(`/admin/financials/treasury`), gated on flex's financials privilege. **This wiring is the
last task** (see Decision 4). Existing "Treasury" under Billing (Stripe) is unaffected —
different group, different context.

## Data flow

```
treasuryOverviewAction (gated, cached)
  ├─ cache hit (≤5min) → snapshot
  └─ miss → fetchTreasurySnapshot
              ├─ for each wallet: GoldRush balances_v2?quote-currency=USD  (Bearer GOLDRUSH_API_KEY)
              │     → normalizeBalances → TreasuryWallet (BNB + BEP20, USD, spam/zero filtered)
              ├─ sum grandTotalUsd
              ├─ success → cache (300s) + last-good (24h) → snapshot
              └─ error → serve last-good (stale:true) else { ok:false, error:"upstream" }
```

## Error handling

| Condition | Behavior |
|---|---|
| caller lacks the financials privilege | `{ ok:false, error:"unauthorized" }` (page already redirected; defense in depth) |
| `GOLDRUSH_API_KEY` unset | `{ ok:false, error:"not_configured" }` → page shows "Treasury API key not configured" |
| GoldRush non-OK / network / timeout | serve last-good (`stale:true`) if cached, else `{ ok:false, error:"upstream" }` |
| a token has no `quote` (no price) | included, shown, `usd:null` ("no price"), contributes 0 to total |

Never throws to a 500; degrades like the SP-3 onramp / wallet-state last-good pattern.

## Secret / deploy (same pattern as FUEL / SP-4)

- `GOLDRUSH_API_KEY` → GCP Secret Manager (`goldrush-api-key`) → `k8s/external-secrets.yaml`
  (only after the secret exists — ESO is atomic) → `k8s/deployment.yaml` env (`optional: true`,
  mirroring `STRIPE_*` / `FUEL_API_KEY`). Code ships with it optional → page degrades to
  "not configured" until set, so the build/merge never breaks.
- ⚠️ **Human prerequisite (unlike FUEL):** the key is **issued by GoldRush**, not self-generated
  — someone creates a free account at goldrush.dev and provides the key. Activation = set the
  secret (then the page goes live). Building/merging does not depend on it.

## Testing

- **`shapes.test.ts`** (pure, the core): GoldRush sample → normalize: USD sum; native BNB
  mapped; `is_spam` dropped; zero-balance dropped; decimals applied; no-price token kept with
  `usd:null`; sort by USD desc.
- **`source/live.test.ts`**: mock `fetch` → asserts the URL/chain + Bearer header; throws on
  non-OK and on missing key.
- **`financials.test.ts`** (action): unauthorized without the privilege; `not_configured`
  without the key; cache hit path; last-good on upstream error (`stale:true`).
- UI: light render test of `TreasuryManager` (total + per-wallet + degraded state).
- Gates: `tsc --noEmit` 0, `CI=true npx vitest run` green, `next build` 0.

## Verification

- Unit/integration as above, all green; tsc 0; build 0.
- Live (post-deploy, after the key is set): `/admin/financials/treasury` (gated) shows the two
  wallets' BNB + BEP20 holdings with USD and a grand total; cross-check a couple of token
  balances against BscScan for the two addresses.

## Open coordination (not blockers to building)

1. **Privilege name** — confirm flex's financials privilege name; wire nav/gate to it last.
2. **GoldRush key** — free account + key (Vitor/flex, or via browser with a provided email).
3. **Addresses** — provisional (~90%); flex may change. One-line update in `config.ts`.
