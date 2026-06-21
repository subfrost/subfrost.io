# Stripe Live Wiring (SP-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stubbed Stripe live path in `lib/stripe` with real Stripe SDK calls, behind the existing lib boundary, so the billing console runs on real data when `STRIPE_SECRET_KEY` is set.

**Architecture:** A new server-only `client.ts` exposes a lazy Stripe singleton. The live read source is split per surface under `source/live/`, composed in `source/live.ts` (offramp delegates to seed; every read wrapped in a graceful-degrade helper). The 5 mutators get a live branch that calls Stripe; their seed-mode overlay paths are untouched. All validated by mocked-SDK unit tests.

**Tech Stack:** TypeScript, Next.js 16, `stripe` Node SDK (new dep), Vitest, pnpm.

## Global Constraints

- Package manager is **pnpm** (`pnpm add`, not npm). `.npmrc` is untracked — never `git add` it.
- `lib/stripe/config.ts` stays **client-safe**: never import `stripe` (or anything from `client.ts`) into it. The SDK is server-only.
- `isLive()` = `Boolean(process.env.STRIPE_SECRET_KEY)`. The live path runs only when true.
- **No changes to `actions/*` or any UI/component.** Wiring is entirely inside `lib/stripe`.
- **Seed-mode tests must stay green** (the existing 419-pass suite). Only the specific *live-mode* test cases that asserted `StripeNotWiredError` are replaced (that stub is being removed).
- **Money paths fail closed:** on any Stripe error in `confirmIntent`, the intent stays `QUEUED` (never silently `CONFIRMED`).
- Run tests with `CI=true node_modules/.bin/vitest run <file>`; typecheck with `node_modules/.bin/tsc --noEmit`. Work in `C:/Alkanes Geral Dev/subfrost.io` on branch `feat/stripe-live-wiring`.
- `STRIPE_API_VERSION` is one exported constant. Set it to the exact version string the installed `stripe` SDK expects — if `tsc` complains about the `apiVersion` type, that error is the signal to align the string to the SDK.

## File Structure

- `lib/stripe/client.ts` — **new.** `getStripeClient()` lazy singleton + `STRIPE_API_VERSION`. Server-only.
- `lib/stripe/source/live/degrade.ts` — **new.** `degradeIfUnavailable(fn, fallback)` read wrapper.
- `lib/stripe/source/live/subscriptions.ts` — **new.** `liveSubscriptionTiers()`, `liveSubscribers()`.
- `lib/stripe/source/live/promo.ts` — **new.** `livePromoCodes()`.
- `lib/stripe/source/live/customers.ts` — **new.** `liveCustomerSummaries()`, `liveCustomerDetail(id)`.
- `lib/stripe/source/live/treasury.ts` — **new.** `liveTreasuryBalances()`, `liveTreasuryTransactions()`.
- `lib/stripe/source/live/issuing.ts` — **new.** `liveIssuingCards()`, `liveIssuingDisputes()`.
- `lib/stripe/source/live.ts` — **rewrite.** Compose the live source from the per-surface fns; wrap each read in `degradeIfUnavailable`; `offrampSettlements` → `seedSource`.
- `lib/stripe/promo.ts` — **modify.** Live branch in `createPromoCode`.
- `lib/stripe/subscriptions.ts` — **modify.** Live branch in `changeSubscription`.
- `lib/stripe/issuing.ts` — **modify.** Live branch in `setCardControl` + `submitDisputeEvidence`.
- `lib/stripe/money.ts` — **modify.** `loadQueued` returns the intent; live branch in `confirmIntent` (refund + ACH).
- Tests: `tests/billing/client.test.ts` (new), `tests/billing/live-*.test.ts` (new, per surface), and edits to `tests/billing/{source,promo,subscriptions,issuing,money}.test.ts`.

> **Stripe API reference** (the mocked tests cannot catch a wrong endpoint/field — verify each call against current docs): Billing https://docs.stripe.com/api/subscriptions , Promotion codes https://docs.stripe.com/api/promotion_codes , Customers https://docs.stripe.com/api/customers , Refunds https://docs.stripe.com/api/refunds , Treasury https://docs.stripe.com/api/treasury , Issuing https://docs.stripe.com/api/issuing .

---

### Task 1: Add `stripe` dep + server-only client

**Files:**
- Create: `lib/stripe/client.ts`
- Create: `tests/billing/client.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)

**Interfaces:**
- Produces: `getStripeClient(): Stripe` (throws `BillingError` if `STRIPE_SECRET_KEY` unset; returns a cached singleton). `STRIPE_API_VERSION: string`.

- [ ] **Step 1: Install the SDK**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm add stripe`
Expected: `package.json` gains `"stripe"` in dependencies; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test**

Create `tests/billing/client.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { getStripeClient } from '@/lib/stripe/client';
import { BillingError } from '@/lib/stripe/config';

const KEY = 'STRIPE_SECRET_KEY';
afterEach(() => { delete process.env[KEY]; });

describe('getStripeClient', () => {
  it('throws BillingError when no key is set', () => {
    delete process.env[KEY];
    expect(() => getStripeClient()).toThrow(BillingError);
  });
  it('returns a cached singleton when a key is set', () => {
    process.env[KEY] = 'sk_test_x';
    const a = getStripeClient();
    const b = getStripeClient();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/client.test.ts`
Expected: FAIL (cannot find module `@/lib/stripe/client`).

- [ ] **Step 4: Write minimal implementation**

