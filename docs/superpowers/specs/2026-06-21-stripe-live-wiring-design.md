# Stripe live wiring (SP-1) — design

> Date: 2026-06-21 · Branch: `feat/stripe-live-wiring` (off `feat/compliance-aml-stripe`)
> Follow-up to the Plano D billing console (`lib/stripe/*`). Wires the live Stripe path that
> was deliberately stubbed (`StripeNotWiredError`) behind `STRIPE_SECRET_KEY`.

## Context

The Plano D billing console runs entirely on deterministic **seed** data. `lib/stripe/source/live.ts`
stubs all 10 reads with `StripeNotWiredError`, and the 5 money/issuing/subscription/promo mutators
throw `StripeNotWiredError` when `isLive()`. `isLive()` is `Boolean(process.env.STRIPE_SECRET_KEY)`,
false today, so `getStripeSource()` returns the seed source and nothing live is ever hit.

This spec replaces those stubs with real Stripe SDK calls, **entirely behind the `lib/stripe`
boundary**. No `actions/*` or UI changes — the actions already map `StripeNotWiredError` and
`BillingError` to `{ ok: false }`, and the managers already render whatever the source returns.

### Decisions locked in brainstorm (flex input, 2026-06-21)
- **Treasury**: assumed enabled → wire. **Issuing**: may not be enabled; flex will enable it —
  wire it but **degrade gracefully** if the product errors as not-enabled.
- **Billing (subscriptions) + Coupons/Promo + Customers**: standard, wire.
- **Offramp**: it is a Stripe product but **not yet GA** (subfrost will be an early integration) →
  cannot wire now; `liveSource.offrampSettlements` **delegates to the seed source** (stays demo).
- **Money movement**: `confirmIntent` executes **real ACH (Treasury) and real refunds**.
- **Test keys**: none available → validation is **mocked Stripe SDK unit tests only**.
- **Webhooks**: out of scope here (separate spec; key `STRIPE_WEBHOOK_SECRET` to come from "grey").

### Out of scope (separate specs)
- **SP-2** — Stripe Identity admin frontend (ties to the KYC module).
- **SP-3** — Stripe Crypto On-ramp metrics/timeline frontend.
- **SP-4** — Stripe webhooks (pending `STRIPE_WEBHOOK_SECRET`).

## Architecture

### 1. Stripe client — new server-only module
`lib/stripe/client.ts`: a lazy singleton. `STRIPE_API_VERSION` is a single exported constant pinned
to the version bundled with the installed `stripe` SDK (set explicitly so an SDK bump is a conscious change).
```
import Stripe from "stripe"
let client: Stripe | null = null
export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new BillingError("STRIPE_SECRET_KEY not set")
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION })
  return client
}
```
**Not** placed in `config.ts`: `config.ts` is client-safe (imported by client components for
`isLive`/`DEMO_REASON`), and the `stripe` SDK is server-only. The boundary must stay intact.

### 2. Live source split per surface
Replace the single stub object with a `source/live/` directory:
`source/live/{subscriptions,promo,customers,treasury,issuing}.ts` — each maps Stripe objects to the
`shapes.ts` types. `source/live.ts` composes them into the `StripeSource` object; `offrampSettlements`
delegates to `seedSource.offrampSettlements`.

### 3. Graceful degradation
A helper `degradeIfUnavailable(fn, fallback)` wraps each read: if the Stripe call fails, log the
error and return the fallback (`[]`) rather than throwing a 500 up to the UI. The reads are
non-critical (no money moves), so any read-time Stripe error degrades to the fallback with the
`live` flag still `true` — an unavailable product (Issuing off → `StripePermissionError` /
`account_invalid`-style code) and a transient outage both surface as an empty screen, not a crash.
Money mutators do **not** use this helper — they must surface failures (see Error handling).

### 4. Mutators wired in place
Each `if (isLive()) throw new StripeNotWiredError(...)` branch becomes a real call:

| Mutator | Stripe call |
|---|---|
| `promo.createPromoCode` | `coupons.create` (+ `percent_off`/`amount_off`) → `promotionCodes.create({ coupon, code, max_redemptions, expires_at })` |
| `subscriptions.changeSubscription` | `subscriptions.update(id, { cancel_at_period_end: true })` (cancel) / `{ cancel_at_period_end: false }` (resume) |
| `issuing.setCardControl` | `issuing.cards.update(id, { status })` — `active`→`active`, `paused`→`inactive`, `canceled`→`canceled` |
| `issuing.submitDisputeEvidence` | `issuing.disputes.update(id, { evidence })` then `issuing.disputes.submit(id)` |
| `money.confirmIntent` (REFUND) | `refunds.create({ payment_intent` or `charge: reference, amount })` |
| `money.confirmIntent` (ACH_TRANSFER) | Treasury — `out`: `treasury.outboundPayments.create({ financial_account: env, amount, currency: "usd", destination_payment_method: counterparty, description: memo })`; `in`: `treasury.inboundTransfers.create({ financial_account, amount, currency, origin_payment_method: counterparty })` |

**ACH inputs:** source financial account from env `STRIPE_TREASURY_FINANCIAL_ACCOUNT`; the queued
intent's `counterparty` string is treated as a Stripe destination/origin payment-method id. If the
env is unset or `counterparty` is not a valid id, the confirm fails with a clear `BillingError` and
the intent **stays QUEUED** (never silently marked CONFIRMED). Refunds use the intent's `reference`
(charge/payment-intent id) and have no such gap.

