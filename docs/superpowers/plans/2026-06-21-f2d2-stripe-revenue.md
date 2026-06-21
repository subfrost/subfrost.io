# F2-D2 — Stripe billing console: Revenue (subscriptions + promo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Revenue surfaces of the Stripe billing console — subscription tiers + subscribers (with low-risk cancel/resume) and promo codes (list + create) — extending the D1 foundation, gated by `MANAGE_BILLING`.

**Architecture:** Extends the D1 `lib/stripe/` foundation. New read shapes + zod inputs in `lib/stripe/shapes.ts`; three new read methods on the `StripeSource` interface (`subscriptionTiers`, `subscribers`, `promoCodes`) implemented in `seed.ts` (deterministic) and stubbed in `live.ts`. Two new domain libs (`subscriptions.ts`, `promo.ts`) compose `getStripeSource()` reads with seed-mode overlays (`StripeSubscriptionAction`, `StripePromoCode` — created in D1's schema) so the demo is interactive; their low-risk mutations follow the **hybrid** rule (seed → write overlay; live → `StripeNotWiredError` stub, since `isLive()` is false today). New privilege-gated actions in `actions/cms/billing.ts`, two new pages + managers, and the two hub cards flipped to `ready`.

**Tech Stack:** Next 16 App Router, Prisma/Postgres, zod, React 18, Tailwind (zinc), `@/components/ui/*`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-f2-plano-d-stripe-design.md`. Sub-plan **2 of 4** of Plano D (D1=Foundation ✅, **D2=Revenue**, D3=Money-ops, D4=Customers). Built directly on the landed D1 code.

## D1 foundation this plan consumes (already on the branch)
- `lib/stripe/config.ts` — `isLive()`, `DEMO_REASON`, `StripeNotWiredError`, `BillingError`.
- `lib/stripe/shapes.ts` — `SourceResult<T>` + money-ops read types + application zod (you APPEND to this file).
- `lib/stripe/source/{types,seed,live,index}.ts` — `StripeSource` interface + `seedSource`/`liveSource` + `getStripeSource()` (you EXTEND types/seed/live).
- `lib/stripe/applications.ts`, `actions/cms/billing.ts` (`"use server"`, `REQUIRED="MANAGE_BILLING"`, `ip()`, `actor()`, `listApplicationsAction`, `upsertApplicationAction` — you APPEND new actions, reusing `actor()`/`ip()`).
- `app/admin/billing/page.tsx` — the `SURFACES` array (flip `subscriptions` + `promo` to `ready:true`).
- `components/cms/billing/ApplicationsManager.tsx` — the manager pattern to mirror (`"use client"`, `useTransition`, on-mount fetch, per-item action, two-level error banner, zinc cards).
- Prisma models (D1): `StripeSubscriptionAction { id, subscriptionId, action, note, by, at }`, `StripePromoCode { id, code @unique, type StripePromoType, value, maxRedemptions, expiresAt, active, by, createdAt }`, enum `StripePromoType { PERCENT AMOUNT }`. Accessors `prisma.stripeSubscriptionAction`, `prisma.stripePromoCode`.

## Global Constraints

- **Branch:** `feat/compliance-aml-stripe` (continue on it). **No PR, no push, no touching main** until flex approves — commit locally only.
- **Prisma:** D1's models already cover D2 (no schema change in this plan). Do NOT edit `prisma/schema.prisma`; do NOT run `prisma generate`/`db push`.
- **Gating:** every action gates on `MANAGE_BILLING` via the existing `actor()` before any domain call; audit mutations on success only; pages `redirect`.
- **Hybrid write rule (low-risk surfaces):** domain mutation validates first (zod → `BillingError`), then `if (isLive())` throw `StripeNotWiredError("<fn>")` (live wiring deferred), `else` persist the overlay row. Reads compose `getStripeSource()` data with overlays **only in seed mode** (`!isLive()`); in live mode return source data unlayered.
- **`lib/stripe/shapes.ts` stays client-safe** (only `zod`). Managers import value constants from `shapes.ts` and row TYPES via `import type` from the domain libs (never a value import of a prisma-touching lib into a client component).
- **Stripe-backed pages render the demo banner:** `subscriptions` and `promo` pages must render `<BillingBanner live={isLive()} />` (the D1 review flagged this as a soft contract). The hub already shows it.
- **Theme zinc, mobile-first** for all UI; mirror `ApplicationsManager`/`MtlManager`.
- **Test mocks:** mock `@/lib/prisma` (`{ prisma, default }`), `@/lib/cms/authz`, `@/lib/cms/audit`, `next/cache`, `next/headers`; for domain libs that read the source, mock `@/lib/stripe/source` (`getStripeSource`) and partial-mock `@/lib/stripe/config` (override `isLive`, keep real `BillingError`/`StripeNotWiredError`). Tests under `tests/billing/`.
- **Verify gate (per task):** `node_modules/.bin/tsc --noEmit` → 0; `CI=true node_modules/.bin/vitest run` → green (the **332** from D1 + new).
- **Untracked `.npmrc` must NEVER be `git add`ed.** Each commit stages only the files its task names.

---

### Task 1: Revenue shapes + zod inputs (TDD)

**Files:** Modify `lib/stripe/shapes.ts` (append); Test `tests/billing/shapes-revenue.test.ts`.

**Interfaces:** Appends (client-safe): read types `SubscriptionTier`, `Subscriber`, `PromoCode`; const tuples `PROMO_TYPES`, `SUBSCRIPTION_ACTIONS` + label maps `PROMO_TYPE_LABELS`, `SUBSCRIPTION_ACTION_LABELS`; zod `CreatePromoSchema`+`CreatePromoInput`, `SubscriptionActionSchema`+`SubscriptionActionInput`.

- [ ] **Step 1: Write the failing test** — `tests/billing/shapes-revenue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PROMO_TYPES, SUBSCRIPTION_ACTIONS, PROMO_TYPE_LABELS, SUBSCRIPTION_ACTION_LABELS,
  CreatePromoSchema, SubscriptionActionSchema,
} from '@/lib/stripe/shapes';