Create `lib/stripe/client.ts`:
```ts
/** Server-only Stripe client. Kept OUT of config.ts (which is client-safe) because the
 *  `stripe` SDK is server-only. Lazy singleton: built on first use when the key is present. */
import Stripe from "stripe"
import { BillingError } from "@/lib/stripe/config"

// Pin the API version. If tsc rejects this string, set it to the version the installed
// `stripe` SDK expects (see node_modules/stripe types / Stripe.LatestApiVersion).
export const STRIPE_API_VERSION = "2025-08-27.basil" as Stripe.LatestApiVersion

let client: Stripe | null = null

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new BillingError("STRIPE_SECRET_KEY not set")
  if (!client) client = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  return client
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true node_modules/.bin/vitest run tests/billing/client.test.ts`
Expected: PASS (2 tests). If `tsc` later flags `STRIPE_API_VERSION`, align the string to the SDK.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/stripe/client.ts tests/billing/client.test.ts
git commit -m "feat(stripe): add stripe dep + server-only client singleton"
```

---

### Task 2: Graceful-degrade read wrapper

**Files:**
- Create: `lib/stripe/source/live/degrade.ts`
- Create: `tests/billing/live-degrade.test.ts`

**Interfaces:**
- Produces: `degradeIfUnavailable<T>(fn: () => Promise<T>, fallback: T): Promise<T>` — returns `fn()`'s value; on any throw, logs and returns `fallback`.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/live-degrade.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { degradeIfUnavailable } from '@/lib/stripe/source/live/degrade';

describe('degradeIfUnavailable', () => {
  it('returns the fn result on success', async () => {
    expect(await degradeIfUnavailable(async () => [1, 2], [])).toEqual([1, 2]);
  });
  it('returns the fallback when fn throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await degradeIfUnavailable(async () => { throw new Error('issuing not enabled'); }, [] as number[]);
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-degrade.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/stripe/source/live/degrade.ts`:
```ts
/** Reads are non-critical (no money moves). If a Stripe read fails — a product not enabled
 *  (e.g. Issuing off) or a transient outage — degrade to the fallback instead of 500ing the
 *  screen. Money mutators do NOT use this; they must surface failures. */
export async function degradeIfUnavailable<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.error("[stripe] live read degraded to fallback:", (e as Error).message)
    return fallback
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-degrade.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live/degrade.ts tests/billing/live-degrade.test.ts
git commit -m "feat(stripe): graceful-degrade wrapper for live reads"
```

---

### Task 3: Live reads — subscriptions (tiers + subscribers)

**Files:**
- Create: `lib/stripe/source/live/subscriptions.ts`
- Create: `tests/billing/live-subscriptions.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()` from `@/lib/stripe/client`.
- Produces: `liveSubscriptionTiers(): Promise<SubscriptionTier[]>`, `liveSubscribers(): Promise<Subscriber[]>` (shapes from `@/lib/stripe/shapes`).

- [ ] **Step 1: Write the failing test**

Create `tests/billing/live-subscriptions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveSubscribers } from '@/lib/stripe/source/live/subscriptions';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveSubscribers', () => {
  it('maps Stripe subscriptions to the Subscriber shape', async () => {
    gsc.mockReturnValue({
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [{
        id: 'sub_1', status: 'active', start_date: 1717200000, current_period_end: 1719792000,
        customer: { email: 'ada@example.com' },
        items: { data: [{ price: { product: { name: 'Pro' } } }] },
      }] }) },
    });
    const r = await liveSubscribers();
    expect(r[0]).toEqual({
      id: 'sub_1', customerEmail: 'ada@example.com', tier: 'Pro',
      status: 'active', startedAt: new Date(1717200000 * 1000).toISOString(),
      renewsAt: new Date(1719792000 * 1000).toISOString(),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-subscriptions.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/stripe/source/live/subscriptions.ts`:
```ts
import { getStripeClient } from "@/lib/stripe/client"
import type { SubscriptionTier, Subscriber, SubscriberStatus } from "@/lib/stripe/shapes"

const SUB_STATUS: Record<string, SubscriberStatus> = {
  active: "active", trialing: "trialing", past_due: "past_due",
  canceled: "canceled", unpaid: "past_due", incomplete: "past_due",
  incomplete_expired: "canceled", paused: "canceled",
}
const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null)

export async function liveSubscribers(): Promise<Subscriber[]> {
  const stripe = getStripeClient()
  const res = await stripe.subscriptions.list({
    status: "all", limit: 100, expand: ["data.customer", "data.items.data.price.product"],
  })
  return res.data.map((s: any) => ({
    id: s.id,
    customerEmail: s.customer?.email ?? "",
    tier: s.items?.data?.[0]?.price?.product?.name ?? "",
    status: SUB_STATUS[s.status] ?? "canceled",
    startedAt: iso(s.start_date) ?? "",
    renewsAt: s.status === "canceled" ? null : iso(s.current_period_end),
  }))
}

export async function liveSubscriptionTiers(): Promise<SubscriptionTier[]> {
  const stripe = getStripeClient()
  const products = await stripe.products.list({ active: true, limit: 100 })
  const tiers: SubscriptionTier[] = []
  for (const p of products.data as any[]) {
    const prices = await stripe.prices.list({ product: p.id, active: true, limit: 100 })
    const monthly = prices.data.find((x: any) => x.recurring?.interval === "month")
    const yearly = prices.data.find((x: any) => x.recurring?.interval === "year")
    const subs = await stripe.subscriptions.list({ price: monthly?.id ?? yearly?.id, status: "active", limit: 100 })
    tiers.push({
      id: p.id,
      name: p.name,
      priceMonthly: monthly?.unit_amount ?? 0,
      priceYearly: yearly?.unit_amount ?? 0,
      features: (p.marketing_features ?? []).map((f: any) => f.name).filter(Boolean),
      activeSubs: subs.data.length,
    })
  }
  return tiers
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-subscriptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live/subscriptions.ts tests/billing/live-subscriptions.test.ts
git commit -m "feat(stripe): live subscriptions reads"
```

