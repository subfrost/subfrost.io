# F2-D4 — Stripe billing console: Customers / billing portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Customers / billing-portal surface — a per-customer view (subscriptions, invoices, payment methods, recent charges) with a **refund** action routed through the money-movement guardrail — completing Plano D. Gated by `MANAGE_BILLING`.

**Architecture:** Extends D1–D3. New customer read shapes + a `RefundSchema` in `lib/stripe/shapes.ts`; a shared `lib/stripe/format.ts` (currency helpers, deduping the 4 D3 components); two new `StripeSource` reads (`customerSummaries`, `customerDetail`); a `lib/stripe/customers.ts` read lib; `queueRefund` added to the existing `lib/stripe/money.ts` (kind `REFUND` — reusing the guardrail confirm/cancel); new gated actions; a `CustomersManager` that reuses the shared `MoneyIntentQueue` for the refund queue; the `customers` hub card flipped to `ready`; and a final dedup pass.

**Tech Stack:** Next 16 App Router, Prisma/Postgres, zod, React 18, Tailwind (zinc), `@/components/ui/*`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-f2-plano-d-stripe-design.md`. Sub-plan **4 of 4** (D1✅ D2✅ D3✅ **D4=Customers**). After this, all 7 hub surfaces are `ready` and Plano D is complete.

## Foundation this plan consumes (already on the branch)
- `lib/stripe/config.ts` — `isLive()`, `BillingError`, `StripeNotWiredError`.
- `lib/stripe/shapes.ts` — money-ops + revenue shapes (D1–D3). You APPEND customer shapes + `RefundSchema`.
- `lib/stripe/source/{types,seed,live,index}.ts` — `StripeSource` + `getStripeSource()`. You EXTEND types/seed/live with 2 customer reads.
- `lib/stripe/money.ts` — `MoneyIntentRow`, `listIntents(kind?)`, `queueAchTransfer`, `confirmIntent`, `cancelIntent`. You ADD `queueRefund`. Uses `prisma.stripeMoneyIntent` (kind `REFUND` is already an enum value from D1).
- `actions/cms/billing.ts` — `"use server"`, `actor()`, `ip()`, and D1–D3 actions including `confirmIntentAction`/`cancelIntentAction` (generic over money intents — REUSE them for refunds; the manager refetches client-side so their revalidate target is immaterial). Config import already has `BillingError, StripeNotWiredError`.
- `components/cms/billing/MoneyIntentQueue.tsx` — shared, props `{ intents, pending, onConfirm, onCancel, error? }`. REUSE for the refund queue.
- `app/admin/billing/page.tsx` — `SURFACES` (flip `customers` to `ready:true`; it is the last `false`).
- The 4 D3/earlier managers each have a local `centsToUsd`/`centsToDisplay` helper — Task 7 dedups them into `lib/stripe/format.ts`.

## Global Constraints
- **Branch:** `feat/compliance-aml-stripe`. **No PR, no push, no touching main** until flex approves — commit locally only.
- **Prisma:** D1 models cover D4 (`StripeMoneyIntent` with `kind:"REFUND"`, `reference` field). NO schema change; no `prisma generate`/`db push`.
- **Refund = money movement → guardrail:** `queueRefund` writes a `QUEUED` `StripeMoneyIntent` (`kind:"REFUND"`, `reference`=chargeId/invoiceId) in BOTH modes; confirm/cancel reuse the existing guardrail (`confirmIntent` throws `StripeNotWiredError` in live; `cancelIntent` local both modes). Never auto-execute.
- **Reads:** `customers.ts` is pure source passthrough returning `{ ..., live }`. No overlays.
- **`lib/stripe/shapes.ts` and `lib/stripe/format.ts` stay client-safe** (shapes: only zod; format: no imports). Managers import value fns/consts from these + row TYPES via `import type` (never a value import of a prisma-touching lib into a client component).
- **Stripe-backed page renders the banner:** the customers page renders `<BillingBanner live={isLive()} />`.
- **Theme zinc, mobile-first**; mirror existing managers.
- **Test mocks:** mock `@/lib/prisma`, `@/lib/cms/authz`, `@/lib/cms/audit`, `next/cache`, `next/headers`; for source-reading libs mock `@/lib/stripe/source` + partial-mock `@/lib/stripe/config`. Tests under `tests/billing/`.
- **Verify gate (per task):** `node_modules/.bin/tsc --noEmit` → 0; `CI=true node_modules/.bin/vitest run` → green (controller-verified baseline **400** + new). Report the EXACT counts vitest prints.
- **Untracked `.npmrc` must NEVER be `git add`ed.** Each commit stages only the files its task names.

---

### Task 1: Customer shapes + RefundSchema + format helpers (TDD)

**Files:** Modify `lib/stripe/shapes.ts` (append); Create `lib/stripe/format.ts`; Test `tests/billing/shapes-customers.test.ts`, `tests/billing/format.test.ts`.

**Interfaces:**
- shapes (append, client-safe): `CustomerSummary`, `CustomerSubscriptionRef`, `CustomerInvoice`, `CustomerPaymentMethod`, `CustomerCharge`, `CustomerDetail`; zod `RefundSchema` (`{ reference: string min(1), amount: positive int, reason?: string }`) + `RefundInput`.
- `lib/stripe/format.ts` (client-safe, no imports): `centsToUsd(cents: number): string` → unsigned `"$X.XX"` of the absolute value; `centsToDisplay(cents: number): string` → signed (`"-$X.XX"` for negatives).

- [ ] **Step 1: Write the failing tests.** `tests/billing/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { centsToUsd, centsToDisplay } from '@/lib/stripe/format';