describe('revenue constants', () => {
  it('promo types are PERCENT/AMOUNT, each labelled', () => {
    expect(PROMO_TYPES).toEqual(['PERCENT', 'AMOUNT']);
    for (const t of PROMO_TYPES) expect(typeof PROMO_TYPE_LABELS[t]).toBe('string');
  });
  it('subscription actions are cancel/resume, each labelled', () => {
    expect(SUBSCRIPTION_ACTIONS).toEqual(['cancel', 'resume']);
    for (const a of SUBSCRIPTION_ACTIONS) expect(typeof SUBSCRIPTION_ACTION_LABELS[a]).toBe('string');
  });
});

describe('CreatePromoSchema', () => {
  it('accepts a valid percent promo', () => {
    expect(CreatePromoSchema.safeParse({ code: 'SAVE20', type: 'PERCENT', value: 20 }).success).toBe(true);
  });
  it('accepts optional maxRedemptions + expiresAt', () => {
    expect(CreatePromoSchema.safeParse({ code: 'X', type: 'AMOUNT', value: 500, maxRedemptions: 10, expiresAt: '2027-01-01' }).success).toBe(true);
  });
  it('rejects empty code, non-positive value, unknown type', () => {
    expect(CreatePromoSchema.safeParse({ code: '', type: 'PERCENT', value: 20 }).success).toBe(false);
    expect(CreatePromoSchema.safeParse({ code: 'X', type: 'PERCENT', value: 0 }).success).toBe(false);
    expect(CreatePromoSchema.safeParse({ code: 'X', type: 'BOGUS', value: 5 }).success).toBe(false);
  });
});

