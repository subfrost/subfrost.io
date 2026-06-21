# F2-D1 — Stripe billing console: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the Stripe billing-console foundation in `subfrost.io/admin` — the Prisma overlay/tracker models, the gated `lib/stripe/` source adapter (`seed-complete + live-stub`), the demo banner, the `/admin/billing` hub + nav, and the first fully-working surface (the Stripe **application tracker**) — all gated by `MANAGE_BILLING`.

**Architecture:** Same F2-A/B/C pattern. A client-safe shapes module (`lib/stripe/shapes.ts`: read types + zod inputs), a pluggable read source (`lib/stripe/source/`: `seed` deterministic data + `live` stub that throws `StripeNotWiredError`, chosen by `isLive()` = `!!STRIPE_SECRET_KEY`), cross-cutting gating/errors (`lib/stripe/config.ts`), a pure-Postgres tracker domain lib (`lib/stripe/applications.ts`), privilege-gated actions (`actions/cms/billing.ts`), and the hub + applications page + managers. Reads always return `{ data, live }` so the UI never goes blank — without the key it shows seed/demo data behind a non-blocking banner. No `stripe` npm dep is added: `live.ts` is a type-correct stub.

**Tech Stack:** Next 16 App Router, Prisma/Postgres, zod, React 18, Tailwind (zinc), `@/components/ui/*`, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-f2-plano-d-stripe-design.md`. Sub-plan **1 of 4** of Plano D (D1=Foundation, D2=Revenue, D3=Money-ops, D4=Customers). D2–D4 extend `shapes.ts`/`source/*` with their surfaces and consume the foundation built here.

**Reference (not a ceiling):** `C:\Alkanes Geral Dev\subfrost-admin\apps\admin-web\src\lib\subkube-mock.ts` — the canonical read shapes (Treasury/Issuing/Offramp) + their deterministic data. Port the shapes and the seed data from here into Tasks 3–4.

## Global Constraints

- **Branch:** `feat/compliance-aml-stripe` (continue on it — F2-A/B/C are here). **No PR, no push, no touching main** until flex approves — commit locally only. (flex reviews the branch tomorrow.)
- **Prisma flow:** NO migration files. After editing `prisma/schema.prisma`: `node_modules/.bin/prisma generate`. Do NOT run `prisma db push` (prod via authorized io-sa step later, `prisma migrate diff` confirming additive). All models here are **additive**.
- **Gating:** every action gates on `MANAGE_BILLING` (already exists in the `Privilege` enum + `lib/cms/privileges.ts`) before any domain call. Pages `redirect("/admin")` when the user lacks it. **No new privilege.**
- **`lib/stripe/shapes.ts` and `lib/stripe/config.ts` must stay client-safe** (no `@/lib/prisma` / node-only imports) so client components and the demo banner can import them. `config.ts` may read `process.env` inside a function only.
- **No `stripe` npm dep.** `live.ts` implements the source interface by returning `Promise.reject(new StripeNotWiredError(method))`. `isLive()` is false today, so `getStripeSource()` returns the seed source and `live.ts` never runs.
- **Theme:** zinc. **Mobile-first** for all UI (stacked cards + `flex flex-wrap`, no desktop-only tables). Match `KycManager`/`MtlManager` styling and `@/components/ui/{button,input,label}`.
- **Test mocks:** mock `@/lib/prisma` (`{ prisma, default }`), `@/lib/cms/authz` (`currentUser`), `@/lib/cms/audit` (`audit`), `next/cache` (`revalidatePath`), `next/headers` (`headers`). Tests under `tests/billing/`.
- **Verify gate (per task):** `node_modules/.bin/tsc --noEmit` → 0; `CI=true node_modules/.bin/vitest run` → green (new tests + the **308** from F2-A/B/C).
- **Auth pattern:** domain pure (throws typed `BillingError`); action gates `MANAGE_BILLING`, audits mutations on success only, `revalidatePath`; page redirects unauthorized. Mirror `actions/cms/kyc.ts` exactly.
- **Untracked `.npmrc` must NEVER be `git add`ed.** Each commit stages only the files its task names.

---

### Task 1: Stripe Prisma models + enums

**Files:** Modify `prisma/schema.prisma`.

**Interfaces:** Produces enums `StripeMoneyKind` (ACH_TRANSFER, REFUND), `StripeMoneyStatus` (QUEUED, CONFIRMED, CANCELED), `StripePromoType` (PERCENT, AMOUNT), `StripeApplicationStatus` (NOT_STARTED, SUBMITTED, PENDING, APPROVED, REJECTED); models `StripeMoneyIntent`, `StripeCardControl`, `StripeDisputeEvidence`, `StripePromoCode`, `StripeSubscriptionAction`, `StripeApplication`; accessors `prisma.stripeMoneyIntent`, `prisma.stripeCardControl`, `prisma.stripeDisputeEvidence`, `prisma.stripePromoCode`, `prisma.stripeSubscriptionAction`, `prisma.stripeApplication`.

- [ ] **Step 1: Append the Stripe schema block** at the end of `prisma/schema.prisma`:

```prisma
// ============================================
// BILLING — Stripe console (F2-D)
// ============================================

// Money guardrail (ACH + refund) — used in BOTH seed and live modes.
enum StripeMoneyKind   { ACH_TRANSFER REFUND }
enum StripeMoneyStatus { QUEUED CONFIRMED CANCELED }

model StripeMoneyIntent {
  id           String            @id @default(cuid())
  kind         StripeMoneyKind
  direction    String?           // "in" | "out" (ACH)
  amount       Int               // cents
  counterparty String?           // ACH
  reference    String?           // chargeId/invoiceId (refund)
  memo         String?
  status       StripeMoneyStatus @default(QUEUED)
  requestedBy  String
  requestedAt  DateTime          @default(now())
  decidedBy    String?
  decidedAt    DateTime?
}

// Low-risk overlays — layered onto reads only in seed mode (interactive demo).
model StripeCardControl {
  cardId String   @id
  state  String   // "active" | "paused" | "canceled"
  by     String
  at     DateTime @default(now())
}

model StripeDisputeEvidence {
  id            String   @id @default(cuid())
  disputeId     String
  evidence      String?
  evidenceFiles String[]
  by            String
  at            DateTime @default(now())
}

enum StripePromoType { PERCENT AMOUNT }

model StripePromoCode {
  id             String          @id @default(cuid())
  code           String          @unique
  type           StripePromoType
  value          Int             // percent or cents
  maxRedemptions Int?
  expiresAt      DateTime?
  active         Boolean         @default(true)
  by             String
  createdAt      DateTime        @default(now())
}

model StripeSubscriptionAction {
  id             String   @id @default(cuid())
  subscriptionId String
  action         String   // "cancel" | "pause" | "resume" | "change_tier"
  note           String?
  by             String
  at             DateTime @default(now())
}

// Application/onboarding tracker — pure Postgres, no Stripe.
enum StripeApplicationStatus { NOT_STARTED SUBMITTED PENDING APPROVED REJECTED }

model StripeApplication {
  id        String                  @id @default(cuid())
  product   String                  @unique  // "treasury" | "issuing" | "offramp"
  status    StripeApplicationStatus @default(NOT_STARTED)
  notes     String?
  updatedBy String
  updatedAt DateTime                @updatedAt
}
```

- [ ] **Step 2:** `node_modules/.bin/prisma generate` — expect the six new accessors.
- [ ] **Step 3:** `node_modules/.bin/prisma validate && node_modules/.bin/tsc --noEmit` — "valid 🚀"; 0 errors.
- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(billing): Stripe console models (money intent + overlays + application tracker)"
```

---

### Task 2: Cross-cutting config + errors (TDD)

**Files:** Create `lib/stripe/config.ts`; Test `tests/billing/config.test.ts`.

**Interfaces:** Produces `isLive(): boolean` (= `!!process.env.STRIPE_SECRET_KEY`), `DEMO_REASON: string`, `class StripeNotWiredError extends Error` (ctor takes the method name), `class BillingError extends Error` (shared domain error for all billing libs). **Client-safe** (no prisma/node imports).

- [ ] **Step 1: Write the failing test** — `tests/billing/config.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { isLive, DEMO_REASON, StripeNotWiredError, BillingError } from '@/lib/stripe/config';

const KEY = 'STRIPE_SECRET_KEY';
afterEach(() => { delete process.env[KEY]; });

describe('isLive', () => {
  it('is false when STRIPE_SECRET_KEY is unset', () => {
    delete process.env[KEY];
    expect(isLive()).toBe(false);
  });
  it('is true when STRIPE_SECRET_KEY is set', () => {
    process.env[KEY] = 'sk_test_x';
    expect(isLive()).toBe(true);
  });
});

describe('errors + reason', () => {
  it('DEMO_REASON mentions STRIPE_SECRET_KEY', () => {
    expect(DEMO_REASON).toContain('STRIPE_SECRET_KEY');
  });
  it('StripeNotWiredError names the method', () => {
    const e = new StripeNotWiredError('treasuryBalances');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('StripeNotWiredError');
    expect(e.message).toContain('treasuryBalances');
  });
  it('BillingError is an Error subclass', () => {
    expect(new BillingError('x')).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run → RED** (`Cannot find module '@/lib/stripe/config'`).

- [ ] **Step 3: Create `lib/stripe/config.ts`:**

```ts
/** Cross-cutting gating + errors for the Stripe billing console. Client-safe:
 *  only reads process.env inside isLive(). The live path is wired only when
 *  STRIPE_SECRET_KEY is present; until then the console runs on deterministic
 *  seed data (demo mode) behind a non-blocking banner. Mirrors the gated pattern
 *  of the F2 AML modules. */