describe('format', () => {
  it('centsToUsd is unsigned with 2 decimals', () => {
    expect(centsToUsd(1234)).toBe('$12.34');
    expect(centsToUsd(-500)).toBe('$5.00');
    expect(centsToUsd(0)).toBe('$0.00');
  });
  it('centsToDisplay is signed', () => {
    expect(centsToDisplay(1234)).toBe('$12.34');
    expect(centsToDisplay(-500)).toBe('-$5.00');
  });
});
```

`tests/billing/shapes-customers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RefundSchema } from '@/lib/stripe/shapes';

describe('RefundSchema', () => {
  it('accepts a valid refund', () => {
    expect(RefundSchema.safeParse({ reference: 'ch_1', amount: 500 }).success).toBe(true);
    expect(RefundSchema.safeParse({ reference: 'ch_1', amount: 500, reason: 'duplicate' }).success).toBe(true);
  });
  it('rejects empty reference and non-positive amount', () => {
    expect(RefundSchema.safeParse({ reference: '', amount: 500 }).success).toBe(false);
    expect(RefundSchema.safeParse({ reference: 'ch_1', amount: 0 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → RED** (modules/exports missing).

- [ ] **Step 3: Create `lib/stripe/format.ts`:**

```ts
/** Currency formatting helpers for the billing console UI. Client-safe (no imports). */
export function centsToUsd(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`
}
export function centsToDisplay(cents: number): string {
  return `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`
}
```

- [ ] **Step 4: Append to `lib/stripe/shapes.ts`** (after the money-ops block):

```ts

// --- Customers / billing portal (D4) ---
export type CustomerSummary = {
  id: string; email: string; name: string
  activeSubscriptions: number; lifetimeValue: number // cents
  createdAt: string
}
export type CustomerSubscriptionRef = {
  id: string; tier: string; status: string; renewsAt: string | null
}
export type CustomerInvoice = {
  id: string; number: string; amountDue: number // cents
  status: "draft" | "open" | "paid" | "void" | "uncollectible"; createdAt: string
}
export type CustomerPaymentMethod = {
  id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean
}
export type CustomerCharge = {
  id: string; amount: number // cents
  status: "succeeded" | "pending" | "failed" | "refunded"
  description: string | null; createdAt: string
}
export type CustomerDetail = {
  id: string; email: string; name: string
  subscriptions: CustomerSubscriptionRef[]
  invoices: CustomerInvoice[]
  paymentMethods: CustomerPaymentMethod[]
  recentCharges: CustomerCharge[]
}

export const RefundSchema = z.object({
  reference: z.string().min(1), // chargeId or invoiceId
  amount: z.number().int().positive(), // cents
  reason: z.string().optional(),
})
export type RefundInput = z.infer<typeof RefundSchema>
```

- [ ] **Step 5: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` (0) + full suite.
- [ ] **Step 6: Commit**

```bash
git add lib/stripe/format.ts lib/stripe/shapes.ts tests/billing/format.test.ts tests/billing/shapes-customers.test.ts
git commit -m "feat(billing): customer shapes + refund zod + shared currency format helpers"
```

---

### Task 2: Extend the source with customer reads (TDD)

**Files:** Modify `lib/stripe/source/types.ts`, `lib/stripe/source/seed.ts`, `lib/stripe/source/live.ts`; Test `tests/billing/source-customers.test.ts`.

**Interfaces:** `StripeSource` gains `customerSummaries(): Promise<CustomerSummary[]>` and `customerDetail(id: string): Promise<CustomerDetail | null>`. `seedSource` returns deterministic customers + per-id detail (null for unknown id). `liveSource` stubs both via the existing `nope(...)`.

- [ ] **Step 1: Write the failing test** — `tests/billing/source-customers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedSource } from '@/lib/stripe/source/seed';
import { liveSource } from '@/lib/stripe/source/live';
import { StripeNotWiredError } from '@/lib/stripe/config';

describe('seedSource customers', () => {
  it('returns deterministic customer summaries', async () => {
    const a = await seedSource.customerSummaries();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(await seedSource.customerSummaries());
    expect(a[0].email).toBeTruthy();
  });
  it('returns detail for a known id and null for unknown', async () => {
    const summaries = await seedSource.customerSummaries();
    const d = await seedSource.customerDetail(summaries[0].id);
    expect(d?.id).toBe(summaries[0].id);
    expect(Array.isArray(d?.recentCharges)).toBe(true);
    expect(await seedSource.customerDetail('cus_does_not_exist')).toBeNull();
  });
});

describe('liveSource customers', () => {
  it('rejects with StripeNotWiredError', async () => {
    await expect(liveSource.customerSummaries()).rejects.toBeInstanceOf(StripeNotWiredError);
    await expect(liveSource.customerDetail('cus_1')).rejects.toBeInstanceOf(StripeNotWiredError);
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Extend `lib/stripe/source/types.ts`** — add the two types to the shapes import and two methods to the interface (after `promoCodes()`):

```ts
import type {
  TreasuryBalance, TreasuryTransaction, IssuingCard, IssuingDispute, OfframpSettlement,
  SubscriptionTier, Subscriber, PromoCode, CustomerSummary, CustomerDetail,
} from "@/lib/stripe/shapes"
```

```ts
  customerSummaries(): Promise<CustomerSummary[]>
  customerDetail(id: string): Promise<CustomerDetail | null>
```

- [ ] **Step 4: Extend `lib/stripe/source/seed.ts`** — add a deterministic customer dataset + the two methods (after `promoCodes`). Use the existing `ago()` helper:

```ts
  async customerSummaries() {
    return [
      { id: "cus_ada", email: "ada.lovelace@example.com", name: "Ada Lovelace", activeSubscriptions: 1, lifetimeValue: 1_240_00, createdAt: ago(24 * 300) },
      { id: "cus_bg", email: "bg@example.com", name: "Beatrice Glass", activeSubscriptions: 1, lifetimeValue: 89_00, createdAt: ago(24 * 30) },
      { id: "cus_carl", email: "carl@example.com", name: "Carl Marx", activeSubscriptions: 0, lifetimeValue: 4_990_00, createdAt: ago(24 * 600) },
    ]
  },
  async customerDetail(id: string) {
    const details: Record<string, import("@/lib/stripe/shapes").CustomerDetail> = {
      cus_ada: {
        id: "cus_ada", email: "ada.lovelace@example.com", name: "Ada Lovelace",
        subscriptions: [{ id: "sub_001", tier: "Pro", status: "active", renewsAt: ago(-24 * 20) }],
        invoices: [
          { id: "in_a1", number: "INV-0001", amountDue: 29_00, status: "paid", createdAt: ago(24 * 20) },
          { id: "in_a2", number: "INV-0002", amountDue: 29_00, status: "open", createdAt: ago(24 * 1) },
        ],
        paymentMethods: [{ id: "pm_a1", brand: "visa", last4: "4242", expMonth: 11, expYear: 2028, isDefault: true }],
        recentCharges: [
          { id: "ch_a1", amount: 29_00, status: "succeeded", description: "Pro monthly", createdAt: ago(24 * 20) },
          { id: "ch_a2", amount: 29_00, status: "succeeded", description: "Pro monthly", createdAt: ago(24 * 50) },
        ],
      },
      cus_bg: {
        id: "cus_bg", email: "bg@example.com", name: "Beatrice Glass",
        subscriptions: [{ id: "sub_002", tier: "Basic", status: "trialing", renewsAt: ago(-24 * 11) }],
        invoices: [{ id: "in_b1", number: "INV-0003", amountDue: 9_00, status: "open", createdAt: ago(24 * 2) }],
        paymentMethods: [{ id: "pm_b1", brand: "mastercard", last4: "4444", expMonth: 4, expYear: 2027, isDefault: true }],
        recentCharges: [{ id: "ch_b1", amount: 9_00, status: "pending", description: "Basic monthly", createdAt: ago(24 * 2) }],
      },
      cus_carl: {
        id: "cus_carl", email: "carl@example.com", name: "Carl Marx",
        subscriptions: [],
        invoices: [{ id: "in_c1", number: "INV-0004", amountDue: 499_00, status: "paid", createdAt: ago(24 * 40) }],
        paymentMethods: [{ id: "pm_c1", brand: "amex", last4: "0005", expMonth: 1, expYear: 2026, isDefault: true }],
        recentCharges: [{ id: "ch_c1", amount: 499_00, status: "succeeded", description: "Institutional monthly", createdAt: ago(24 * 40) }],
      },
    }
    return details[id] ?? null
  },
```

- [ ] **Step 5: Extend `lib/stripe/source/live.ts`** — add two stubs to `liveSource` (after `promoCodes`):

```ts
  customerSummaries: nope("customerSummaries"),
  customerDetail: nope("customerDetail"),
```

(The `nope(method)` factory returns a zero-arg rejecter; it satisfies the `customerDetail(id)` signature because an implementation may ignore its parameters.)

- [ ] **Step 6: Run → GREEN.** Then `tsc --noEmit` (0) + full suite.
- [ ] **Step 7: Commit**

```bash
git add lib/stripe/source/types.ts lib/stripe/source/seed.ts lib/stripe/source/live.ts tests/billing/source-customers.test.ts
git commit -m "feat(billing): extend Stripe read source with customer summaries + detail"
```

---

### Task 3: queueRefund in the money guardrail (TDD)

**Files:** Modify `lib/stripe/money.ts` (add `queueRefund`); Test `tests/billing/money.test.ts` (extend).

**Interfaces:** `queueRefund(input: unknown, by: string): Promise<MoneyIntentRow>` — validate `RefundSchema` (else `BillingError`, no write); create `StripeMoneyIntent` `{ kind:"REFUND", amount, reference, memo: reason ?? null, status:"QUEUED", requestedBy: by }` in BOTH modes (queueing is local). `confirmIntent`/`cancelIntent` already handle any kind.

- [ ] **Step 1: Extend `tests/billing/money.test.ts`** — import `queueRefund` and `RefundSchema` path is internal; add a describe block (the prisma + config mocks already exist in this file):

```ts
describe('queueRefund', () => {
  it('rejects invalid input without writing', async () => {
    await expect(queueRefund({ reference: '', amount: 100 }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(smi.create).not.toHaveBeenCalled();
  });
  it('queues a REFUND intent (reference + reason→memo) in both modes', async () => {
    for (const liveMode of [false, true]) {
      vi.clearAllMocks();
      live.mockReturnValue(liveMode);
      smi.create.mockResolvedValueOnce({ id: 'r1', kind: 'REFUND', direction: null, amount: 2900, counterparty: null, reference: 'ch_a1', memo: 'duplicate', status: 'QUEUED', requestedBy: 'op', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: null, decidedAt: null });
      const r = await queueRefund({ reference: 'ch_a1', amount: 2900, reason: 'duplicate' }, 'op');
      expect(smi.create).toHaveBeenCalledWith({ data: { kind: 'REFUND', amount: 2900, reference: 'ch_a1', memo: 'duplicate', status: 'QUEUED', requestedBy: 'op' } });
      expect(r.kind).toBe('REFUND');
    }
  });
});
```

(Add `queueRefund` to the import from `@/lib/stripe/money` at the top of the test file.)

- [ ] **Step 2: Run → RED** (`queueRefund` not exported).

- [ ] **Step 3: Add to `lib/stripe/money.ts`** — import `RefundSchema` (extend the existing `@/lib/stripe/shapes` import to include it alongside `QueueTransferSchema`), then:

```ts
export async function queueRefund(input: unknown, by: string): Promise<MoneyIntentRow> {
  const res = RefundSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { reference, amount, reason } = res.data
  const saved = (await prisma.stripeMoneyIntent.create({
    data: { kind: "REFUND", amount, reference, memo: reason ?? null, status: "QUEUED", requestedBy: by },
  })) as DbIntent
  return map(saved)
}
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0) + full suite.
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/money.ts tests/billing/money.test.ts
git commit -m "feat(billing): queueRefund in the money guardrail (kind=REFUND)"
```

---

### Task 4: Customers read lib (TDD)

**Files:** Create `lib/stripe/customers.ts`; Test `tests/billing/customers.test.ts`.

**Interfaces:**
- `listCustomers(): Promise<{ customers: CustomerSummary[]; live: boolean }>` — `getStripeSource().customerSummaries()` + `isLive()`.
- `getCustomer(id: string): Promise<{ customer: CustomerDetail | null; live: boolean }>` — `getStripeSource().customerDetail(id)` + `isLive()`.

(Refunds go through `queueRefund` in `money.ts` — `customers.ts` is reads only.)

- [ ] **Step 1: Write the failing test** — `tests/billing/customers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listCustomers, getCustomer } from '@/lib/stripe/customers';
import { getStripeSource } from '@/lib/stripe/source';
import { isLive } from '@/lib/stripe/config';

const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    customerSummaries: vi.fn(async () => [{ id: 'cus_1', email: 'a@x.z', name: 'A', activeSubscriptions: 1, lifetimeValue: 1000, createdAt: '2026-01-01T00:00:00.000Z' }]),
    customerDetail: vi.fn(async (id: string) => id === 'cus_1' ? { id: 'cus_1', email: 'a@x.z', name: 'A', subscriptions: [], invoices: [], paymentMethods: [], recentCharges: [] } : null),
  });
});

describe('listCustomers', () => {
  it('returns summaries + live flag', async () => {
    const r = await listCustomers();
    expect(r.live).toBe(false);
    expect(r.customers[0].id).toBe('cus_1');
  });
});

describe('getCustomer', () => {
  it('returns detail for a known id', async () => {
    const r = await getCustomer('cus_1');
    expect(r.customer?.id).toBe('cus_1');
    expect(r.live).toBe(false);
  });
  it('returns null for an unknown id', async () => {
    const r = await getCustomer('cus_x');
    expect(r.customer).toBeNull();
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/customers.ts`:**

```ts
/** Customers / billing-portal reads. Pure source passthrough; refunds go through
 *  lib/stripe/money.ts (queueRefund). Gated via actions/cms/billing.ts. */
import { isLive } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import type { CustomerSummary, CustomerDetail } from "@/lib/stripe/shapes"

export async function listCustomers(): Promise<{ customers: CustomerSummary[]; live: boolean }> {
  const live = isLive()
  return { customers: await getStripeSource().customerSummaries(), live }
}

export async function getCustomer(id: string): Promise<{ customer: CustomerDetail | null; live: boolean }> {
  const live = isLive()
  return { customer: await getStripeSource().customerDetail(id), live }
}
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0) + full suite.
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/customers.ts tests/billing/customers.test.ts
git commit -m "feat(billing): customers read lib (summaries + detail)"
```

---

### Task 5: Customer + refund actions + audit literal (TDD)

**Files:** Modify `actions/cms/billing.ts` (append), `lib/cms/audit.ts` (one literal); Test `tests/billing/actions-customers.test.ts`.

**Interfaces (gated `MANAGE_BILLING`, reusing `actor()`/`ip()`):**
- `listCustomersAction()` → `{ ok:true; customers: CustomerSummary[]; live } | {ok:false,error}` (read).
- `getCustomerAction(id)` → `{ ok:true; customer: CustomerDetail | null; live } | {ok:false,error}` (read).
- `listRefundIntentsAction()` → `{ ok:true; intents: MoneyIntentRow[] } | {ok:false,error}` (calls `listIntents("REFUND")`).
- `requestRefundAction(input)` → `{ ok:true } | {ok:false,error}` — calls `queueRefund`, audits `"stripe_refund_request"` (target=`input.reference`), revalidates `/admin/billing/customers`; maps `BillingError`+`StripeNotWiredError`.
- (Refund confirm/cancel reuse the existing `confirmIntentAction`/`cancelIntentAction`.)

- [ ] **Step 1: Add the audit literal** `| "stripe_refund_request"` to the `AuditAction` union in `lib/cms/audit.ts`.

- [ ] **Step 2: Write the failing test** — `tests/billing/actions-customers.test.ts` (mirror `tests/billing/actions-money.test.ts`): mock `@/lib/cms/authz`, `@/lib/cms/audit`, `next/cache`, `next/headers`, `@/lib/stripe/customers` (`listCustomers`/`getCustomer`), `@/lib/stripe/money` (`listIntents`/`queueRefund`). Cover: gate denial (read + `requestRefundAction`, domain not called); `listCustomersAction` passes `live`; `getCustomerAction('cus_1')` returns the detail; `listRefundIntentsAction` calls `listIntents('REFUND')`; `requestRefundAction({reference:'ch_a1',amount:2900})` audits `"stripe_refund_request"` target `ch_a1` + revalidates `/admin/billing/customers`; a `BillingError` from `queueRefund` maps to `{ok:false}` without audit. Use the `asUser` helper and the exact mock/assert style of `actions-money.test.ts`.

- [ ] **Step 3: Run → RED.**

- [ ] **Step 4: Append to `actions/cms/billing.ts`.** Add imports (reuse the existing config import; `listIntents`/`MoneyIntentRow` already imported from money.ts in D3 — add `queueRefund` to that existing money import):

```ts
import { listCustomers, getCustomer } from "@/lib/stripe/customers"
import type { CustomerSummary, CustomerDetail } from "@/lib/stripe/shapes"
```

(extend the existing `@/lib/stripe/money` import to add `queueRefund`.) Then:

```ts
export async function listCustomersAction(): Promise<
  { ok: true; customers: CustomerSummary[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { customers, live } = await listCustomers()
  return { ok: true, customers, live }
}

export async function getCustomerAction(id: string): Promise<
  { ok: true; customer: CustomerDetail | null; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { customer, live } = await getCustomer(id)
  return { ok: true, customer, live }
}

export async function listRefundIntentsAction(): Promise<
  { ok: true; intents: MoneyIntentRow[] } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  return { ok: true, intents: await listIntents("REFUND") }
}

export async function requestRefundAction(
  input: { reference: string; amount: number; reason?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await queueRefund(input, a.me.email)
    await audit("stripe_refund_request", { actorId: a.me.id, target: input.reference, ip: await ip() })
    revalidatePath("/admin/billing/customers")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}
```

- [ ] **Step 5: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` + full suite.
- [ ] **Step 6: Commit**

```bash
git add actions/cms/billing.ts lib/cms/audit.ts tests/billing/actions-customers.test.ts
git commit -m "feat(billing): customer + refund actions + audit literal"
```

---

### Task 6: Customers page + manager + refund queue + hub card

**Files:** Create `app/admin/billing/customers/page.tsx`, `components/cms/billing/CustomersManager.tsx`; Modify `app/admin/billing/page.tsx` (flip `customers` to `ready:true`). No UI unit test.

**Interfaces:** Consumes `listCustomersAction`/`getCustomerAction`/`listRefundIntentsAction`/`requestRefundAction` (Task 5) + the existing `confirmIntentAction`/`cancelIntentAction` (D3), `CustomerSummary`/`CustomerDetail` (shapes), `MoneyIntentRow` (money), `centsToUsd`/`centsToDisplay` (format), `isLive`. Reuses `MoneyIntentQueue`.

- [ ] **Step 1: Flip the hub card** in `app/admin/billing/page.tsx`: change the `customers` entry to `ready: true`. (After this, all 7 surfaces are `ready`.)

- [ ] **Step 2: Create `app/admin/billing/customers/page.tsx`** — mirror the subscriptions page: `dynamic="force-dynamic"`, gate `MANAGE_BILLING`, heading "Customers" + short description ("Per-customer subscriptions, invoices, payment methods, and charges. Refunds are queued for confirmation."), `<BillingBanner live={isLive()} />` then `<CustomersManager />`.

- [ ] **Step 3: Create `components/cms/billing/CustomersManager.tsx`** — `"use client"`, mobile-first, zinc, mirror the existing managers. Requirements:
  - On mount call `listCustomersAction()` and `listRefundIntentsAction()`; top-level error banner on `{ok:false}`.
  - **Customer list:** a search `Input` (filter by email/name client-side) + stacked summary cards (name, email, activeSubscriptions, lifetimeValue via `centsToUsd`, createdAt locale). Each card has an "Expand" / "View detail" toggle.
  - **Detail (lazy):** when a customer is expanded, call `getCustomerAction(customer.id)` (cache the result in state by id); render: Subscriptions (tier, status badge, renewsAt or "—"); Invoices (number, amountDue via `centsToUsd`, status badge, createdAt); Payment methods (brand •••• last4, exp MM/YY, default badge); Recent charges (description, amount via `centsToUsd`, status badge, createdAt). For each charge with `status === "succeeded"`, a "Refund" button opening a small inline form (amount number Input defaulting to the charge amount in cents, reason optional Input) → `requestRefundAction({ reference: charge.id, amount: Number(amount), reason: reason || undefined })` in a `useTransition`; on success refetch the refund intents; on `{ok:false}` show an error.
  - **Refund queue:** render `<MoneyIntentQueue intents={refundIntents} pending={pending} onConfirm={(id)=>handle(confirmIntentAction(id))} onCancel={(id)=>handle(cancelIntentAction(id))} error={refundError} />`; on confirm/cancel success refetch the refund intents (await).
  - Import value fns from `@/lib/stripe/format` and `@/lib/stripe/shapes`; row TYPES (`CustomerSummary`/`CustomerDetail`) via `import type` from `@/lib/stripe/shapes`; `MoneyIntentRow` via `import type` from `@/lib/stripe/money`.

- [ ] **Step 4: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green.

- [ ] **Step 5: Commit**

```bash
git add app/admin/billing/page.tsx app/admin/billing/customers/page.tsx components/cms/billing/CustomersManager.tsx
git commit -m "feat(billing): customers page + manager + refund queue + hub card (mobile-first)"
```

---

### Task 7: Dedup currency helpers into the shared format module

**Files:** Modify `components/cms/billing/MoneyIntentQueue.tsx`, `components/cms/billing/TreasuryManager.tsx`, `components/cms/billing/IssuingManager.tsx`, `components/cms/billing/OfframpManager.tsx`. No new tests (pure refactor; behavior unchanged — covered by the existing suite staying green).

**Goal:** Replace each component's local currency helper with the shared `lib/stripe/format.ts` (Task 1), resolving the duplication flagged in the D3 review. Behavior must be identical (`centsToUsd` unsigned, `centsToDisplay` signed).

- [ ] **Step 1:** In each of the four components, **delete the local `const centsToUsd`/`centsToDisplay` (or `centsToDisplay`) helper definition** and add an import: `import { centsToUsd, centsToDisplay } from "@/lib/stripe/format"` (import ONLY the names that file actually uses — some use only one). Keep every call site unchanged (the names match). Do not change any other logic.

- [ ] **Step 2: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; suite green at the same count as before this task (no tests added/removed). Report exact counts.

- [ ] **Step 3: Commit**

```bash
git add components/cms/billing/MoneyIntentQueue.tsx components/cms/billing/TreasuryManager.tsx components/cms/billing/IssuingManager.tsx components/cms/billing/OfframpManager.tsx
git commit -m "refactor(billing): dedup currency helpers into lib/stripe/format"
```

---

## Self-Review

**Spec coverage (D4 = Customers row of the spec's sub-plan table):**
- Per-customer view: summaries + detail (subscriptions/invoices/payment methods/charges) → Tasks 1,2,4 (shapes/source/lib) + Task 6 (UI). ✅
- Refund via the money guardrail (queue+confirm, reusing `money.ts` + `MoneyIntentQueue`) → Task 3 (`queueRefund`) + Task 5 (`requestRefundAction` + reused confirm/cancel) + Task 6 (refund form + queue). ✅
- `MANAGE_BILLING` gating + audit + 1 audit literal → Task 5. ✅
- `customers` hub card flipped → Task 6 (all 7 surfaces now ready). ✅
- Shared `lib/stripe/format.ts` dedup (D3 follow-up) → Task 1 (create) + Task 7 (adopt across the 4 components). ✅
- *Deferred (noted):* live execution of confirmed refunds (the shared `confirmIntent` throws `StripeNotWiredError` in live until the Stripe SDK is wired); customer-side mutations beyond refund (e.g. cancel-sub from the customer view) are out of scope — subscription actions live on the Subscriptions surface (D2). Intentional.

**Placeholder scan:** Tasks 1–5 contain complete code. Task 6 is UI, spec'd to concrete requirements mirroring the existing managers. Task 7 is a mechanical refactor (delete local helper, import shared) with the existing suite as the safety net. No TBD. ✅

**Type consistency:** customer shapes (Task 1) flow through source (Task 2), `customers.ts` (Task 4), actions (Task 5), `CustomersManager` (Task 6). `RefundSchema` (Task 1) → `queueRefund` (Task 3) → `requestRefundAction` (Task 5) → the refund form (Task 6). `queueRefund` returns `MoneyIntentRow` (D3) rendered by the reused `MoneyIntentQueue`. `centsToUsd`/`centsToDisplay` (Task 1) consumed by Tasks 6–7. Audit literal `"stripe_refund_request"` (Task 5) matches its call site. `confirmIntentAction`/`cancelIntentAction` (D3) reused for refunds. ✅

## Notes for follow-up (post-D4 — Plano D complete)
- **Live wiring:** when `STRIPE_SECRET_KEY` is set, replace the `if (isLive()) throw StripeNotWiredError(...)` branches across `money.ts`/`issuing.ts`/`subscriptions.ts`/`promo.ts` with real Stripe SDK calls behind those boundaries, and implement `live.ts` reads (customers + all prior surfaces). No action/UI changes needed. Add the `stripe` dep then.
- After D4, **all of Plano D is built** (D1 Foundation, D2 Revenue, D3 Money-ops, D4 Customers). Next: flex's full review of the branch, then (on his go-ahead) `prisma migrate diff` → `prisma db push` (io-sa) and the PR/merge to main.