describe('SubscriptionActionSchema', () => {
  it('accepts cancel/resume with optional note', () => {
    expect(SubscriptionActionSchema.safeParse({ action: 'cancel' }).success).toBe(true);
    expect(SubscriptionActionSchema.safeParse({ action: 'resume', note: 'reactivated' }).success).toBe(true);
  });
  it('rejects an unknown action', () => {
    expect(SubscriptionActionSchema.safeParse({ action: 'delete' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → RED** (`CreatePromoSchema` etc. not exported).

- [ ] **Step 3: Append to `lib/stripe/shapes.ts`** (after the application-tracker block, before EOF):

```ts

// --- Revenue: subscriptions + promo (D2) ---
export type SubscriptionTier = {
  id: string; name: string; priceMonthly: number; priceYearly: number
  features: string[]; activeSubs: number
}
export type SubscriberStatus = "active" | "trialing" | "past_due" | "canceled"
export type Subscriber = {
  id: string; customerEmail: string; tier: string
  status: SubscriberStatus; startedAt: string; renewsAt: string | null
}
export type PromoCode = {
  code: string; type: "PERCENT" | "AMOUNT"; value: number
  redemptions: number; maxRedemptions: number | null
  expiresAt: string | null; active: boolean
}

export const PROMO_TYPES = ["PERCENT", "AMOUNT"] as const
export type PromoTypeValue = (typeof PROMO_TYPES)[number]
export const PROMO_TYPE_LABELS: Record<PromoTypeValue, string> = {
  PERCENT: "Percent off (%)",
  AMOUNT: "Amount off (cents)",
}

export const SUBSCRIPTION_ACTIONS = ["cancel", "resume"] as const
export type SubscriptionActionValue = (typeof SUBSCRIPTION_ACTIONS)[number]
export const SUBSCRIPTION_ACTION_LABELS: Record<SubscriptionActionValue, string> = {
  cancel: "Cancel",
  resume: "Resume",
}

export const CreatePromoSchema = z.object({
  code: z.string().min(1).max(64),
  type: z.enum(PROMO_TYPES),
  value: z.number().int().positive(),
  maxRedemptions: z.number().int().positive().optional(),
  expiresAt: z.string().optional(), // ISO date string
})
export type CreatePromoInput = z.infer<typeof CreatePromoSchema>

export const SubscriptionActionSchema = z.object({
  action: z.enum(SUBSCRIPTION_ACTIONS),
  note: z.string().optional(),
})
export type SubscriptionActionInput = z.infer<typeof SubscriptionActionSchema>
```

- [ ] **Step 4: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/shapes.ts tests/billing/shapes-revenue.test.ts
git commit -m "feat(billing): revenue read shapes + promo/subscription zod inputs"
```

---

### Task 2: Extend the read source with revenue methods (TDD)

**Files:** Modify `lib/stripe/source/types.ts`, `lib/stripe/source/seed.ts`, `lib/stripe/source/live.ts`; Test `tests/billing/source-revenue.test.ts`.

**Interfaces:** `StripeSource` gains `subscriptionTiers(): Promise<SubscriptionTier[]>`, `subscribers(): Promise<Subscriber[]>`, `promoCodes(): Promise<PromoCode[]>`. `seedSource` returns deterministic data for all three; `liveSource` stubs all three via the existing `nope(...)`.

- [ ] **Step 1: Write the failing test** — `tests/billing/source-revenue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedSource } from '@/lib/stripe/source/seed';
import { liveSource } from '@/lib/stripe/source/live';
import { StripeNotWiredError } from '@/lib/stripe/config';

describe('seedSource revenue reads', () => {
  it('returns deterministic tiers, subscribers, promo codes', async () => {
    expect((await seedSource.subscriptionTiers()).length).toBeGreaterThan(0);
    expect(await seedSource.subscribers()).toEqual(await seedSource.subscribers());
    const promos = await seedSource.promoCodes();
    expect(promos.length).toBeGreaterThan(0);
    expect(promos[0].code).toBeTruthy();
  });
  it('includes a canceled subscriber and an active one (for resume/cancel demo)', async () => {
    const subs = await seedSource.subscribers();
    expect(subs.some((s) => s.status === 'canceled')).toBe(true);
    expect(subs.some((s) => s.status === 'active')).toBe(true);
  });
});

describe('liveSource revenue reads', () => {
  it('rejects each revenue read with StripeNotWiredError', async () => {
    await expect(liveSource.subscriptionTiers()).rejects.toBeInstanceOf(StripeNotWiredError);
    await expect(liveSource.subscribers()).rejects.toBeInstanceOf(StripeNotWiredError);
    await expect(liveSource.promoCodes()).rejects.toBeInstanceOf(StripeNotWiredError);
  });
});
```

- [ ] **Step 2: Run → RED** (methods don't exist on the source).

- [ ] **Step 3: Extend `lib/stripe/source/types.ts`** — add the three new return types to the import and three methods to the interface:

```ts
import type {
  TreasuryBalance, TreasuryTransaction, IssuingCard, IssuingDispute, OfframpSettlement,
  SubscriptionTier, Subscriber, PromoCode,
} from "@/lib/stripe/shapes"
```

and inside `interface StripeSource { ... }`, after `offrampSettlements(): Promise<OfframpSettlement[]>`:

```ts
  subscriptionTiers(): Promise<SubscriptionTier[]>
  subscribers(): Promise<Subscriber[]>
  promoCodes(): Promise<PromoCode[]>
```

- [ ] **Step 4: Extend `lib/stripe/source/seed.ts`** — add three methods to the `seedSource` object (after `offrampSettlements`). Note `ago(-h)` yields a FUTURE instant (used for `renewsAt`/active `expiresAt`):

```ts
  async subscriptionTiers() {
    return [
      { id: "tier_basic", name: "Basic", priceMonthly: 9_00, priceYearly: 90_00, features: ["Wrap/unwrap", "Standard support"], activeSubs: 412 },
      { id: "tier_pro", name: "Pro", priceMonthly: 29_00, priceYearly: 290_00, features: ["Priority offramp", "Higher limits", "Priority support"], activeSubs: 137 },
      { id: "tier_institutional", name: "Institutional", priceMonthly: 499_00, priceYearly: 4990_00, features: ["Dedicated treasury", "Issuing cards", "SLA"], activeSubs: 8 },
    ]
  },
  async subscribers() {
    return [
      { id: "sub_001", customerEmail: "ada.lovelace@example.com", tier: "Pro", status: "active", startedAt: ago(24 * 40), renewsAt: ago(-24 * 20) },
      { id: "sub_002", customerEmail: "bg@example.com", tier: "Basic", status: "trialing", startedAt: ago(24 * 3), renewsAt: ago(-24 * 11) },
      { id: "sub_003", customerEmail: "carl@example.com", tier: "Institutional", status: "past_due", startedAt: ago(24 * 200), renewsAt: ago(-24 * 5) },
      { id: "sub_004", customerEmail: "grace@example.com", tier: "Pro", status: "canceled", startedAt: ago(24 * 120), renewsAt: null },
    ]
  },
  async promoCodes() {
    return [
      { code: "LAUNCH25", type: "PERCENT", value: 25, redemptions: 312, maxRedemptions: 1000, expiresAt: ago(-24 * 60), active: true },
      { code: "FROSTBITE", type: "AMOUNT", value: 10_00, redemptions: 47, maxRedemptions: null, expiresAt: null, active: true },
      { code: "EXPIRED5", type: "PERCENT", value: 5, redemptions: 88, maxRedemptions: 100, expiresAt: ago(24 * 30), active: false },
    ]
  },
```

- [ ] **Step 5: Extend `lib/stripe/source/live.ts`** — add three stubs to `liveSource` (after `offrampSettlements`):

```ts
  subscriptionTiers: nope("subscriptionTiers"),
  subscribers: nope("subscribers"),
  promoCodes: nope("promoCodes"),
```

- [ ] **Step 6: Run → GREEN.** Then `tsc --noEmit` (0) + full suite.
- [ ] **Step 7: Commit**

```bash
git add lib/stripe/source/types.ts lib/stripe/source/seed.ts lib/stripe/source/live.ts tests/billing/source-revenue.test.ts
git commit -m "feat(billing): extend Stripe read source with subscriptions + promo"
```

---

### Task 3: Subscriptions domain lib (TDD)

**Files:** Create `lib/stripe/subscriptions.ts`; Test `tests/billing/subscriptions.test.ts`.

**Interfaces:**
- `interface SubscriptionActionRow { id: string; subscriptionId: string; action: string; note: string | null; by: string; at: string }`
- `listTiers(): Promise<{ tiers: SubscriptionTier[]; live: boolean }>` — `getStripeSource().subscriptionTiers()` + `isLive()`.
- `listSubscribers(): Promise<{ subscribers: Subscriber[]; live: boolean }>` — `getStripeSource().subscribers()`; in **seed mode only**, apply the latest `StripeSubscriptionAction` per `subscriptionId` to the subscriber `status` (`cancel`→`"canceled"`, `resume`→`"active"`).
- `changeSubscription(subscriptionId: string, input: unknown, by: string): Promise<SubscriptionActionRow>` — validate via `SubscriptionActionSchema` (else `BillingError`, no write); then `if (isLive()) throw new StripeNotWiredError("changeSubscription")`; else `prisma.stripeSubscriptionAction.create`.

- [ ] **Step 1: Write the failing test** — `tests/billing/subscriptions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeSubscriptionAction = { findMany: vi.fn(), create: vi.fn() };
  const client = { stripeSubscriptionAction };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listTiers, listSubscribers, changeSubscription } from '@/lib/stripe/subscriptions';
import { BillingError, StripeNotWiredError, isLive } from '@/lib/stripe/config';
import { getStripeSource } from '@/lib/stripe/source';
import { prisma } from '@/lib/prisma';

const ssa = prisma.stripeSubscriptionAction as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;

const SUBS = [
  { id: 'sub_001', customerEmail: 'a@x.z', tier: 'Pro', status: 'active', startedAt: '2026-01-01T00:00:00.000Z', renewsAt: '2026-07-01T00:00:00.000Z' },
  { id: 'sub_004', customerEmail: 'g@x.z', tier: 'Pro', status: 'canceled', startedAt: '2026-01-01T00:00:00.000Z', renewsAt: null },
];
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    subscriptionTiers: vi.fn(async () => [{ id: 't1', name: 'Pro', priceMonthly: 2900, priceYearly: 29000, features: [], activeSubs: 1 }]),
    subscribers: vi.fn(async () => SUBS.map((s) => ({ ...s }))),
  });
});

describe('listTiers', () => {
  it('returns tiers + live flag', async () => {
    const r = await listTiers();
    expect(r.live).toBe(false);
    expect(r.tiers[0].name).toBe('Pro');
  });
});

describe('listSubscribers (seed overlay)', () => {
  it('applies latest action per subscription: cancel→canceled, resume→active', async () => {
    ssa.findMany.mockResolvedValueOnce([
      { id: 'a2', subscriptionId: 'sub_001', action: 'cancel', note: null, by: 'op', at: new Date('2026-06-02T00:00:00Z') },
      { id: 'a1', subscriptionId: 'sub_004', action: 'resume', note: null, by: 'op', at: new Date('2026-06-01T00:00:00Z') },
    ]);
    const r = await listSubscribers();
    expect(r.subscribers.find((s) => s.id === 'sub_001')!.status).toBe('canceled');
    expect(r.subscribers.find((s) => s.id === 'sub_004')!.status).toBe('active');
  });
  it('does NOT layer overlays in live mode', async () => {
    live.mockReturnValue(true);
    const r = await listSubscribers();
    expect(ssa.findMany).not.toHaveBeenCalled();
    expect(r.subscribers.find((s) => s.id === 'sub_001')!.status).toBe('active');
  });
});

describe('changeSubscription', () => {
  it('rejects an invalid action without writing', async () => {
    await expect(changeSubscription('sub_001', { action: 'delete' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(ssa.create).not.toHaveBeenCalled();
  });
  it('throws StripeNotWiredError in live mode without writing', async () => {
    live.mockReturnValue(true);
    await expect(changeSubscription('sub_001', { action: 'cancel' }, 'op')).rejects.toBeInstanceOf(StripeNotWiredError);
    expect(ssa.create).not.toHaveBeenCalled();
  });
  it('writes the overlay in seed mode', async () => {
    ssa.create.mockResolvedValueOnce({ id: 'a9', subscriptionId: 'sub_001', action: 'cancel', note: 'fraud', by: 'op', at: new Date('2026-06-03T00:00:00Z') });
    const r = await changeSubscription('sub_001', { action: 'cancel', note: 'fraud' }, 'op');
    expect(ssa.create).toHaveBeenCalledWith({ data: { subscriptionId: 'sub_001', action: 'cancel', note: 'fraud', by: 'op' } });
    expect(r.action).toBe('cancel');
    expect(r.at).toBe('2026-06-03T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/subscriptions.ts`:**

```ts
/** Subscriptions surface of the Stripe console. Reached through actions/cms/billing.ts
 *  (gated MANAGE_BILLING). Reads come from getStripeSource(); in seed mode the
 *  recorded StripeSubscriptionAction overlays are layered onto subscriber status so
 *  the demo is interactive. Mutations are low-risk: live → Stripe (stubbed today);
 *  seed → overlay row. */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import { SubscriptionActionSchema, type SubscriptionTier, type Subscriber, type SubscriberStatus } from "@/lib/stripe/shapes"

export interface SubscriptionActionRow {
  id: string
  subscriptionId: string
  action: string
  note: string | null
  by: string
  at: string
}

type DbAction = { id: string; subscriptionId: string; action: string; note: string | null; by: string; at: Date }
const mapAction = (r: DbAction): SubscriptionActionRow => ({
  id: r.id, subscriptionId: r.subscriptionId, action: r.action, note: r.note, by: r.by, at: r.at.toISOString(),
})

export async function listTiers(): Promise<{ tiers: SubscriptionTier[]; live: boolean }> {
  const live = isLive()
  const tiers = await getStripeSource().subscriptionTiers()
  return { tiers, live }
}

export async function listSubscribers(): Promise<{ subscribers: Subscriber[]; live: boolean }> {
  const live = isLive()
  const subscribers = await getStripeSource().subscribers()
  if (live) return { subscribers, live }
  // seed mode: layer the latest action per subscription onto status
  const rows = (await prisma.stripeSubscriptionAction.findMany({ orderBy: { at: "desc" } })) as DbAction[]
  const latest = new Map<string, string>()
  for (const r of rows) if (!latest.has(r.subscriptionId)) latest.set(r.subscriptionId, r.action)
  const applied = subscribers.map((s) => {
    const action = latest.get(s.id)
    if (action === "cancel") return { ...s, status: "canceled" as SubscriberStatus }
    if (action === "resume") return { ...s, status: "active" as SubscriberStatus }
    return s
  })
  return { subscribers: applied, live }
}

export async function changeSubscription(subscriptionId: string, input: unknown, by: string): Promise<SubscriptionActionRow> {
  const res = SubscriptionActionSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  if (isLive()) throw new StripeNotWiredError("changeSubscription")
  const saved = (await prisma.stripeSubscriptionAction.create({
    data: { subscriptionId, action: res.data.action, note: res.data.note ?? null, by },
  })) as DbAction
  return mapAction(saved)
}
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/subscriptions.ts tests/billing/subscriptions.test.ts
git commit -m "feat(billing): subscriptions domain lib (tiers + subscribers + cancel/resume)"
```

---

### Task 4: Promo domain lib (TDD)

**Files:** Create `lib/stripe/promo.ts`; Test `tests/billing/promo.test.ts`.

**Interfaces:**
- `listPromoCodes(): Promise<{ codes: PromoCode[]; live: boolean }>` — `getStripeSource().promoCodes()`; in **seed mode only**, append the `StripePromoCode` overlay rows (mapped to `PromoCode`, `redemptions: 0`) so admin-created promos show up.
- `createPromoCode(input: unknown, by: string): Promise<PromoCode>` — validate via `CreatePromoSchema` (else `BillingError`, no write); reject duplicate `code` already in the overlay table with `BillingError` (no write); then `if (isLive()) throw new StripeNotWiredError("createPromoCode")`; else `prisma.stripePromoCode.create` and return the mapped `PromoCode`.

- [ ] **Step 1: Write the failing test** — `tests/billing/promo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripePromoCode = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() };
  const client = { stripePromoCode };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listPromoCodes, createPromoCode } from '@/lib/stripe/promo';
import { BillingError, StripeNotWiredError, isLive } from '@/lib/stripe/config';
import { getStripeSource } from '@/lib/stripe/source';
import { prisma } from '@/lib/prisma';

const spc = prisma.stripePromoCode as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    promoCodes: vi.fn(async () => [
      { code: 'SEEDED', type: 'PERCENT', value: 10, redemptions: 5, maxRedemptions: null, expiresAt: null, active: true },
    ]),
  });
});

describe('listPromoCodes', () => {
  it('merges seed source codes with overlay rows in seed mode', async () => {
    spc.findMany.mockResolvedValueOnce([
      { id: 'p1', code: 'NEW20', type: 'AMOUNT', value: 2000, maxRedemptions: 50, expiresAt: new Date('2027-01-01T00:00:00Z'), active: true, by: 'op', createdAt: new Date() },
    ]);
    const r = await listPromoCodes();
    expect(r.live).toBe(false);
    expect(r.codes.map((c) => c.code).sort()).toEqual(['NEW20', 'SEEDED']);
    const made = r.codes.find((c) => c.code === 'NEW20')!;
    expect(made).toMatchObject({ type: 'AMOUNT', value: 2000, redemptions: 0, maxRedemptions: 50, expiresAt: '2027-01-01T00:00:00.000Z', active: true });
  });
  it('does NOT read overlays in live mode', async () => {
    live.mockReturnValue(true);
    const r = await listPromoCodes();
    expect(spc.findMany).not.toHaveBeenCalled();
    expect(r.codes.map((c) => c.code)).toEqual(['SEEDED']);
  });
});

describe('createPromoCode', () => {
  it('rejects invalid input without writing', async () => {
    await expect(createPromoCode({ code: '', type: 'PERCENT', value: 10 }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(spc.create).not.toHaveBeenCalled();
  });
  it('rejects a duplicate code without writing', async () => {
    spc.findUnique.mockResolvedValueOnce({ id: 'p0', code: 'DUP' });
    await expect(createPromoCode({ code: 'DUP', type: 'PERCENT', value: 10 }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(spc.create).not.toHaveBeenCalled();
  });
  it('throws StripeNotWiredError in live mode without writing', async () => {
    live.mockReturnValue(true);
    await expect(createPromoCode({ code: 'X', type: 'PERCENT', value: 10 }, 'op')).rejects.toBeInstanceOf(StripeNotWiredError);
    expect(spc.create).not.toHaveBeenCalled();
  });
  it('creates the overlay in seed mode', async () => {
    spc.findUnique.mockResolvedValueOnce(null);
    spc.create.mockResolvedValueOnce({ id: 'p2', code: 'SAVE20', type: 'PERCENT', value: 20, maxRedemptions: null, expiresAt: null, active: true, by: 'op', createdAt: new Date() });
    const r = await createPromoCode({ code: 'SAVE20', type: 'PERCENT', value: 20 }, 'op');
    expect(spc.create).toHaveBeenCalledWith({ data: { code: 'SAVE20', type: 'PERCENT', value: 20, maxRedemptions: null, expiresAt: null, by: 'op' } });
    expect(r).toMatchObject({ code: 'SAVE20', type: 'PERCENT', value: 20, redemptions: 0, active: true });
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/promo.ts`:**

```ts
/** Promo-code surface of the Stripe console. Reached through actions/cms/billing.ts
 *  (gated MANAGE_BILLING). Reads come from getStripeSource(); in seed mode the
 *  StripePromoCode overlays (admin-created) are appended. Create is low-risk:
 *  live → Stripe (stubbed today); seed → overlay row (unique code enforced). */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import { CreatePromoSchema, type PromoCode } from "@/lib/stripe/shapes"

type DbPromo = {
  id: string; code: string; type: "PERCENT" | "AMOUNT"; value: number
  maxRedemptions: number | null; expiresAt: Date | null; active: boolean; by: string; createdAt: Date
}
const mapOverlay = (r: DbPromo): PromoCode => ({
  code: r.code, type: r.type, value: r.value, redemptions: 0,
  maxRedemptions: r.maxRedemptions, expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null, active: r.active,
})

export async function listPromoCodes(): Promise<{ codes: PromoCode[]; live: boolean }> {
  const live = isLive()
  const codes = await getStripeSource().promoCodes()
  if (live) return { codes, live }
  const overlays = (await prisma.stripePromoCode.findMany({ orderBy: { createdAt: "desc" } })) as DbPromo[]
  return { codes: [...overlays.map(mapOverlay), ...codes], live }
}

export async function createPromoCode(input: unknown, by: string): Promise<PromoCode> {
  const res = CreatePromoSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { code, type, value, maxRedemptions, expiresAt } = res.data
  const existing = await prisma.stripePromoCode.findUnique({ where: { code } })
  if (existing) throw new BillingError(`Promo code already exists: ${code}`)
  if (isLive()) throw new StripeNotWiredError("createPromoCode")
  const saved = (await prisma.stripePromoCode.create({
    data: { code, type, value, maxRedemptions: maxRedemptions ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null, by },
  })) as DbPromo
  return mapOverlay(saved)
}
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/promo.ts tests/billing/promo.test.ts
git commit -m "feat(billing): promo domain lib (list with seed overlay + create)"
```

---

### Task 5: Revenue actions + audit literals (TDD)

**Files:** Modify `actions/cms/billing.ts` (append), `lib/cms/audit.ts` (two literals); Test `tests/billing/actions-revenue.test.ts`.

**Interfaces (actions, gated `MANAGE_BILLING`, reusing the existing `actor()`/`ip()`):**
- `listTiersAction()` → `{ ok:true; tiers: SubscriptionTier[]; live: boolean } | { ok:false; error }` (gated read, no audit).
- `listSubscribersAction()` → `{ ok:true; subscribers: Subscriber[]; live: boolean } | { ok:false; error }` (gated read, no audit).
- `changeSubscriptionAction(subscriptionId, input)` → `{ ok:true } | { ok:false; error }` — audits `"stripe_subscription_action"` (target=subscriptionId), revalidates `/admin/billing/subscriptions`. `BillingError`/`StripeNotWiredError` → `{ ok:false }` without auditing.
- `listPromoCodesAction()` → `{ ok:true; codes: PromoCode[]; live: boolean } | { ok:false; error }` (gated read, no audit).
- `createPromoCodeAction(input)` → `{ ok:true } | { ok:false; error }` — audits `"stripe_promo_create"` (target=code), revalidates `/admin/billing/promo`. Errors map without auditing.

- [ ] **Step 1: Add two audit literals** to the `AuditAction` union in `lib/cms/audit.ts`: `| "stripe_subscription_action"` and `| "stripe_promo_create"`.

- [ ] **Step 2: Write the failing test** — `tests/billing/actions-revenue.test.ts` (mirror `tests/billing/actions.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/stripe/subscriptions', () => ({ listTiers: vi.fn(), listSubscribers: vi.fn(), changeSubscription: vi.fn() }));
vi.mock('@/lib/stripe/promo', () => ({ listPromoCodes: vi.fn(), createPromoCode: vi.fn() }));

import {
  listTiersAction, listSubscribersAction, changeSubscriptionAction,
  listPromoCodesAction, createPromoCodeAction,
} from '@/actions/cms/billing';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import { changeSubscription, listSubscribers } from '@/lib/stripe/subscriptions';
import { createPromoCode, listPromoCodes } from '@/lib/stripe/promo';
import { BillingError } from '@/lib/stripe/config';

const cu = currentUser as unknown as ReturnType<typeof vi.fn>;
const asUser = (privileges: string[]) => cu.mockResolvedValue({ id: 'u1', email: 'op@subfrost.io', privileges });
beforeEach(() => vi.clearAllMocks());

describe('gate', () => {
  it('denies reads + writes without MANAGE_BILLING', async () => {
    asUser(['MANAGE_AML']);
    expect((await listSubscribersAction()).ok).toBe(false);
    expect((await changeSubscriptionAction('sub_001', { action: 'cancel' })).ok).toBe(false);
    expect((await createPromoCodeAction({ code: 'X', type: 'PERCENT', value: 5 })).ok).toBe(false);
    expect(changeSubscription).not.toHaveBeenCalled();
    expect(createPromoCode).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('passes through live flag', async () => {
    asUser(['MANAGE_BILLING']);
    (listSubscribers as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ subscribers: [], live: false });
    expect(await listSubscribersAction()).toEqual({ ok: true, subscribers: [], live: false });
    (listPromoCodes as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ codes: [], live: false });
    expect(await listPromoCodesAction()).toEqual({ ok: true, codes: [], live: false });
  });
});

describe('mutations', () => {
  it('changeSubscription audits + revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (changeSubscription as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'a1', subscriptionId: 'sub_001', action: 'cancel', note: null, by: 'op@subfrost.io', at: '2026-06-03T00:00:00.000Z' });
    expect(await changeSubscriptionAction('sub_001', { action: 'cancel' })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_subscription_action', expect.objectContaining({ actorId: 'u1', target: 'sub_001' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/subscriptions');
  });
  it('createPromoCode audits with the code + revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (createPromoCode as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ code: 'SAVE20', type: 'PERCENT', value: 20, redemptions: 0, maxRedemptions: null, expiresAt: null, active: true });
    expect(await createPromoCodeAction({ code: 'SAVE20', type: 'PERCENT', value: 20 })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_promo_create', expect.objectContaining({ actorId: 'u1', target: 'SAVE20' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/promo');
  });
  it('maps BillingError without auditing', async () => {
    asUser(['MANAGE_BILLING']);
    (createPromoCode as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new BillingError('Promo code already exists: DUP'));
    expect(await createPromoCodeAction({ code: 'DUP', type: 'PERCENT', value: 5 })).toEqual({ ok: false, error: 'Promo code already exists: DUP' });
    expect(audit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run → RED.**

- [ ] **Step 4: Append to `actions/cms/billing.ts`** (after `upsertApplicationAction`). First update the imports. The file already imports `BillingError` from `@/lib/stripe/config` and already has `audit` / `revalidatePath` / `ip()` / `actor()` from D1 — reuse them, do not duplicate. Make exactly these import changes:
  - On the EXISTING `@/lib/stripe/config` import line, add `StripeNotWiredError` so it reads: `import { BillingError, StripeNotWiredError } from "@/lib/stripe/config"`.
  - Add these new import lines:

```ts
import { changeSubscription, listSubscribers, listTiers } from "@/lib/stripe/subscriptions"
import { createPromoCode, listPromoCodes } from "@/lib/stripe/promo"
import type { SubscriptionTier, Subscriber, PromoCode } from "@/lib/stripe/shapes"
```

Then append the actions. Both `changeSubscriptionAction`/`createPromoCodeAction` map BOTH `BillingError` and `StripeNotWiredError` to `{ ok:false }` (the live-stub error must not 500 the action):

```ts
export async function listTiersAction(): Promise<
  { ok: true; tiers: SubscriptionTier[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { tiers, live } = await listTiers()
  return { ok: true, tiers, live }
}

export async function listSubscribersAction(): Promise<
  { ok: true; subscribers: Subscriber[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { subscribers, live } = await listSubscribers()
  return { ok: true, subscribers, live }
}

export async function changeSubscriptionAction(
  subscriptionId: string,
  input: { action: string; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await changeSubscription(subscriptionId, input, a.me.email)
    await audit("stripe_subscription_action", { actorId: a.me.id, target: subscriptionId, ip: await ip() })
    revalidatePath("/admin/billing/subscriptions")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listPromoCodesAction(): Promise<
  { ok: true; codes: PromoCode[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { codes, live } = await listPromoCodes()
  return { ok: true, codes, live }
}

export async function createPromoCodeAction(
  input: { code: string; type: string; value: number; maxRedemptions?: number; expiresAt?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    const created = await createPromoCode(input, a.me.email)
    await audit("stripe_promo_create", { actorId: a.me.id, target: created.code, ip: await ip() })
    revalidatePath("/admin/billing/promo")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}
```

(Do not duplicate `audit`/`revalidatePath`/`ip`/`actor`/`BillingError` — they already exist in the file from D1. The only config-import change is adding `StripeNotWiredError` to that existing line.)

- [ ] **Step 5: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` + full suite.
- [ ] **Step 6: Commit**

```bash
git add actions/cms/billing.ts lib/cms/audit.ts tests/billing/actions-revenue.test.ts
git commit -m "feat(billing): revenue actions (tiers/subscribers/change + promo list/create) + audit literals"
```

---

### Task 6: Subscriptions page + manager + hub card

**Files:** Create `app/admin/billing/subscriptions/page.tsx`, `components/cms/billing/SubscriptionsManager.tsx`; Modify `app/admin/billing/page.tsx` (flip the `subscriptions` card to `ready:true`). No UI unit test.

**Interfaces:** Consumes `listTiersAction`/`listSubscribersAction`/`changeSubscriptionAction` (Task 5), `SubscriptionTier`/`Subscriber`/`SUBSCRIPTION_ACTIONS`/`SUBSCRIPTION_ACTION_LABELS` (shapes), `isLive` (config).

- [ ] **Step 1: Flip the hub card** in `app/admin/billing/page.tsx`: change the `subscriptions` entry in `SURFACES` from `ready: false` to `ready: true` (leave the other six untouched).

- [ ] **Step 2: Create `app/admin/billing/subscriptions/page.tsx`** — mirror `app/admin/kyc/page.tsx`: `export const dynamic = "force-dynamic"`; gate on `MANAGE_BILLING` (redirect login/admin); heading "Subscriptions" + short description ("Subscription tiers and subscribers. Manage cancellations and reactivations."); render `<BillingBanner live={isLive()} />` then `<SubscriptionsManager />`. (Import `isLive` from `@/lib/stripe/config`, `BillingBanner` from `@/components/cms/billing/BillingBanner`.)

- [ ] **Step 3: Create `components/cms/billing/SubscriptionsManager.tsx`** — `"use client"`, mobile-first, zinc, mirror `ApplicationsManager`. Requirements:
  - On mount, call BOTH `listTiersAction()` and `listSubscribersAction()`; hold tiers + subscribers in state; top-level error banner on either `{ok:false}`.
  - **Tiers section:** a heading "Tiers" + stacked read-only cards — tier name, monthly/yearly price (format cents → `$X.XX`, e.g. `(priceMonthly/100).toFixed(2)`), `activeSubs` count, and the `features` list. No actions (catalog editing is out of scope for D2).
  - **Subscribers section:** a heading "Subscribers" + stacked cards — `customerEmail`, `tier`, a status badge (`status`), `startedAt`/`renewsAt` as locale strings (renewsAt may be null). Each card has action buttons driven by `SUBSCRIPTION_ACTIONS`/`SUBSCRIPTION_ACTION_LABELS`: a "Cancel" button shown when status !== "canceled", a "Resume" button shown when status === "canceled". Each calls `changeSubscriptionAction(sub.id, { action })` inside a `useTransition`; on success refetch subscribers (use `await`); on `{ok:false}` show a per-card error.
  - Import the value constants from `@/lib/stripe/shapes` and the `SubscriptionTier`/`Subscriber` TYPES via `import type` from `@/lib/stripe/shapes`.

- [ ] **Step 4: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green.

- [ ] **Step 5: Commit**

```bash
git add app/admin/billing/page.tsx app/admin/billing/subscriptions/page.tsx components/cms/billing/SubscriptionsManager.tsx
git commit -m "feat(billing): subscriptions page + manager + hub card (mobile-first)"
```

---

### Task 7: Promo page + manager + hub card

**Files:** Create `app/admin/billing/promo/page.tsx`, `components/cms/billing/PromoManager.tsx`; Modify `app/admin/billing/page.tsx` (flip the `promo` card to `ready:true`). No UI unit test.

**Interfaces:** Consumes `listPromoCodesAction`/`createPromoCodeAction` (Task 5), `PromoCode`/`PROMO_TYPES`/`PROMO_TYPE_LABELS` (shapes), `isLive` (config).

- [ ] **Step 1: Flip the hub card** in `app/admin/billing/page.tsx`: change the `promo` entry in `SURFACES` from `ready: false` to `ready: true`.

- [ ] **Step 2: Create `app/admin/billing/promo/page.tsx`** — mirror the kyc page gate; `dynamic = "force-dynamic"`; heading "Promo codes" + short description ("Coupons and promotion codes."); render `<BillingBanner live={isLive()} />` then `<PromoManager />`.

- [ ] **Step 3: Create `components/cms/billing/PromoManager.tsx`** — `"use client"`, mobile-first, zinc, mirror `ApplicationsManager`. Requirements:
  - On mount, call `listPromoCodesAction()`; hold codes in state; top-level error banner on `{ok:false}`.
  - **Create form** (a card at the top): inputs for `code` (Input), `type` (select from `PROMO_TYPES`/`PROMO_TYPE_LABELS`), `value` (number Input — interpret per type via the label hint: percent or cents), optional `maxRedemptions` (number Input), optional `expiresAt` (date Input). A "Create" Button → `createPromoCodeAction({ code, type, value: Number(value), maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined, expiresAt: expiresAt || undefined })` inside `useTransition`; on success clear the form + refetch (await); on `{ok:false}` show a form-level error.
  - **List section:** stacked cards of existing codes — `code`, type label, `value` (render `${value}%` for PERCENT, `$${(value/100).toFixed(2)}` for AMOUNT), `redemptions`/`maxRedemptions` (e.g. "47 / ∞" or "312 / 1000"), `expiresAt` (locale date or "no expiry"), and an active/inactive badge.
  - Import the value constants from `@/lib/stripe/shapes` and the `PromoCode` TYPE via `import type` from `@/lib/stripe/shapes`.

- [ ] **Step 4: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green.

- [ ] **Step 5: Commit**

```bash
git add app/admin/billing/page.tsx app/admin/billing/promo/page.tsx components/cms/billing/PromoManager.tsx
git commit -m "feat(billing): promo page + manager + hub card (mobile-first)"
```

---

## Self-Review

**Spec coverage (D2 = Revenue row of the spec's sub-plan table):**
- Subscription tiers + subscribers read surface → Tasks 1–3 (shapes, source, subscriptions lib) + Task 6 (UI). ✅
- Low-risk subscription mutation (cancel/resume, hybrid) → Task 3 (`changeSubscription`) + Task 5 (action) + Task 6 (buttons). ✅
- Promo codes list + create (hybrid, unique code) → Tasks 1, 2, 4 + Task 5 (actions) + Task 7 (UI). ✅
- Seed-mode interactivity via overlays (`StripeSubscriptionAction`, `StripePromoCode`) layered onto reads → Tasks 3–4. ✅
- `MANAGE_BILLING` gating + audit on success → Task 5. ✅
- Hub cards flipped to `ready` + demo banner on Stripe-backed pages → Tasks 6–7. ✅
- *Deferred (noted):* `change_tier` subscription action (needs a target-tier field on `StripeSubscriptionAction`; the column is free-string today so adding it later is non-breaking — kept out of D2 to avoid a schema change); subscription-catalog editing (tiers are read-only); promo `redemptions` for admin-created codes is 0 (no redemption tracking pre-live). All intentional.

**Placeholder scan:** Tasks 1–5 contain complete code. Task 5 Step 4 gives the exact import edits (add `StripeNotWiredError` to the existing config import; add the subscriptions/promo/shapes imports) then the full action bodies. Tasks 6–7 are UI, spec'd to concrete requirements mirroring `ApplicationsManager`. No TBD. ✅

**Type consistency:** `SubscriptionTier`/`Subscriber`/`PromoCode`/`SubscriberStatus` (Task 1) flow through source (Task 2), domain libs (Tasks 3–4), actions (Task 5), managers (Tasks 6–7). `SubscriptionActionRow` (Task 3) is internal. The source methods added in Task 2 match the interface signatures (Task 1 types). Audit literals `"stripe_subscription_action"`/`"stripe_promo_create"` (Task 5) match their call sites. `changeSubscription`/`createPromoCode` throw `BillingError`+`StripeNotWiredError`, both mapped by the actions. Reads return `{ ...; live }` consumed by the managers' banners. ✅

## Notes for follow-up
- `change_tier`: add a nullable `targetTier String?` to `StripeSubscriptionAction` (additive) + extend `SUBSCRIPTION_ACTIONS` + the seed-overlay apply, when tier changes are wanted.
- When `STRIPE_SECRET_KEY` is wired, replace the `if (isLive()) throw StripeNotWiredError(...)` branches in `subscriptions.ts`/`promo.ts` with real Stripe SDK calls behind the same function boundary (no action/UI change).
- Promo redemption counts for admin-created codes will populate once the live Stripe source returns them; the seed overlay reports 0 by design.