export function isLive(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export const DEMO_REASON =
  "Stripe is not connected — showing demo data. Set STRIPE_SECRET_KEY to go live."

/** Thrown by the live source adapter until the real Stripe SDK calls are wired.
 *  isLive() is false until the key is set, so getStripeSource() returns the seed
 *  source and this is never hit at runtime today. */
export class StripeNotWiredError extends Error {
  constructor(method: string) {
    super(`Stripe live source not wired: ${method}. Set STRIPE_SECRET_KEY and implement live.ts.`)
    this.name = "StripeNotWiredError"
  }
}

/** Typed domain error for billing libs (validation / not-found / bad input).
 *  Actions map it to { ok:false, error } without auditing. */
export class BillingError extends Error {}
```

- [ ] **Step 4: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/config.ts tests/billing/config.test.ts
git commit -m "feat(billing): stripe gating (isLive) + DEMO_REASON + typed errors"
```

---

### Task 3: Client-safe shapes + zod inputs (TDD)

**Files:** Create `lib/stripe/shapes.ts`; Test `tests/billing/shapes.test.ts`.

**Interfaces:** Produces, **client-safe** (only imports `zod`):
- `type SourceResult<T> = { data: T; live: boolean }`
- Read types (ported from `subkube-mock.ts`): `TreasuryBalance`, `TreasuryTxnType`, `TreasuryTransaction`, `IssuingCard`, `IssuingDispute`, `OfframpSettlement`.
- `STRIPE_APPLICATION_PRODUCTS: readonly ["treasury","issuing","offramp"]`
- `STRIPE_APPLICATION_STATUSES: readonly [...]` (the 5 enum values) + `type StripeApplicationStatusValue` + `STRIPE_APPLICATION_STATUS_LABELS: Record<StripeApplicationStatusValue,string>`
- `ApplicationUpsertSchema` (zod: `{ status: enum, notes?: string }`) + `type ApplicationUpsertInput`

- [ ] **Step 1: Write the failing test** — `tests/billing/shapes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  STRIPE_APPLICATION_PRODUCTS, STRIPE_APPLICATION_STATUSES,
  STRIPE_APPLICATION_STATUS_LABELS, ApplicationUpsertSchema,
} from '@/lib/stripe/shapes';

describe('application constants', () => {
  it('lists the three products', () => {
    expect(STRIPE_APPLICATION_PRODUCTS).toEqual(['treasury', 'issuing', 'offramp']);
  });
  it('has five statuses, each with a label', () => {
    expect(STRIPE_APPLICATION_STATUSES).toHaveLength(5);
    for (const s of STRIPE_APPLICATION_STATUSES) expect(typeof STRIPE_APPLICATION_STATUS_LABELS[s]).toBe('string');
  });
});

describe('ApplicationUpsertSchema', () => {
  it('accepts a valid patch', () => {
    expect(ApplicationUpsertSchema.safeParse({ status: 'APPROVED', notes: 'ok' }).success).toBe(true);
  });
  it('accepts status without notes', () => {
    expect(ApplicationUpsertSchema.safeParse({ status: 'PENDING' }).success).toBe(true);
  });
  it('rejects an unknown status', () => {
    expect(ApplicationUpsertSchema.safeParse({ status: 'BOGUS' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/shapes.ts`** (port the read shapes verbatim from `subkube-mock.ts`):

```ts
import { z } from "zod"

/** Every billing read returns data + a live flag so the UI can show a demo
 *  banner when Stripe is not connected. Reads are never persisted. */
export type SourceResult<T> = { data: T; live: boolean }

// --- Read shapes (canonical contract, ported from subkube-mock.ts) ---
export type TreasuryBalance = {
  accountId: string; nickname: string; available: number; pending: number; currency: "USD"
}
export type TreasuryTxnType =
  | "ach_credit" | "ach_debit" | "wire_in" | "wire_out" | "fee" | "card_settlement"
export type TreasuryTransaction = {
  id: string; type: TreasuryTxnType; amount: number; counterparty: string
  status: "pending" | "posted" | "returned"; at: string
}
export type IssuingCard = {
  id: string; last4: string; cardholder: string; type: "virtual" | "physical"
  state: "active" | "paused" | "canceled"; wallet: { apple: boolean; google: boolean }
  spendLimit: number; spentMtd: number
}
export type IssuingDispute = {
  id: string; cardId: string; amount: number
  reason: "fraudulent" | "duplicate" | "service_not_received" | "other"
  status: "submitted" | "won" | "lost"; openedAt: string
  evidence?: string; evidenceFiles?: string[]
}
export type OfframpSettlement = {
  id: string; userId: string; cryptoAsset: "BTC" | "USDC" | "ETH"
  cryptoAmount: number; fiatAmount: number; feeAmount: number
  status: "pending" | "settled"; at: string
}

// --- Application tracker (pure Postgres) ---
export const STRIPE_APPLICATION_PRODUCTS = ["treasury", "issuing", "offramp"] as const
export type StripeApplicationProduct = (typeof STRIPE_APPLICATION_PRODUCTS)[number]

export const STRIPE_APPLICATION_STATUSES = [
  "NOT_STARTED", "SUBMITTED", "PENDING", "APPROVED", "REJECTED",
] as const
export type StripeApplicationStatusValue = (typeof STRIPE_APPLICATION_STATUSES)[number]

export const STRIPE_APPLICATION_STATUS_LABELS: Record<StripeApplicationStatusValue, string> = {
  NOT_STARTED: "Not started",
  SUBMITTED: "Submitted",
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
}

export const ApplicationUpsertSchema = z.object({
  status: z.enum(STRIPE_APPLICATION_STATUSES),
  notes: z.string().optional(),
})
export type ApplicationUpsertInput = z.infer<typeof ApplicationUpsertSchema>
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/shapes.ts tests/billing/shapes.test.ts
git commit -m "feat(billing): client-safe Stripe read shapes + application zod inputs"
```

---

### Task 4: Source adapter — seed + live stub + selector (TDD)

**Files:** Create `lib/stripe/source/types.ts`, `lib/stripe/source/seed.ts`, `lib/stripe/source/live.ts`, `lib/stripe/source/index.ts`; Test `tests/billing/source.test.ts`.

**Interfaces:**
- `interface StripeSource` (`lib/stripe/source/types.ts`) — read methods (D2–D4 extend this):
  `treasuryBalances(): Promise<TreasuryBalance[]>`, `treasuryTransactions(): Promise<TreasuryTransaction[]>`, `issuingCards(): Promise<IssuingCard[]>`, `issuingDisputes(): Promise<IssuingDispute[]>`, `offrampSettlements(): Promise<OfframpSettlement[]>`.
- `seedSource: StripeSource` (`seed.ts`) — deterministic data ported from `subkube-mock.ts`.
- `liveSource: StripeSource` (`live.ts`) — every method `Promise.reject(new StripeNotWiredError(name))`.
- `getStripeSource(): StripeSource` (`index.ts`) — `isLive() ? liveSource : seedSource`.

- [ ] **Step 1: Write the failing test** — `tests/billing/source.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { getStripeSource } from '@/lib/stripe/source';
import { seedSource } from '@/lib/stripe/source/seed';
import { liveSource } from '@/lib/stripe/source/live';
import { StripeNotWiredError } from '@/lib/stripe/config';

const KEY = 'STRIPE_SECRET_KEY';
afterEach(() => { delete process.env[KEY]; });

describe('getStripeSource', () => {
  it('returns the seed source when no key is set', () => {
    delete process.env[KEY];
    expect(getStripeSource()).toBe(seedSource);
  });
  it('returns the live source when a key is set', () => {
    process.env[KEY] = 'sk_test_x';
    expect(getStripeSource()).toBe(liveSource);
  });
});

describe('seedSource', () => {
  it('returns deterministic treasury balances', async () => {
    const a = await seedSource.treasuryBalances();
    const b = await seedSource.treasuryBalances();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(a[0].currency).toBe('USD');
  });
  it('returns issuing cards and offramp settlements', async () => {
    expect((await seedSource.issuingCards()).length).toBeGreaterThan(0);
    expect((await seedSource.offrampSettlements()).length).toBeGreaterThan(0);
  });
});

describe('liveSource', () => {
  it('rejects every read with StripeNotWiredError until wired', async () => {
    await expect(liveSource.treasuryBalances()).rejects.toBeInstanceOf(StripeNotWiredError);
    await expect(liveSource.issuingCards()).rejects.toBeInstanceOf(StripeNotWiredError);
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/source/types.ts`:**

```ts
import type {
  TreasuryBalance, TreasuryTransaction, IssuingCard, IssuingDispute, OfframpSettlement,
} from "@/lib/stripe/shapes"

/** The pluggable read surface for the Stripe console. Implemented by the seed
 *  source (deterministic demo data) and the live source (Stripe SDK, stubbed
 *  until STRIPE_SECRET_KEY is wired). D2–D4 extend this interface with their
 *  surfaces (subscriptions/promo, customers). */
export interface StripeSource {
  treasuryBalances(): Promise<TreasuryBalance[]>
  treasuryTransactions(): Promise<TreasuryTransaction[]>
  issuingCards(): Promise<IssuingCard[]>
  issuingDisputes(): Promise<IssuingDispute[]>
  offrampSettlements(): Promise<OfframpSettlement[]>
}
```

- [ ] **Step 4: Create `lib/stripe/source/seed.ts`** — port the data from `subkube-mock.ts` verbatim (the `treasuryBalances`/`treasuryTransactions`/`issuingCards`/`issuingDisputes`/`offrampSettlements` bodies). Use a fixed epoch (not `Date.now()`) so the data is deterministic for the test's `toEqual` re-call:

```ts
import type { StripeSource } from "@/lib/stripe/source/types"

// Fixed reference instant keeps seed timestamps deterministic across calls.
const T0 = Date.parse("2026-06-21T00:00:00.000Z")
const ago = (h: number) => new Date(T0 - h * 3600 * 1000).toISOString()

export const seedSource: StripeSource = {
  async treasuryBalances() {
    return [
      { accountId: "fbo_main_usd", nickname: "FBO Operating", available: 184_209_42, pending: 12_400_00, currency: "USD" },
      { accountId: "fbo_settlements_usd", nickname: "Card-spend settlements", available: 18_417_33, pending: 4_120_00, currency: "USD" },
    ]
  },
  async treasuryTransactions() {
    return [
      { id: "txn_001", type: "ach_credit", amount: 25_000_00, counterparty: "Subzero Research", status: "posted", at: ago(4) },
      { id: "txn_002", type: "card_settlement", amount: -3_215_72, counterparty: "Visa Network", status: "posted", at: ago(8) },
      { id: "txn_003", type: "ach_debit", amount: -8_750_00, counterparty: "Gusto Payroll", status: "posted", at: ago(20) },
      { id: "txn_004", type: "wire_in", amount: 50_000_00, counterparty: "Customer offramp pool", status: "pending", at: ago(2) },
      { id: "txn_005", type: "fee", amount: -42_18, counterparty: "Stripe Treasury fee", status: "posted", at: ago(30) },
    ]
  },
  async issuingCards() {
    return [
      { id: "ic_001", last4: "4242", cardholder: "flex (Director)", type: "virtual", state: "active", wallet: { apple: true, google: false }, spendLimit: 10_000_00, spentMtd: 1_415_22 },
      { id: "ic_002", last4: "1881", cardholder: "grey (Compliance)", type: "physical", state: "active", wallet: { apple: true, google: true }, spendLimit: 5_000_00, spentMtd: 432_19 },
      { id: "ic_003", last4: "9090", cardholder: "Customer demo card", type: "virtual", state: "paused", wallet: { apple: false, google: false }, spendLimit: 500_00, spentMtd: 0 },
    ]
  },
  async issuingDisputes() {
    return [
      { id: "idp_001", cardId: "ic_003", amount: 89_00, reason: "fraudulent", status: "submitted", openedAt: ago(48) },
    ]
  },
  async offrampSettlements() {
    return [
      { id: "off_001", userId: "usr_a1b2", cryptoAsset: "USDC", cryptoAmount: 5_000_00, fiatAmount: 4_997_50, feeAmount: 2_50, status: "settled", at: ago(6) },
      { id: "off_002", userId: "usr_c3d4", cryptoAsset: "BTC", cryptoAmount: 2_500_00, fiatAmount: 2_493_75, feeAmount: 6_25, status: "pending", at: ago(1) },
    ]
  },
}
```

- [ ] **Step 5: Create `lib/stripe/source/live.ts`:**

```ts
import type { StripeSource } from "@/lib/stripe/source/types"
import { StripeNotWiredError } from "@/lib/stripe/config"

// Type-correct stub. No `stripe` SDK dep yet: each read rejects until the real
// calls are wired behind this boundary (when STRIPE_SECRET_KEY arrives). Because
// isLive() is false today, getStripeSource() never returns this at runtime.
const nope = (method: string) => () => Promise.reject(new StripeNotWiredError(method))

export const liveSource: StripeSource = {
  treasuryBalances: nope("treasuryBalances"),
  treasuryTransactions: nope("treasuryTransactions"),
  issuingCards: nope("issuingCards"),
  issuingDisputes: nope("issuingDisputes"),
  offrampSettlements: nope("offrampSettlements"),
}
```

- [ ] **Step 6: Create `lib/stripe/source/index.ts`:**

```ts
import { isLive } from "@/lib/stripe/config"
import type { StripeSource } from "@/lib/stripe/source/types"
import { seedSource } from "@/lib/stripe/source/seed"
import { liveSource } from "@/lib/stripe/source/live"

export type { StripeSource }

/** Pick the active read source. Seed (demo) until STRIPE_SECRET_KEY is set. */
export function getStripeSource(): StripeSource {
  return isLive() ? liveSource : seedSource
}
```

- [ ] **Step 7: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 8: Commit**

```bash
git add lib/stripe/source/types.ts lib/stripe/source/seed.ts lib/stripe/source/live.ts lib/stripe/source/index.ts tests/billing/source.test.ts
git commit -m "feat(billing): pluggable Stripe read source (seed data + live stub + selector)"
```

---

### Task 5: Application tracker domain lib (TDD)

**Files:** Create `lib/stripe/applications.ts`; Test `tests/billing/applications.test.ts`.

**Interfaces:**
- `interface ApplicationRow { id: string; product: string; status: string; notes: string | null; updatedBy: string; updatedAt: string }`
- `listApplications(): Promise<ApplicationRow[]>` — all rows, `orderBy: { product: "asc" }`, ISO `updatedAt`.
- `upsertApplication(product: string, input: unknown, by: string): Promise<ApplicationRow>` — reject unknown product (not in `STRIPE_APPLICATION_PRODUCTS`) or invalid input with `BillingError` (no write); else `prisma.stripeApplication.upsert` by `product` (create+update both set `status`, `notes`, `updatedBy`).

- [ ] **Step 1: Write the failing test** — `tests/billing/applications.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeApplication = { findMany: vi.fn(), upsert: vi.fn() };
  const client = { stripeApplication };
  return { prisma: client, default: client };
});

import { listApplications, upsertApplication } from '@/lib/stripe/applications';
import { BillingError } from '@/lib/stripe/config';
import { prisma } from '@/lib/prisma';

const sa = prisma.stripeApplication as unknown as Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => vi.clearAllMocks());

describe('listApplications', () => {
  it('returns rows alpha by product with ISO updatedAt', async () => {
    sa.findMany.mockResolvedValueOnce([
      { id: 'a1', product: 'issuing', status: 'PENDING', notes: null, updatedBy: 'x@y.z', updatedAt: new Date('2026-06-01T00:00:00Z') },
    ]);
    const r = await listApplications();
    expect(sa.findMany).toHaveBeenCalledWith({ orderBy: { product: 'asc' } });
    expect(r[0].updatedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(r[0].product).toBe('issuing');
  });
});

describe('upsertApplication', () => {
  it('rejects an unknown product without writing', async () => {
    await expect(upsertApplication('bogus', { status: 'APPROVED' }, 'x@y.z')).rejects.toBeInstanceOf(BillingError);
    expect(sa.upsert).not.toHaveBeenCalled();
  });
  it('rejects an invalid status without writing', async () => {
    await expect(upsertApplication('treasury', { status: 'NOPE' }, 'x@y.z')).rejects.toBeInstanceOf(BillingError);
    expect(sa.upsert).not.toHaveBeenCalled();
  });
  it('upserts by product setting status/notes/updatedBy', async () => {
    sa.upsert.mockResolvedValueOnce({ id: 'a1', product: 'treasury', status: 'APPROVED', notes: 'done', updatedBy: 'x@y.z', updatedAt: new Date('2026-06-02T00:00:00Z') });
    const r = await upsertApplication('treasury', { status: 'APPROVED', notes: 'done' }, 'x@y.z');
    expect(sa.upsert).toHaveBeenCalledWith({
      where: { product: 'treasury' },
      create: { product: 'treasury', status: 'APPROVED', notes: 'done', updatedBy: 'x@y.z' },
      update: { status: 'APPROVED', notes: 'done', updatedBy: 'x@y.z' },
    });
    expect(r.status).toBe('APPROVED');
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/applications.ts`:**

```ts
/** Stripe product application/onboarding tracker. Pure Postgres (no Stripe API):
 *  tracks where treasury/issuing/offramp onboarding stands. Reached through
 *  actions/cms/billing.ts (gated MANAGE_BILLING). */
import prisma from "@/lib/prisma"
import { BillingError } from "@/lib/stripe/config"
import { ApplicationUpsertSchema, STRIPE_APPLICATION_PRODUCTS } from "@/lib/stripe/shapes"

export interface ApplicationRow {
  id: string
  product: string
  status: string
  notes: string | null
  updatedBy: string
  updatedAt: string
}

type DbRow = { id: string; product: string; status: string; notes: string | null; updatedBy: string; updatedAt: Date }
const map = (r: DbRow): ApplicationRow => ({
  id: r.id, product: r.product, status: r.status, notes: r.notes, updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString(),
})

export async function listApplications(): Promise<ApplicationRow[]> {
  const rows = await prisma.stripeApplication.findMany({ orderBy: { product: "asc" } })
  return rows.map((r) => map(r as DbRow))
}

export async function upsertApplication(product: string, input: unknown, by: string): Promise<ApplicationRow> {
  if (!(STRIPE_APPLICATION_PRODUCTS as readonly string[]).includes(product)) {
    throw new BillingError(`Unknown product: ${product}`)
  }
  const res = ApplicationUpsertSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { status, notes } = res.data
  const saved = await prisma.stripeApplication.upsert({
    where: { product },
    create: { product, status, notes: notes ?? null, updatedBy: by },
    update: { status, notes: notes ?? null, updatedBy: by },
  })
  return map(saved as DbRow)
}
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/applications.ts tests/billing/applications.test.ts
git commit -m "feat(billing): Stripe application tracker domain lib (list + upsert)"
```

---

### Task 6: Billing actions (gate + application actions) (TDD)

**Files:** Create `actions/cms/billing.ts`; Modify `lib/cms/audit.ts` (add `"stripe_application_update"`); Test `tests/billing/actions.test.ts`.

**Interfaces (actions, gated `MANAGE_BILLING`):**
- `listApplicationsAction(): Promise<{ ok:true; applications: ApplicationRow[] } | { ok:false; error:string }>`
- `upsertApplicationAction(product: string, input: { status: string; notes?: string }): Promise<{ ok:true } | { ok:false; error:string }>` — audits `"stripe_application_update"` (target = product), revalidates `/admin/billing/applications`.
- Internal `actor()` helper (gate) and `ip()` — identical to `actions/cms/kyc.ts`. (D2–D4 add their actions to this same file, reusing `actor()`/`ip()`/`REQUIRED`.)

- [ ] **Step 1: Add the audit literal** `| "stripe_application_update"` to the `AuditAction` union in `lib/cms/audit.ts`.

- [ ] **Step 2: Write the failing test** — `tests/billing/actions.test.ts` (mirror `tests/kyc/actions.test.ts`): mock `@/lib/cms/authz`, `@/lib/cms/audit`, `next/cache`, `next/headers`, and partial-mock `@/lib/stripe/applications` (`listApplications`/`upsertApplication`). Use an `asUser(privs)` helper that sets `currentUser` mock return. Cover:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/stripe/applications', () => ({ listApplications: vi.fn(), upsertApplication: vi.fn() }));

import { listApplicationsAction, upsertApplicationAction } from '@/actions/cms/billing';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import { listApplications, upsertApplication } from '@/lib/stripe/applications';
import { BillingError } from '@/lib/stripe/config';

const cu = currentUser as unknown as ReturnType<typeof vi.fn>;
const asUser = (privileges: string[]) => cu.mockResolvedValue({ id: 'u1', email: 'op@subfrost.io', privileges });
beforeEach(() => vi.clearAllMocks());

describe('gate', () => {
  it('denies when unauthenticated', async () => {
    cu.mockResolvedValueOnce(null);
    expect(await listApplicationsAction()).toEqual({ ok: false, error: 'Not authenticated' });
  });
  it('denies without MANAGE_BILLING', async () => {
    asUser(['MANAGE_AML']);
    expect(await upsertApplicationAction('treasury', { status: 'APPROVED' })).toEqual({ ok: false, error: 'Insufficient privileges' });
    expect(upsertApplication).not.toHaveBeenCalled();
  });
});

describe('actions', () => {
  it('lists applications', async () => {
    asUser(['MANAGE_BILLING']);
    (listApplications as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'a1', product: 'treasury', status: 'PENDING', notes: null, updatedBy: 'x', updatedAt: '2026-06-01T00:00:00.000Z' }]);
    const r = await listApplicationsAction();
    expect(r).toEqual({ ok: true, applications: [{ id: 'a1', product: 'treasury', status: 'PENDING', notes: null, updatedBy: 'x', updatedAt: '2026-06-01T00:00:00.000Z' }] });
  });
  it('upserts, audits, revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (upsertApplication as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'a1', product: 'treasury', status: 'APPROVED', notes: null, updatedBy: 'op@subfrost.io', updatedAt: '2026-06-02T00:00:00.000Z' });
    const r = await upsertApplicationAction('treasury', { status: 'APPROVED' });
    expect(r).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_application_update', expect.objectContaining({ actorId: 'u1', target: 'treasury' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/applications');
  });
  it('maps BillingError without auditing', async () => {
    asUser(['MANAGE_BILLING']);
    (upsertApplication as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new BillingError('Unknown product: x'));
    const r = await upsertApplicationAction('x', { status: 'APPROVED' });
    expect(r).toEqual({ ok: false, error: 'Unknown product: x' });
    expect(audit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run → RED.**

- [ ] **Step 4: Create `actions/cms/billing.ts`** (mirror `actions/cms/kyc.ts` exactly for `ip()`/`actor()`):

```ts
"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import { BillingError } from "@/lib/stripe/config"
import { listApplications, upsertApplication, type ApplicationRow } from "@/lib/stripe/applications"

const REQUIRED: Privilege = "MANAGE_BILLING"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function actor(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(REQUIRED)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

export async function listApplicationsAction(): Promise<
  { ok: true; applications: ApplicationRow[] } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  return { ok: true, applications: await listApplications() }
}

export async function upsertApplicationAction(
  product: string,
  input: { status: string; notes?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await upsertApplication(product, input, a.me.email)
    await audit("stripe_application_update", { actorId: a.me.id, target: product, ip: await ip() })
    revalidatePath("/admin/billing/applications")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError) return { ok: false, error: e.message }
    throw e
  }
}
```

- [ ] **Step 5: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` + full suite.
- [ ] **Step 6: Commit**

```bash
git add actions/cms/billing.ts lib/cms/audit.ts tests/billing/actions.test.ts
git commit -m "feat(billing): MANAGE_BILLING-gated application actions + audit literal"
```

---

### Task 7: Demo banner + /admin/billing hub + nav

**Files:** Create `components/cms/billing/BillingBanner.tsx`, `app/admin/billing/page.tsx`; Modify `components/cms/AdminShell.tsx` (nav item). No UI unit test (domain/actions covered in Tasks 2–6).

**Interfaces:** Produces `BillingBanner` (server component, prop `{ live: boolean }`, renders nothing when `live`). The hub renders a card grid of all seven surfaces with a `ready` flag — Applications is the only `ready` card in D1; D2–D4 flip their card to `ready` + create the route.

- [ ] **Step 1: Create `components/cms/billing/BillingBanner.tsx`** (server component — no `"use client"`):

```tsx
import { DEMO_REASON } from "@/lib/stripe/config"

/** Non-blocking demo banner shown on Stripe-backed pages when not connected. */
export function BillingBanner({ live }: { live: boolean }) {
  if (live) return null
  return (
    <div className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
      {DEMO_REASON}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/admin/billing/page.tsx`** — server component, `export const dynamic = "force-dynamic"`. Gate exactly like `app/admin/kyc/page.tsx`: `const me = await currentUser(); if (!me) redirect("/admin/login"); if (!me.privileges.includes("MANAGE_BILLING")) redirect("/admin")`. Compute `const live = isLive()` (import from `@/lib/stripe/config`). Render heading "Billing" + `<BillingBanner live={live} />` + a responsive card grid (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`) from this list:

```tsx
const SURFACES: { key: string; label: string; href: string; desc: string; ready: boolean }[] = [
  { key: "subscriptions", label: "Subscriptions", href: "/admin/billing/subscriptions", desc: "Tiers & subscribers", ready: false },
  { key: "promo", label: "Promo codes", href: "/admin/billing/promo", desc: "Coupons & promotion codes", ready: false },
  { key: "treasury", label: "Treasury", href: "/admin/billing/treasury", desc: "Balances, transactions, ACH", ready: false },
  { key: "issuing", label: "Issuing", href: "/admin/billing/issuing", desc: "Cards, controls, disputes", ready: false },
  { key: "offramp", label: "Offramp", href: "/admin/billing/offramp", desc: "Crypto→fiat settlements", ready: false },
  { key: "customers", label: "Customers", href: "/admin/billing/customers", desc: "Subscriptions, invoices, charges", ready: false },
  { key: "applications", label: "Applications", href: "/admin/billing/applications", desc: "Stripe product onboarding", ready: true },
]
```

Each `ready` card is a `<Link>` (zinc card, `hover:border-zinc-600`); each non-ready card is a dimmed `<div>` (`opacity-50`, `cursor-default`) with a small "Coming soon" tag. This keeps the hub complete and avoids linking to not-yet-built routes.

- [ ] **Step 3: Add the nav item** in `components/cms/AdminShell.tsx`: add `CreditCard` to the `lucide-react` import, and after the MTL `NavItem` add:

```tsx
{can("MANAGE_BILLING") && <NavItem href="/admin/billing" icon={<CreditCard size={16} />}>Billing</NavItem>}
```

- [ ] **Step 4: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green (308 + new).

- [ ] **Step 5: Commit**

```bash
git add components/cms/billing/BillingBanner.tsx app/admin/billing/page.tsx components/cms/AdminShell.tsx
git commit -m "feat(billing): demo banner + /admin/billing hub + nav (mobile-first)"
```

---

### Task 8: Applications page + ApplicationsManager

**Files:** Create `app/admin/billing/applications/page.tsx`, `components/cms/billing/ApplicationsManager.tsx`. No UI unit test.

**Interfaces:** Consumes `listApplicationsAction`/`upsertApplicationAction` (Task 6), `ApplicationRow` (Task 5), `STRIPE_APPLICATION_PRODUCTS`/`STRIPE_APPLICATION_STATUSES`/`STRIPE_APPLICATION_STATUS_LABELS` (Task 3).

- [ ] **Step 1: Create `app/admin/billing/applications/page.tsx`** — mirror `app/admin/kyc/page.tsx`: `export const dynamic = "force-dynamic"`; gate on `MANAGE_BILLING` (redirect login/admin); heading "Stripe applications" + a short description ("Track onboarding status for each Stripe product."); render `<ApplicationsManager />`. (No `BillingBanner` here — the tracker is pure local data, not Stripe-backed.)

- [ ] **Step 2: Create `components/cms/billing/ApplicationsManager.tsx`** — `"use client"`, mobile-first, zinc, match `MtlManager` styling. Requirements:
  - On mount, call `listApplicationsAction()`; hold rows in state; show `{ok:false}` errors in a banner.
  - Render **one card per product** in `STRIPE_APPLICATION_PRODUCTS` (treasury/issuing/offramp), merging the fetched row by `product` (default `status: "NOT_STARTED"`, `notes: ""` when no row exists yet — the row is created on first save).
  - Each card: product label (capitalize), a status `<select>` populated from `STRIPE_APPLICATION_STATUSES` + `STRIPE_APPLICATION_STATUS_LABELS`, a `notes` `Input`, and a "Save" `Button` → `upsertApplicationAction(product, { status, notes })` inside a `useTransition`; on success refetch; on `{ok:false}` show the error.
  - Show `updatedBy` + `updatedAt` (locale string) when present.
  - Import `STRIPE_APPLICATION_*` from `@/lib/stripe/shapes` (client-safe) and the `ApplicationRow` type from `@/lib/stripe/applications`.

- [ ] **Step 3: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green.

- [ ] **Step 4: Commit**

```bash
git add app/admin/billing/applications/page.tsx components/cms/billing/ApplicationsManager.tsx
git commit -m "feat(billing): Stripe applications tracker page + manager (mobile-first)"
```

---

## Self-Review

**Spec coverage (D1 = Foundation row of the spec's sub-plan table + the cross-cutting decisions):**
- 6 models + 4 enums (StripeMoneyIntent, StripeCardControl, StripeDisputeEvidence, StripePromoCode, StripeSubscriptionAction, StripeApplication) → Task 1. ✅
- `isLive()` gating + `DEMO_REASON` + `StripeNotWiredError` + shared `BillingError` (Decision 2/3/4) → Task 2. ✅
- Client-safe read shapes (ported from subkube-mock) + `SourceResult<T>` + application zod (Decision 3) → Task 3. ✅
- Pluggable source: seed-complete + live-stub + selector (Decision 2) → Task 4. ✅
- Application tracker domain lib (pure Postgres) → Task 5. ✅
- `MANAGE_BILLING`-gated actions + audit literal → Task 6. ✅
- Demo banner + `/admin/billing` hub + single nav item (IA decision) → Task 7. ✅
- Applications page + manager (first working surface, mobile-first) → Task 8. ✅
- *Deferred to D2–D4 (by design):* revenue (subs+promo), money-ops (treasury/issuing/offramp + MoneyIntentQueue + guardrail mutations), customers/billing portal. The source/shapes are extended by those sub-plans; the `StripeApplication` overlay models for money/card/dispute/promo/subscription are created here (Task 1) and consumed there.

**Placeholder scan:** Tasks 1–6 contain complete code. Task 4 Step 4 instructs porting the subkube-mock data — full deterministic bodies are given inline (not a placeholder). Tasks 7–8 are UI, spec'd to concrete requirements mirroring `KycManager`/`MtlManager` (the campaign's established no-UI-unit-test pattern). No TBD/TODO. ✅

**Type consistency:** `ApplicationRow` (Task 5) ↔ `actions/cms/billing.ts` (Task 6) ↔ `ApplicationsManager` (Task 8). `StripeSource` (Task 4 `types.ts`) implemented by `seedSource`/`liveSource` (Task 4) and selected by `getStripeSource` (Task 4). `BillingError`/`StripeNotWiredError`/`isLive`/`DEMO_REASON` (Task 2) used in Tasks 4–7. `ApplicationUpsertSchema`/`STRIPE_APPLICATION_*` (Task 3) used in Tasks 5/8. Audit literal `"stripe_application_update"` (Task 6) matches its call site. `prisma.stripeApplication` accessor (Task 1) used in Task 5. ✅

## Notes for follow-up (D2–D4)
- **D2 Revenue:** extend `StripeSource` (+`subscriptionTiers`/`subscribers`/`promoCodes`) in `types.ts`/`seed.ts`/`live.ts` + add shapes; `lib/stripe/subscriptions.ts` + `lib/stripe/promo.ts` (low-risk mutations: direct-when-live / overlay-in-seed via `StripeSubscriptionAction`/`StripePromoCode`); actions + Subscriptions/Promo pages+managers; flip those hub cards to `ready`.
- **D3 Money-ops:** `lib/stripe/treasury.ts` (+ `queueTransfer`/`confirmTransfer`/`cancelTransfer` guardrail via `StripeMoneyIntent`), `lib/stripe/issuing.ts` (`setCardControl`/`submitDisputeEvidence` overlays), `lib/stripe/offramp.ts` (read-only); `components/cms/billing/MoneyIntentQueue.tsx`; actions + pages+managers; flip hub cards.
- **D4 Customers:** extend source (+`customerSummaries`/`customerDetail`); `lib/stripe/customers.ts` (+ `requestRefund` via `StripeMoneyIntent kind=REFUND`); page+manager; flip hub card.
- **Live wiring (when flex sets `STRIPE_SECRET_KEY`):** replace the `live.ts` stubs with real Stripe SDK calls behind the source boundary + add the `stripe` dep; wire low-risk mutations' live branch. No action/UI changes needed.