## Per-surface read mapping (Stripe → shapes)

- **subscriptionTiers** ← `products.list({ active: true })` + `prices.list` per product; `priceMonthly`/
  `priceYearly` from recurring prices (interval month/year); `features` from product metadata/marketing
  features; `activeSubs` = count of active subscriptions on that product's price.
- **subscribers** ← `subscriptions.list({ status: "all", expand: ["data.customer"] })`; `customerEmail`
  from customer; `tier` = product name; `status` mapped to `active|trialing|past_due|canceled`;
  `startedAt` = `start_date`; `renewsAt` = `current_period_end` (null if canceled).
- **promoCodes** ← `promotionCodes.list({ expand: ["data.coupon"] })`; `type` = `percent_off ? PERCENT : AMOUNT`;
  `value` = `percent_off` or `amount_off`; `redemptions` = `times_redeemed`; `maxRedemptions`;
  `expiresAt` = `expires_at`; `active`.
- **customerSummaries** ← `customers.list`; `activeSubscriptions` count; `lifetimeValue` = sum of the
  customer's succeeded charge amounts (cents); `createdAt`.
- **customerDetail(id)** ← `customers.retrieve(id)` + `subscriptions.list` + `invoices.list` +
  `paymentMethods.list` + `charges.list` (all scoped to the customer); maps to the nested shape.
  Returns `null` if the customer does not exist.
- **treasuryBalances** ← `treasury.financialAccounts.list`; `available`/`pending` from `balance.cash`.
- **treasuryTransactions** ← `treasury.transactions.list`; `type` mapped to the `TreasuryTxnType` union;
  `status` to `pending|posted|returned`.
- **issuingCards** ← `issuing.cards.list`; `last4`, `cardholder`, `type` (virtual/physical), `state`
  (`active|paused|canceled` from Stripe `active|inactive|canceled`), `wallet`, spend from
  `spending_controls` + authorizations (MTD).
- **issuingDisputes** ← `issuing.disputes.list`; `reason`, `status` (`submitted|won|lost` from
  `unsubmitted|submitted|won|lost`), `amount`, `openedAt`.

## Error handling

- **Validation / bad input** → `BillingError` (actions already map to `{ ok:false, error }`, no audit).
- **Product not enabled** (reads) → graceful degrade to `[]`. (Mutators against a disabled product →
  `BillingError` with the Stripe message.)
- **Money movement** keeps the queue+confirm guardrail. `confirmIntent` only acts on `QUEUED` intents
  (existing `loadQueued`). On a Stripe failure the intent is **not** transitioned — it stays `QUEUED`
  so it can be retried or canceled. Success marks it `CONFIRMED` with `decidedBy`/`decidedAt` (as today).
- The live source's reads keep returning `live: true` even when degraded (the connection is live; the
  product just has no data / isn't enabled).

## Config / env

- `STRIPE_SECRET_KEY` — gates `isLive()` and the client. Set in subfrost.io's Secret Manager by flex.
- `STRIPE_TREASURY_FINANCIAL_ACCOUNT` — source financial account id for ACH. Required only to confirm
  ACH intents; absence yields a clear `BillingError` on confirm, not a crash.
- `STRIPE_WEBHOOK_SECRET` — deferred to SP-4.

## Testing

No Stripe sandbox/test keys are available, so correctness rests on **mocked SDK unit tests**:
- `vi.mock("stripe")` (and/or mock `@/lib/stripe/client`'s `getStripeClient`). Per surface: assert the
  correct endpoint is called with the correct args, and that Stripe objects map to the right shape.
- Mutators: assert the SDK call + the intent/state transitions (incl. failure leaving `QUEUED`).
- Graceful degrade: simulate a product-not-enabled error → assert `[]`.
- `confirmIntent`: refund happy path; ACH out/in happy paths; missing env / invalid counterparty →
  `BillingError` + intent unchanged.
- **Seed-mode tests stay green** — demo behavior is unchanged (the live branch is only taken when
  `isLive()`), so the existing 419-test suite must remain passing.

## Rollout

- Lands on `feat/stripe-live-wiring` (off `feat/compliance-aml-stripe`). It can only deploy after
  **#26 merges** and this branch merges; until `STRIPE_SECRET_KEY` is set, the console stays in demo.
- flex sets `STRIPE_SECRET_KEY` (+ `STRIPE_TREASURY_FINANCIAL_ACCOUNT`) in Secret Manager when ready.
- **First live validation** (no sandbox): flex performs a small real action — e.g. a **$1 refund** —
  as the initial smoke test, and spot-checks the read screens.

## Risks

- **No sandbox** — the first real exercise of the money paths is production with real funds. Mitigation:
  follow the current Stripe Node SDK docs precisely, mocked tests for every path, money paths fail-closed
  (intent stays `QUEUED` on any error), and a $1-refund smoke before relying on it.
- **Issuing not enabled** — handled by graceful degrade until flex enables it.
- **Stripe API version drift** — pin `apiVersion`; the plan picks the version matching the installed
  `stripe` SDK major.
- **`lifetimeValue` / spend-MTD** definitions are approximate from Stripe data; exact formula resolved
  in the plan, kept consistent with the seed shape.
