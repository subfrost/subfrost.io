# SP-3 — Stripe Crypto On-ramp console (design)

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branch: `feat/sp3-onramp`

## Goal

Add a **read-only observability surface** for **Stripe Crypto On-ramp** (fiat→crypto
purchases) to the admin, at `/admin/billing/onramp`. Compliance/billing operators see
the health of the on-ramp funnel at a glance (metrics + status breakdown), can hunt
failures (rejected sessions + reason), and can drill into a single session's detail
(discriminated fees, full wallet, timestamps, deep-link to Stripe). It mirrors the
existing `offramp` surface (read-only passthrough over the seed/live-stub source) — the
on-ramp is the literal mirror of the off-ramp.

## Non-goals (explicitly out of scope)

- **No actions / no `BILLING_EDIT`.** The surface is purely read-only. No mutation,
  no refund, no annotation.
- **No DB persistence, no schema change.** Stripe is the source of truth for on-ramp
  sessions; we read on-demand. (This is the A1 "passthrough" approach; the A2 "snapshot
  into a new table" approach was rejected — it would only pay off if we needed to
  annotate/disposition sessions, which we don't.)
- **No webhooks.** Push-based ingestion is **SP-4** (needs `STRIPE_WEBHOOK_SECRET`).
  SP-3 reads via the API on page load; it must work without webhooks. When SP-4 lands,
  real-time refresh can be layered on without reworking SP-3.
- **No customer-facing on-ramp widget / no creating sessions.** SP-3 only *reads*
  existing sessions; the buy flow is a customer-facing concern, not admin.
- **No CSV export, no time-series charts, no search-by-wallet/customer** in v1 (YAGNI;
  trivially addable later if requested).

## Decisions (locked during brainstorming)

1. **Purpose = observe only (option A).** Metrics + an event/session timeline, no action.
2. **Architecture = A1 passthrough.** Add `onrampSessions()` to the pluggable
   `StripeSource`; seed source serves deterministic demo data, live source reads the
   Stripe SDK (stubbed/degrading until enabled). No DB.
3. **The four "useful" additions** (the flex's only directive was "make it useful"):
   (a) status breakdown counters; (b) a "rejected only" quick filter showing the
   rejection reason; (c) per-row expandable detail (mirrors `KycManager`); (d) a
   "view in Stripe" deep-link per session.
4. **Metrics are computed over the loaded window** (selected period / pagination), not
   by scanning all of Stripe's history. Honest, cheap, predictable.
5. **Gating = `BILLING_VIEW`** (read-only; same gate as every other billing read).
6. **Degrade, never dead-screen.** If `STRIPE_SECRET_KEY` is unset or on-ramp isn't
   enabled on the account, the live read degrades to `[]` and the UI shows a
   non-blocking notice — exactly like Treasury/Issuing degrade today. Until then, the
   seed source renders a demo dataset behind the existing `BillingBanner`.

## Architecture (mirrors the SP-1 `lib/stripe/` boundary)

```
Stripe API (crypto on-ramp sessions)
  └─ lib/stripe/source/live/onramp.ts   (server-only; getStripeClient(); degradeIfUnavailable)
        ├─ stripe.crypto.onrampSessions.list (paginated; created[gte] derived from the period)
        └─ returns OnrampSession[]  (normalized, client-safe; no raw SDK objects)
  lib/stripe/source/seed.ts             (+ onrampSessions(period?): deterministic demo data, filtered by createdAt)
  lib/stripe/source/types.ts            (+ onrampSessions(period?: OnrampPeriod) on the StripeSource interface)
  lib/stripe/shapes.ts                  (+ OnrampSession, OnrampStatus, OnrampMetrics — client-safe)
        │
  lib/stripe/onramp.ts                  (NEW; domain read)
        ├─ listOnrampSessions(period?) -> { sessions, metrics, live }
        └─ computeOnrampMetrics(sessions) -> OnrampMetrics   (PURE, unit-tested)
        │
  actions/cms/billing.ts                (+ listOnrampSessionsAction(period?), gated BILLING_VIEW)
        │
  app/admin/billing/onramp/page.tsx     (server component; if(!user) redirect("/admin/login"))
  components/cms/billing/OnrampManager.tsx   (client; mobile-first)
  lib/cms/admin-nav.ts                  (+ "On-ramp" item in the Billing group, BILLING_VIEW)
```

Rationale: the **read** of Stripe lives under `lib/stripe/source/live/*` exactly like the
other billing surfaces (identical boundary/gating/degrade story; client-safe `config.ts`
stays SDK-free). The **metrics computation** is a pure function in `lib/stripe/onramp.ts`
so it is unit-testable without the SDK. `actions/cms/billing.ts` is the only entry point
and enforces `BILLING_VIEW`.

## Data shapes (client-safe, added to `lib/stripe/shapes.ts`)

```ts
export type OnrampStatus =
  | "initialized" | "requires_payment" | "fulfillment_processing"
  | "fulfillment_complete" | "rejected" | "expired"

export type OnrampSession = {
  id: string
  status: OnrampStatus
  createdAt: string          // ISO 8601
  sourceCurrency: string     // fiat, e.g. "USD"
  sourceAmount: number       // fiat amount (major units)
  destCurrency: string       // crypto, e.g. "BTC" | "ETH" | "USDC"
  destAmount: number | null  // crypto amount (null until known)
  destNetwork: string        // e.g. "bitcoin" | "ethereum" | "polygon" | "solana"
  walletAddress: string
  transactionFee: number | null  // Stripe fee (fiat)
  networkFee: number | null       // network fee (fiat)
  rejectionReason: string | null  // populated when status === "rejected"
}

export type OnrampPeriod = "7d" | "30d" | "all"

export type OnrampMetrics = {
  total: number
  byStatus: Record<OnrampStatus, number>
  completed: number               // byStatus.fulfillment_complete
  conversionRate: number          // completed / total (0 when total === 0)
  fiatVolume: number              // sum of sourceAmount over completed
  cryptoVolumeByAsset: Record<string, number>  // sum of destAmount by destCurrency, completed
  totalFees: number               // sum of (transactionFee + networkFee) over completed
}
```

`computeOnrampMetrics(sessions: OnrampSession[]): OnrampMetrics` is pure: it initializes
`byStatus` with every `OnrampStatus` at 0 (so a missing status renders as 0, not absent),
and divides safely (`total === 0 → conversionRate 0`).

## Period filter

`listOnrampSessions(period: OnrampPeriod = "30d")`. The live source translates the period
to `created[gte]` and paginates (`has_more`) up to a sane cap; the seed source filters its
demo rows in-memory by `createdAt`. Metrics are computed over exactly the returned set.

## UI (`OnrampManager.tsx`, mobile-first, same look as the other billing pages)

- **Header metrics:** cards (total, completed, conversion rate, fiat volume, total fees)
  + a **status breakdown** row of counters (one per `OnrampStatus`, rejected emphasized).
- **Controls:** period selector (7d / 30d / all) + a **"rejected only"** toggle.
- **List** (most-recent first), each row: date · status badge · `sourceAmount srcCcy → destAmount destCcy`
  · network + truncated wallet · fee.
- **Expandable detail** (click a row, mirrors `KycManager`): discriminated fees
  (Stripe fee vs network fee), full wallet address, per-status timestamps if available,
  rejection reason (when rejected), and a **"View in Stripe"** deep-link to the session in
  the Stripe dashboard. The URL is built from the session id with a `test/` prefix when not
  in live mode (`https://dashboard.stripe.com/{test/}...`); the exact on-ramp session path
  segment is confirmed against Stripe's current dashboard during implementation, falling
  back to the dashboard home if the path can't be verified (the link is a convenience, not
  load-bearing).
- **Degrade notice:** when `live && sessions.length === 0` and on-ramp is unavailable, a
  non-blocking banner ("On-ramp isn't enabled on this Stripe account yet"). In demo mode
  the existing `BillingBanner` already communicates seed data.

## Gating, errors, degrade

- `listOnrampSessionsAction` calls `actor("BILLING_VIEW")` (rejects otherwise) — no audit
  needed for a pure read (consistent with the other billing list actions).
- Gated by `isLive()` (`STRIPE_SECRET_KEY`, already set in prod via SP-1). If on-ramp is
  not enabled on the account, `degradeIfUnavailable` makes the live read return `[]` → the
  page shows the degrade notice. No dead screen, no 500.
- Unexpected errors map to `{ ok:false, error }` for the action; the manager renders the
  existing error banner pattern.

## Testing (TDD; Stripe SDK mocked — no sandbox)

- **`computeOnrampMetrics` (pure unit):** a mixed-status fixture → exact `byStatus`,
  `completed`, `conversionRate`, `fiatVolume`, `cryptoVolumeByAsset` (multi-asset),
  `totalFees`; empty input → all-zero metrics with `conversionRate === 0`.
- **Live mapping** (`vi.mock` the Stripe client): a raw on-ramp session → normalized
  `OnrampSession`, including `rejectionReason` on a rejected session and `destAmount: null`
  before fulfillment.
- **Degrade:** source throws/unavailable → `listOnrampSessions` returns
  `{ sessions: [], metrics: <zeros>, live }`, no throw.
- **Period filter:** seed source filters by `createdAt` for `7d`/`30d`/`all`.
- **Action gating:** `listOnrampSessionsAction` rejects without `BILLING_VIEW`.
- **Seed determinism:** `onrampSessions()` returns a stable demo set (mixed statuses incl.
  at least one rejected-with-reason and multiple assets) so the UI and metrics demo well.

## Verification

`tsc --noEmit` = 0; `vitest run` green; `next build` exit 0 (Stripe SDK stays out of the
client bundle — `config.ts`/`shapes.ts` remain SDK-free; only `source/live/*` and
`client.ts` import the SDK). **No `prisma db push`** (zero schema change). No deploy in SP-3
itself unless requested — it ships behind the existing `BILLING_VIEW` gate and the live key
already present, in demo until on-ramp is enabled on the Stripe account.