---

### Task 4: Live reads — promo codes

**Files:**
- Create: `lib/stripe/source/live/promo.ts`
- Create: `tests/billing/live-promo.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()`.
- Produces: `livePromoCodes(): Promise<PromoCode[]>`.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/live-promo.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { livePromoCodes } from '@/lib/stripe/source/live/promo';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('livePromoCodes', () => {
  it('maps percent and amount coupons to the PromoCode shape', async () => {
    gsc.mockReturnValue({ promotionCodes: { list: vi.fn().mockResolvedValue({ data: [
      { code: 'LAUNCH25', times_redeemed: 312, max_redemptions: 1000, expires_at: 1719792000, active: true, coupon: { percent_off: 25, amount_off: null } },
      { code: 'FROST10', times_redeemed: 47, max_redemptions: null, expires_at: null, active: true, coupon: { percent_off: null, amount_off: 1000 } },
    ] }) } });
    const r = await livePromoCodes();
    expect(r[0]).toEqual({ code: 'LAUNCH25', type: 'PERCENT', value: 25, redemptions: 312, maxRedemptions: 1000, expiresAt: new Date(1719792000 * 1000).toISOString(), active: true });
    expect(r[1]).toMatchObject({ code: 'FROST10', type: 'AMOUNT', value: 1000, maxRedemptions: null, expiresAt: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-promo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/stripe/source/live/promo.ts`:
```ts
import { getStripeClient } from "@/lib/stripe/client"
import type { PromoCode } from "@/lib/stripe/shapes"

export async function livePromoCodes(): Promise<PromoCode[]> {
  const stripe = getStripeClient()
  const res = await stripe.promotionCodes.list({ limit: 100, expand: ["data.coupon"] })
  return res.data.map((p: any) => ({
    code: p.code,
    type: p.coupon?.percent_off != null ? "PERCENT" : "AMOUNT",
    value: p.coupon?.percent_off != null ? p.coupon.percent_off : (p.coupon?.amount_off ?? 0),
    redemptions: p.times_redeemed ?? 0,
    maxRedemptions: p.max_redemptions ?? null,
    expiresAt: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
    active: Boolean(p.active),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-promo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live/promo.ts tests/billing/live-promo.test.ts
git commit -m "feat(stripe): live promo-code reads"
```

---

### Task 5: Live reads — customers (summaries + detail)

**Files:**
- Create: `lib/stripe/source/live/customers.ts`
- Create: `tests/billing/live-customers.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()`.
- Produces: `liveCustomerSummaries(): Promise<CustomerSummary[]>`, `liveCustomerDetail(id: string): Promise<CustomerDetail | null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/live-customers.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveCustomerSummaries, liveCustomerDetail } from '@/lib/stripe/source/live/customers';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveCustomerSummaries', () => {
  it('maps customers and sums succeeded charges as lifetimeValue', async () => {
    gsc.mockReturnValue({
      customers: { list: vi.fn().mockResolvedValue({ data: [{ id: 'cus_1', email: 'a@x.com', name: 'A', created: 1700000000, subscriptions: { data: [{ status: 'active' }] } }] }) },
      charges: { list: vi.fn().mockResolvedValue({ data: [{ amount: 2900, status: 'succeeded' }, { amount: 100, status: 'failed' }] }) },
    });
    const r = await liveCustomerSummaries();
    expect(r[0]).toEqual({ id: 'cus_1', email: 'a@x.com', name: 'A', activeSubscriptions: 1, lifetimeValue: 2900, createdAt: new Date(1700000000 * 1000).toISOString() });
  });
});

describe('liveCustomerDetail', () => {
  it('returns null for a deleted/missing customer', async () => {
    gsc.mockReturnValue({ customers: { retrieve: vi.fn().mockResolvedValue({ deleted: true }) } });
    expect(await liveCustomerDetail('cus_x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-customers.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/stripe/source/live/customers.ts`:
```ts
import { getStripeClient } from "@/lib/stripe/client"
import type {
  CustomerSummary, CustomerDetail, CustomerInvoice, CustomerCharge,
  CustomerPaymentMethod, CustomerSubscriptionRef,
} from "@/lib/stripe/shapes"

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null)
const sumSucceeded = (charges: any[]) =>
  charges.filter((c) => c.status === "succeeded").reduce((t, c) => t + (c.amount ?? 0), 0)

export async function liveCustomerSummaries(): Promise<CustomerSummary[]> {
  const stripe = getStripeClient()
  const res = await stripe.customers.list({ limit: 50, expand: ["data.subscriptions"] })
  const out: CustomerSummary[] = []
  for (const c of res.data as any[]) {
    const charges = await stripe.charges.list({ customer: c.id, limit: 100 })
    out.push({
      id: c.id,
      email: c.email ?? "",
      name: c.name ?? "",
      activeSubscriptions: (c.subscriptions?.data ?? []).filter((s: any) => s.status === "active").length,
      lifetimeValue: sumSucceeded(charges.data),
      createdAt: iso(c.created) ?? "",
    })
  }
  return out
}

export async function liveCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const stripe = getStripeClient()
  const c: any = await stripe.customers.retrieve(id)
  if (!c || c.deleted) return null
  const [subs, invoices, pms, charges] = await Promise.all([
    stripe.subscriptions.list({ customer: id, status: "all", limit: 100, expand: ["data.items.data.price.product"] }),
    stripe.invoices.list({ customer: id, limit: 100 }),
    stripe.paymentMethods.list({ customer: id, type: "card", limit: 100 }),
    stripe.charges.list({ customer: id, limit: 100 }),
  ])
  const defaultPm = c.invoice_settings?.default_payment_method
  const subscriptions: CustomerSubscriptionRef[] = subs.data.map((s: any) => ({
    id: s.id, tier: s.items?.data?.[0]?.price?.product?.name ?? "", status: s.status,
    renewsAt: s.status === "canceled" ? null : iso(s.current_period_end),
  }))
  const inv: CustomerInvoice[] = invoices.data.map((i: any) => ({
    id: i.id, number: i.number ?? "", amountDue: i.amount_due ?? 0, status: i.status, createdAt: iso(i.created) ?? "",
  }))
  const paymentMethods: CustomerPaymentMethod[] = pms.data.map((m: any) => ({
    id: m.id, brand: m.card?.brand ?? "", last4: m.card?.last4 ?? "",
    expMonth: m.card?.exp_month ?? 0, expYear: m.card?.exp_year ?? 0, isDefault: m.id === defaultPm,
  }))
  const recentCharges: CustomerCharge[] = charges.data.slice(0, 10).map((ch: any) => ({
    id: ch.id, amount: ch.amount ?? 0,
    status: ch.refunded ? "refunded" : ch.status, description: ch.description ?? null, createdAt: iso(ch.created) ?? "",
  }))
  return { id: c.id, email: c.email ?? "", name: c.name ?? "", subscriptions, invoices: inv, paymentMethods, recentCharges }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-customers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live/customers.ts tests/billing/live-customers.test.ts
git commit -m "feat(stripe): live customer reads"
```

---

### Task 6: Live reads — treasury (balances + transactions)

**Files:**
- Create: `lib/stripe/source/live/treasury.ts`
- Create: `tests/billing/live-treasury.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()`.
- Produces: `liveTreasuryBalances(): Promise<TreasuryBalance[]>`, `liveTreasuryTransactions(): Promise<TreasuryTransaction[]>`.

> Verify field names against https://docs.stripe.com/api/treasury — `financial_accounts.list`, `balance.cash[currency]`, `treasury.transactions.list`, `flow_type`.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/live-treasury.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveTreasuryBalances } from '@/lib/stripe/source/live/treasury';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveTreasuryBalances', () => {
  it('maps financial accounts to the TreasuryBalance shape (cents, USD)', async () => {
    gsc.mockReturnValue({ treasury: { financialAccounts: { list: vi.fn().mockResolvedValue({ data: [
      { id: 'fa_1', nickname: 'FBO Operating', balance: { cash: { usd: 18420942 }, inbound_pending: { usd: 1240000 } } },
    ] }) } } });
    const r = await liveTreasuryBalances();
    expect(r[0]).toEqual({ accountId: 'fa_1', nickname: 'FBO Operating', available: 18420942, pending: 1240000, currency: 'USD' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-treasury.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/stripe/source/live/treasury.ts`:
```ts
import { getStripeClient } from "@/lib/stripe/client"
import type { TreasuryBalance, TreasuryTransaction, TreasuryTxnType } from "@/lib/stripe/shapes"

// Stripe treasury transaction flow_type -> our union (verify against the API; fall back to "fee").
const TXN_TYPE: Record<string, TreasuryTxnType> = {
  inbound_transfer: "ach_credit", received_credit: "ach_credit", outbound_transfer: "ach_debit",
  outbound_payment: "ach_debit", received_debit: "ach_debit", issuing_authorization: "card_settlement",
}

export async function liveTreasuryBalances(): Promise<TreasuryBalance[]> {
  const stripe = getStripeClient()
  const res = await (stripe as any).treasury.financialAccounts.list({ limit: 100 })
  return res.data.map((fa: any) => ({
    accountId: fa.id,
    nickname: fa.nickname ?? fa.id,
    available: fa.balance?.cash?.usd ?? 0,
    pending: fa.balance?.inbound_pending?.usd ?? 0,
    currency: "USD",
  }))
}

export async function liveTreasuryTransactions(): Promise<TreasuryTransaction[]> {
  const stripe = getStripeClient()
  const accounts = await (stripe as any).treasury.financialAccounts.list({ limit: 1 })
  const fa = accounts.data[0]
  if (!fa) return []
  const res = await (stripe as any).treasury.transactions.list({ financial_account: fa.id, limit: 100 })
  return res.data.map((t: any) => ({
    id: t.id,
    type: TXN_TYPE[t.flow_type] ?? "fee",
    amount: t.amount ?? 0,
    counterparty: t.description ?? "",
    status: t.status === "posted" ? "posted" : t.status === "void" ? "returned" : "pending",
    at: new Date((t.created ?? 0) * 1000).toISOString(),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-treasury.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live/treasury.ts tests/billing/live-treasury.test.ts
git commit -m "feat(stripe): live treasury reads"
```

---

### Task 7: Live reads — issuing (cards + disputes)

**Files:**
- Create: `lib/stripe/source/live/issuing.ts`
- Create: `tests/billing/live-issuing.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()`.
- Produces: `liveIssuingCards(): Promise<IssuingCard[]>`, `liveIssuingDisputes(): Promise<IssuingDispute[]>`.

> Verify against https://docs.stripe.com/api/issuing — `issuing.cards.list` (`status` active/inactive/canceled, `wallets`, `spending_controls`), `issuing.disputes.list`.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/live-issuing.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveIssuingCards } from '@/lib/stripe/source/live/issuing';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveIssuingCards', () => {
  it('maps Stripe status inactive -> paused', async () => {
    gsc.mockReturnValue({ issuing: { cards: { list: vi.fn().mockResolvedValue({ data: [
      { id: 'ic_1', last4: '4242', cardholder: { name: 'flex' }, type: 'virtual', status: 'inactive',
        wallets: { apple_pay: { eligible: true }, google_pay: { eligible: false } },
        spending_controls: { spending_limits: [{ amount: 1000000 }] } },
    ] }) } } });
    const r = await liveIssuingCards();
    expect(r[0]).toMatchObject({ id: 'ic_1', last4: '4242', cardholder: 'flex', type: 'virtual', state: 'paused', spendLimit: 1000000, wallet: { apple: true, google: false } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-issuing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/stripe/source/live/issuing.ts`:
```ts
import { getStripeClient } from "@/lib/stripe/client"
import type { IssuingCard, IssuingDispute } from "@/lib/stripe/shapes"

const CARD_STATE: Record<string, IssuingCard["state"]> = { active: "active", inactive: "paused", canceled: "canceled" }
const DISPUTE_STATUS: Record<string, IssuingDispute["status"]> = { submitted: "submitted", won: "won", lost: "lost", unsubmitted: "submitted", expired: "lost" }
const DISPUTE_REASON: Record<string, IssuingDispute["reason"]> = { fraudulent: "fraudulent", duplicate: "duplicate", service_not_received: "service_not_received" }

export async function liveIssuingCards(): Promise<IssuingCard[]> {
  const stripe = getStripeClient()
  const res = await (stripe as any).issuing.cards.list({ limit: 100 })
  return res.data.map((c: any) => ({
    id: c.id,
    last4: c.last4 ?? "",
    cardholder: c.cardholder?.name ?? "",
    type: c.type === "physical" ? "physical" : "virtual",
    state: CARD_STATE[c.status] ?? "canceled",
    wallet: { apple: Boolean(c.wallets?.apple_pay?.eligible), google: Boolean(c.wallets?.google_pay?.eligible) },
    spendLimit: c.spending_controls?.spending_limits?.[0]?.amount ?? 0,
    spentMtd: 0,
  }))
}

export async function liveIssuingDisputes(): Promise<IssuingDispute[]> {
  const stripe = getStripeClient()
  const res = await (stripe as any).issuing.disputes.list({ limit: 100 })
  return res.data.map((d: any) => ({
    id: d.id,
    cardId: d.transaction?.card ?? "",
    amount: d.amount ?? 0,
    reason: DISPUTE_REASON[d.evidence?.reason ?? d.reason] ?? "other",
    status: DISPUTE_STATUS[d.status] ?? "submitted",
    openedAt: new Date((d.created ?? 0) * 1000).toISOString(),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true node_modules/.bin/vitest run tests/billing/live-issuing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live/issuing.ts tests/billing/live-issuing.test.ts
git commit -m "feat(stripe): live issuing reads"
```

---

### Task 8: Compose the live source + fix source.test.ts

**Files:**
- Modify (rewrite): `lib/stripe/source/live.ts`
- Modify: `tests/billing/source.test.ts:35-40` (replace the `StripeNotWiredError` block)

**Interfaces:**
- Consumes: all `live*` fns (Tasks 3-7), `degradeIfUnavailable` (Task 2), `seedSource`.
- Produces: `liveSource: StripeSource` (the value `getStripeSource()` returns when `isLive()`).

- [ ] **Step 1: Replace the obsolete live-source test**

In `tests/billing/source.test.ts`, replace the `describe('liveSource', ...)` block (the one asserting `rejects ... StripeNotWiredError`) with:
```ts
describe('liveSource', () => {
  it('delegates offrampSettlements to the seed source (Stripe offramp not GA)', async () => {
    expect(await liveSource.offrampSettlements()).toEqual(await seedSource.offrampSettlements());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/source.test.ts`
Expected: FAIL (old `liveSource` still rejects / new expectation not met).

- [ ] **Step 3: Rewrite the live source**

Replace the entire contents of `lib/stripe/source/live.ts`:
```ts
import type { StripeSource } from "@/lib/stripe/source/types"
import { seedSource } from "@/lib/stripe/source/seed"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveSubscriptionTiers, liveSubscribers } from "@/lib/stripe/source/live/subscriptions"
import { livePromoCodes } from "@/lib/stripe/source/live/promo"
import { liveCustomerSummaries, liveCustomerDetail } from "@/lib/stripe/source/live/customers"
import { liveTreasuryBalances, liveTreasuryTransactions } from "@/lib/stripe/source/live/treasury"
import { liveIssuingCards, liveIssuingDisputes } from "@/lib/stripe/source/live/issuing"

// Reads degrade to a safe fallback if the underlying Stripe product is unavailable
// (e.g. Issuing not enabled). Offramp delegates to seed: it is a Stripe product but not GA.
export const liveSource: StripeSource = {
  treasuryBalances: () => degradeIfUnavailable(liveTreasuryBalances, []),
  treasuryTransactions: () => degradeIfUnavailable(liveTreasuryTransactions, []),
  issuingCards: () => degradeIfUnavailable(liveIssuingCards, []),
  issuingDisputes: () => degradeIfUnavailable(liveIssuingDisputes, []),
  offrampSettlements: () => seedSource.offrampSettlements(),
  subscriptionTiers: () => degradeIfUnavailable(liveSubscriptionTiers, []),
  subscribers: () => degradeIfUnavailable(liveSubscribers, []),
  promoCodes: () => degradeIfUnavailable(livePromoCodes, []),
  customerSummaries: () => degradeIfUnavailable(liveCustomerSummaries, []),
  customerDetail: (id: string) => degradeIfUnavailable(() => liveCustomerDetail(id), null),
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/billing/source.test.ts`
Expected: PASS (seed tests + the new offramp-delegation test).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live.ts tests/billing/source.test.ts
git commit -m "feat(stripe): compose live source (degrade + offramp->seed)"
```

---

### Task 9: Wire mutator — createPromoCode (live)

**Files:**
- Modify: `lib/stripe/promo.ts:27-38`
- Modify: `tests/billing/promo.test.ts` (replace the `throws StripeNotWiredError in live mode` case)

**Interfaces:**
- Consumes: `getStripeClient()`. Live branch goes BEFORE the seed-overlay dup-check (Stripe owns uniqueness in live).

- [ ] **Step 1: Replace the live-mode test case**

In `tests/billing/promo.test.ts`, add `vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));` at the top with the other mocks, import `getStripeClient`, and replace the `it('throws StripeNotWiredError in live mode without writing', ...)` case with:
```ts
it('creates coupon + promotion code in Stripe (live), not the overlay', async () => {
  live.mockReturnValue(true);
  const promotionCodes = { create: vi.fn().mockResolvedValue({ code: 'X', coupon: { percent_off: 10 }, times_redeemed: 0, max_redemptions: null, expires_at: null, active: true }) };
  const coupons = { create: vi.fn().mockResolvedValue({ id: 'co_1' }) };
  (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ coupons, promotionCodes });
  const r = await createPromoCode({ code: 'X', type: 'PERCENT', value: 10 }, 'op');
  expect(coupons.create).toHaveBeenCalledWith({ percent_off: 10, duration: 'forever' });
  expect(promotionCodes.create).toHaveBeenCalled();
  expect(spc.create).not.toHaveBeenCalled();
  expect(r).toMatchObject({ code: 'X', type: 'PERCENT', value: 10 });
});
```
Add the import: `import { getStripeClient } from '@/lib/stripe/client';`

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/promo.test.ts`
Expected: FAIL (live still throws `StripeNotWiredError`).

- [ ] **Step 3: Rewrite createPromoCode**

Replace `createPromoCode` in `lib/stripe/promo.ts` (keep the file's existing imports; add `import { getStripeClient } from "@/lib/stripe/client"` and import `livePromoCodes` mapping is not needed):
```ts
export async function createPromoCode(input: unknown, by: string): Promise<PromoCode> {
  const res = CreatePromoSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { code, type, value, maxRedemptions, expiresAt } = res.data

  if (isLive()) {
    const stripe = getStripeClient()
    const coupon = type === "PERCENT"
      ? await stripe.coupons.create({ percent_off: value, duration: "forever" })
      : await stripe.coupons.create({ amount_off: value, currency: "usd", duration: "forever" })
    const pc: any = await stripe.promotionCodes.create({
      coupon: coupon.id, code,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    })
    return {
      code: pc.code, type, value, redemptions: pc.times_redeemed ?? 0,
      maxRedemptions: pc.max_redemptions ?? null,
      expiresAt: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString() : null,
      active: Boolean(pc.active),
    }
  }

  const existing = await prisma.stripePromoCode.findUnique({ where: { code } })
  if (existing) throw new BillingError(`Promo code already exists: ${code}`)
  const saved = (await prisma.stripePromoCode.create({
    data: { code, type, value, maxRedemptions: maxRedemptions ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null, by },
  })) as DbPromo
  return mapOverlay(saved)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/billing/promo.test.ts`
Expected: PASS (seed cases + new live case).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/promo.ts tests/billing/promo.test.ts
git commit -m "feat(stripe): wire live createPromoCode"
```

---

### Task 10: Wire mutator — changeSubscription (live)

**Files:**
- Modify: `lib/stripe/subscriptions.ts:48-56`
- Modify: `tests/billing/subscriptions.test.ts` (replace the live `StripeNotWiredError` case)

- [ ] **Step 1: Replace the live-mode test case**

In `tests/billing/subscriptions.test.ts`, add `vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));`, import `getStripeClient`, and replace the `changeSubscription` live `StripeNotWiredError` case with:
```ts
it('cancels at period end via Stripe in live mode (no overlay write)', async () => {
  live.mockReturnValue(true);
  const update = vi.fn().mockResolvedValue({ id: 'sub_1' });
  (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ subscriptions: { update } });
  const r = await changeSubscription('sub_1', { action: 'cancel' }, 'op');
  expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
  expect(prisma.stripeSubscriptionAction.create).not.toHaveBeenCalled();
  expect(r.action).toBe('cancel');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/subscriptions.test.ts`
Expected: FAIL (live still throws).

- [ ] **Step 3: Rewrite changeSubscription**

Add `import { getStripeClient } from "@/lib/stripe/client"` to `lib/stripe/subscriptions.ts` and replace `changeSubscription`:
```ts
export async function changeSubscription(subscriptionId: string, input: unknown, by: string): Promise<SubscriptionActionRow> {
  const res = SubscriptionActionSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))

  if (isLive()) {
    const stripe = getStripeClient()
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: res.data.action === "cancel" })
    return { id: subscriptionId, subscriptionId, action: res.data.action, note: res.data.note ?? null, by, at: new Date().toISOString() }
  }

  const saved = (await prisma.stripeSubscriptionAction.create({
    data: { subscriptionId, action: res.data.action, note: res.data.note ?? null, by },
  })) as DbAction
  return mapAction(saved)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/billing/subscriptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/subscriptions.ts tests/billing/subscriptions.test.ts
git commit -m "feat(stripe): wire live changeSubscription"
```

---

### Task 11: Wire mutators — setCardControl + submitDisputeEvidence (live)

**Files:**
- Modify: `lib/stripe/issuing.ts:35-55`
- Modify: `tests/billing/issuing.test.ts` (replace the two live `StripeNotWiredError` cases)

**Interfaces:**
- `setCardControl` maps state→Stripe status: `active`→`active`, `paused`→`inactive`, `canceled`→`canceled`.

- [ ] **Step 1: Replace the live-mode test cases**

In `tests/billing/issuing.test.ts`, add `vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));`, import `getStripeClient`, and replace the two live `StripeNotWiredError` cases with:
```ts
it('updates the Issuing card status in live mode (paused -> inactive)', async () => {
  live.mockReturnValue(true);
  const update = vi.fn().mockResolvedValue({ id: 'ic_1', status: 'inactive' });
  (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ issuing: { cards: { update }, disputes: {} } });
  const r = await setCardControl('ic_1', { state: 'paused' }, 'op');
  expect(update).toHaveBeenCalledWith('ic_1', { status: 'inactive' });
  expect(prisma.stripeCardControl.upsert).not.toHaveBeenCalled();
  expect(r).toEqual({ cardId: 'ic_1', state: 'paused' });
});
it('submits dispute evidence in live mode', async () => {
  live.mockReturnValue(true);
  const update = vi.fn().mockResolvedValue({ id: 'idp_1' });
  const submit = vi.fn().mockResolvedValue({ id: 'idp_1' });
  (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ issuing: { cards: {}, disputes: { update, submit } } });
  const r = await submitDisputeEvidence('idp_1', { evidence: 'receipt attached' }, 'op');
  expect(update).toHaveBeenCalled();
  expect(submit).toHaveBeenCalledWith('idp_1');
  expect(prisma.stripeDisputeEvidence.create).not.toHaveBeenCalled();
  expect(r).toEqual({ disputeId: 'idp_1' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/issuing.test.ts`
Expected: FAIL (live still throws).

- [ ] **Step 3: Rewrite both mutators**

Add `import { getStripeClient } from "@/lib/stripe/client"` to `lib/stripe/issuing.ts`. Replace the `StripeNotWiredError` branch in `setCardControl`:
```ts
  if (isLive()) {
    const stripe = getStripeClient()
    const status = res.data.state === "active" ? "active" : res.data.state === "paused" ? "inactive" : "canceled"
    await (stripe as any).issuing.cards.update(cardId, { status })
    return { cardId, state: res.data.state }
  }
```
And in `submitDisputeEvidence`:
```ts
  if (isLive()) {
    const stripe = getStripeClient()
    await (stripe as any).issuing.disputes.update(disputeId, { evidence: { other: { explanation: res.data.evidence } } })
    await (stripe as any).issuing.disputes.submit(disputeId)
    return { disputeId }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/billing/issuing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/issuing.ts tests/billing/issuing.test.ts
git commit -m "feat(stripe): wire live issuing mutators"
```

---

### Task 12: Wire mutator — confirmIntent (refund + ACH)

**Files:**
- Modify: `lib/stripe/money.ts` (`loadQueued` returns the intent; live branch in `confirmIntent`)
- Modify: `tests/billing/money.test.ts` (replace the `throws StripeNotWiredError in live mode` case)

**Interfaces:**
- `confirmIntent` live: REFUND → `refunds.create`; ACH_TRANSFER → Treasury outbound/inbound using env `STRIPE_TREASURY_FINANCIAL_ACCOUNT` and the intent's `counterparty` as the Stripe payment-method id. On any Stripe error the intent stays QUEUED. On success it is marked CONFIRMED (same as seed).

- [ ] **Step 1: Replace the live-mode test case**

In `tests/billing/money.test.ts`, add `vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));`, import `getStripeClient`, and replace the `confirmIntent` `throws StripeNotWiredError in live mode` case with:
```ts
it('executes a real refund in live mode then marks CONFIRMED', async () => {
  live.mockReturnValue(true);
  const refunds = { create: vi.fn().mockResolvedValue({ id: 're_1' }) };
  (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ refunds });
  smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED', kind: 'REFUND', reference: 'ch_1', amount: 2900, direction: null, counterparty: null, memo: null });
  smi.update.mockResolvedValueOnce({ id: 'm1', kind: 'REFUND', direction: null, amount: 2900, counterparty: null, reference: 'ch_1', memo: null, status: 'CONFIRMED', requestedBy: 'r', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: 'op', decidedAt: new Date('2026-06-04T00:00:00Z') });
  const r = await confirmIntent('m1', 'op');
  expect(refunds.create).toHaveBeenCalledWith({ charge: 'ch_1', amount: 2900 });
  expect(smi.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'CONFIRMED', decidedBy: 'op', decidedAt: expect.any(Date) } });
  expect(r.status).toBe('CONFIRMED');
});
it('leaves the intent QUEUED if the Stripe refund fails', async () => {
  live.mockReturnValue(true);
  (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ refunds: { create: vi.fn().mockRejectedValue(new Error('card_declined')) } });
  smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED', kind: 'REFUND', reference: 'ch_1', amount: 2900, direction: null, counterparty: null, memo: null });
  await expect(confirmIntent('m1', 'op')).rejects.toBeInstanceOf(BillingError);
  expect(smi.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/billing/money.test.ts`
Expected: FAIL (live still throws `StripeNotWiredError`).

- [ ] **Step 3: Rewrite loadQueued + confirmIntent**

Add `import { getStripeClient } from "@/lib/stripe/client"` to `lib/stripe/money.ts`. Change `loadQueued` to return the intent, and rewrite `confirmIntent`:
```ts
async function loadQueued(id: string): Promise<DbIntent> {
  const intent = (await prisma.stripeMoneyIntent.findUnique({ where: { id } })) as DbIntent | null
  if (!intent || intent.status !== "QUEUED") throw new BillingError("Intent not found or not in QUEUED state")
  return intent
}

async function executeIntent(intent: DbIntent): Promise<void> {
  const stripe = getStripeClient()
  if (intent.kind === "REFUND") {
    if (!intent.reference) throw new BillingError("Refund intent missing charge reference")
    await stripe.refunds.create({ charge: intent.reference, amount: intent.amount })
    return
  }
  // ACH_TRANSFER via Treasury
  const fa = process.env.STRIPE_TREASURY_FINANCIAL_ACCOUNT
  if (!fa) throw new BillingError("STRIPE_TREASURY_FINANCIAL_ACCOUNT not set")
  if (!intent.counterparty) throw new BillingError("ACH intent missing counterparty payment method")
  if (intent.direction === "out") {
    await (stripe as any).treasury.outboundPayments.create({
      financial_account: fa, amount: intent.amount, currency: "usd",
      destination_payment_method: intent.counterparty, description: intent.memo ?? undefined,
    })
  } else {
    await (stripe as any).treasury.inboundTransfers.create({
      financial_account: fa, amount: intent.amount, currency: "usd",
      origin_payment_method: intent.counterparty, description: intent.memo ?? undefined,
    })
  }
}

export async function confirmIntent(id: string, by: string): Promise<MoneyIntentRow> {
  const intent = await loadQueued(id)
  if (isLive()) {
    try {
      await executeIntent(intent)
    } catch (e) {
      if (e instanceof BillingError) throw e
      throw new BillingError(`Stripe execution failed: ${(e as Error).message}`)
    }
  }
  const updated = (await prisma.stripeMoneyIntent.update({
    where: { id }, data: { status: "CONFIRMED", decidedBy: by, decidedAt: new Date() },
  })) as DbIntent
  return map(updated)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/billing/money.test.ts`
Expected: PASS (seed cases + new refund-success + refund-failure cases).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/money.ts tests/billing/money.test.ts
git commit -m "feat(stripe): wire live confirmIntent (refund + ACH, fail-closed)"
```

---

### Task 13: Full verification

**Files:** none (gate task).

- [ ] **Step 1: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors. If `apiVersion` errors, set `STRIPE_API_VERSION` to the string the SDK expects, recommit Task 1.

- [ ] **Step 2: Full test suite**

Run: `CI=true node_modules/.bin/vitest run`
Expected: All green. Baseline was 419 passed / 50 skipped; this adds the new `live-*` + `client` tests and replaces the obsolete `StripeNotWiredError`-in-live cases — net pass count goes up, **zero failures**.

- [ ] **Step 3: Production build**

Run: `node_modules/.bin/next build`
Expected: exit 0 (the `stripe` SDK must not break the client bundle — it's only imported by server-only `client.ts`).

- [ ] **Step 4: Commit any version pin fix**

```bash
git add -A && git commit -m "chore(stripe): finalize live-wiring (tsc + suite green)" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Client (server-only, config.ts stays client-safe) → Task 1. ✓
- Per-surface live split (subscriptions/promo/customers/treasury/issuing) → Tasks 3-7. ✓
- Graceful degrade → Task 2 + applied in Task 8. ✓
- Offramp delegates to seed → Task 8. ✓
- 5 mutators (createPromoCode, changeSubscription, setCardControl, submitDisputeEvidence, confirmIntent refund+ACH) → Tasks 9-12. ✓
- ACH via env financial account + counterparty id, fail-closed → Task 12. ✓
- `stripe` dep, mocked-SDK tests, seed suite stays green → Tasks 1, all test steps, Task 13. ✓
- Webhooks / Identity / On-ramp / live offramp explicitly OUT — none added. ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/uncoded steps. Stripe-API doc links are reference notes, not placeholders; every code step has full code. The one runtime-resolved value is `STRIPE_API_VERSION` (Task 1 / Task 13 Step 1 tell exactly how to set it).

**3. Type consistency:** `getStripeClient`/`STRIPE_API_VERSION` (Task 1) used in Tasks 3-12. `degradeIfUnavailable` (Task 2) used in Task 8. `live*` fn names (Tasks 3-7) imported in Task 8 match. `loadQueued` return type change (Task 12) is self-contained in money.ts. Mutator return shapes match their existing signatures (unchanged).
