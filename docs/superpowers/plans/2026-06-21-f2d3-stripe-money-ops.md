# F2-D3 — Stripe billing console: Money-ops (treasury + issuing + offramp) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Money-ops surfaces of the Stripe billing console — Treasury (balances, transactions, ACH **queue+confirm guardrail**), Issuing (cards + controls + disputes/evidence), and Offramp (read-only settlements) — extending the D1/D2 foundation, gated by `MANAGE_BILLING`.

**Architecture:** The money-ops READ methods (`treasuryBalances`/`treasuryTransactions`/`issuingCards`/`issuingDisputes`/`offrampSettlements`) already exist on `StripeSource` from D1 — this plan does NOT touch `source/*`. It adds: zod inputs to `lib/stripe/shapes.ts`; a shared money-guardrail lib `lib/stripe/money.ts` (`StripeMoneyIntent` queue+confirm — used in BOTH modes, the only "always-persisted" surface); read libs `treasury.ts`/`offramp.ts`; an `issuing.ts` lib with low-risk hybrid mutations + seed-mode overlays (`StripeCardControl`, `StripeDisputeEvidence`); privilege-gated actions; a shared `MoneyIntentQueue` component; three pages + managers; and the three hub cards flipped to `ready`.

**Tech Stack:** Next 16 App Router, Prisma/Postgres, zod, React 18, Tailwind (zinc), `@/components/ui/*`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-f2-plano-d-stripe-design.md`. Sub-plan **3 of 4** of Plano D (D1 ✅, D2 ✅, **D3=Money-ops**, D4=Customers). Built on the landed D1+D2 code.

## Foundation this plan consumes (already on the branch)
- `lib/stripe/config.ts` — `isLive()`, `BillingError`, `StripeNotWiredError`.
- `lib/stripe/shapes.ts` — money-ops read types `TreasuryBalance`, `TreasuryTransaction`, `IssuingCard`, `IssuingDispute`, `OfframpSettlement` (D1). You APPEND zod inputs here.
- `lib/stripe/source/index.ts` — `getStripeSource()` already serves the money-ops reads (seed/live).
- Prisma models (D1): `StripeMoneyIntent { id, kind StripeMoneyKind(ACH_TRANSFER|REFUND), direction, amount, counterparty, reference, memo, status StripeMoneyStatus(QUEUED|CONFIRMED|CANCELED) @default(QUEUED), requestedBy, requestedAt, decidedBy, decidedAt }`, `StripeCardControl { cardId @id, state, by, at }`, `StripeDisputeEvidence { id, disputeId, evidence, evidenceFiles String[], by, at }`. Accessors `prisma.stripeMoneyIntent`, `prisma.stripeCardControl`, `prisma.stripeDisputeEvidence`.
- `actions/cms/billing.ts` — `"use server"`, `REQUIRED="MANAGE_BILLING"`, `ip()`, `actor()`, and the D1/D2 actions. Already imports `BillingError, StripeNotWiredError` from `@/lib/stripe/config`. You APPEND new actions, reusing `actor()`/`ip()`.
- `app/admin/billing/page.tsx` — the `SURFACES` array (flip `treasury`, `issuing`, `offramp` to `ready:true`).
- `components/cms/billing/{ApplicationsManager,SubscriptionsManager,PromoManager}.tsx` + `BillingBanner.tsx` — the manager + page patterns to mirror.
- D2 hybrid pattern (in `subscriptions.ts`/`promo.ts`): read composes `getStripeSource()` with overlays ONLY when `!isLive()`; mutation validates → `if (isLive()) throw StripeNotWiredError` → else persist overlay. Reuse it verbatim.

## Global Constraints
- **Branch:** `feat/compliance-aml-stripe` (continue on it). **No PR, no push, no touching main** until flex approves — commit locally only.
- **Prisma:** D1's models cover D3 (no schema change). Do NOT edit `prisma/schema.prisma`; do NOT run `prisma generate`/`db push`.
- **Money guardrail (the one always-persisted surface):** `queueAchTransfer` ALWAYS writes a `StripeMoneyIntent` (`QUEUED`) in both modes (queueing is local, never a Stripe call). `confirmIntent` requires the intent be `QUEUED`, then `if (isLive()) throw StripeNotWiredError` (live execution deferred) else mark `CONFIRMED` + `decidedBy`/`decidedAt`. `cancelIntent` requires `QUEUED`, marks `CANCELED` + `decidedBy`/`decidedAt` in BOTH modes (canceling a local intent never calls Stripe). Never auto-execute.
- **Low-risk hybrid (issuing):** `setCardControl`/`submitDisputeEvidence` validate → `if (isLive()) throw StripeNotWiredError` → else persist overlay. Reads layer overlays ONLY when `!isLive()`.
- **`lib/stripe/shapes.ts` stays client-safe** (only zod). Managers import value consts from `shapes.ts` and row TYPES via `import type` from the domain libs / shapes (never a value import of a prisma-touching lib into a client component).
- **Stripe-backed pages render the banner:** treasury/issuing/offramp pages render `<BillingBanner live={isLive()} />`.
- **Theme zinc, mobile-first** for all UI; mirror the existing managers.
- **Test mocks:** mock `@/lib/prisma` (`{ prisma, default }`), `@/lib/cms/authz`, `@/lib/cms/audit`, `next/cache`, `next/headers`; for libs reading the source mock `@/lib/stripe/source` (`getStripeSource`) + partial-mock `@/lib/stripe/config` (override `isLive`, keep real `BillingError`/`StripeNotWiredError`). Tests under `tests/billing/`.
- **Verify gate (per task):** `node_modules/.bin/tsc --noEmit` → 0; `CI=true node_modules/.bin/vitest run` → green (the **360** from D2 + new).
- **Untracked `.npmrc` must NEVER be `git add`ed.** Each commit stages only the files its task names.

---

### Task 1: Money-ops shapes + zod inputs (TDD)

**Files:** Modify `lib/stripe/shapes.ts` (append); Test `tests/billing/shapes-money.test.ts`.

**Interfaces:** Appends (client-safe): const tuples `TRANSFER_DIRECTIONS`, `CARD_STATES`, `MONEY_INTENT_STATUSES` + label maps `CARD_STATE_LABELS`, `MONEY_INTENT_STATUS_LABELS`; zod `QueueTransferSchema`+`QueueTransferInput`, `CardControlSchema`+`CardControlInput`, `DisputeEvidenceSchema`+`DisputeEvidenceInput`.

- [ ] **Step 1: Write the failing test** — `tests/billing/shapes-money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  TRANSFER_DIRECTIONS, CARD_STATES, MONEY_INTENT_STATUSES,
  CARD_STATE_LABELS, MONEY_INTENT_STATUS_LABELS,
  QueueTransferSchema, CardControlSchema, DisputeEvidenceSchema,
} from '@/lib/stripe/shapes';

describe('money-ops constants', () => {
  it('transfer directions / card states / intent statuses with labels', () => {
    expect(TRANSFER_DIRECTIONS).toEqual(['in', 'out']);
    expect(CARD_STATES).toEqual(['active', 'paused', 'canceled']);
    expect(MONEY_INTENT_STATUSES).toEqual(['QUEUED', 'CONFIRMED', 'CANCELED']);
    for (const s of CARD_STATES) expect(typeof CARD_STATE_LABELS[s]).toBe('string');
    for (const s of MONEY_INTENT_STATUSES) expect(typeof MONEY_INTENT_STATUS_LABELS[s]).toBe('string');
  });
});

describe('QueueTransferSchema', () => {
  it('accepts a valid transfer', () => {
    expect(QueueTransferSchema.safeParse({ direction: 'out', amount: 5000, counterparty: 'Gusto' }).success).toBe(true);
  });
  it('rejects bad direction, non-positive amount, empty counterparty', () => {
    expect(QueueTransferSchema.safeParse({ direction: 'sideways', amount: 1, counterparty: 'x' }).success).toBe(false);
    expect(QueueTransferSchema.safeParse({ direction: 'in', amount: 0, counterparty: 'x' }).success).toBe(false);
    expect(QueueTransferSchema.safeParse({ direction: 'in', amount: 1, counterparty: '' }).success).toBe(false);
  });
});

describe('CardControlSchema / DisputeEvidenceSchema', () => {
  it('card control accepts a valid state, rejects unknown', () => {
    expect(CardControlSchema.safeParse({ state: 'paused' }).success).toBe(true);
    expect(CardControlSchema.safeParse({ state: 'frozen' }).success).toBe(false);
  });
  it('dispute evidence requires non-empty evidence, optional files', () => {
    expect(DisputeEvidenceSchema.safeParse({ evidence: 'receipt attached' }).success).toBe(true);
    expect(DisputeEvidenceSchema.safeParse({ evidence: 'x', evidenceFiles: ['a.pdf'] }).success).toBe(true);
    expect(DisputeEvidenceSchema.safeParse({ evidence: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Append to `lib/stripe/shapes.ts`** (after the revenue block, before EOF):

```ts

// --- Money-ops: treasury + issuing (D3) ---
export const TRANSFER_DIRECTIONS = ["in", "out"] as const
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number]

export const CARD_STATES = ["active", "paused", "canceled"] as const
export type CardStateValue = (typeof CARD_STATES)[number]
export const CARD_STATE_LABELS: Record<CardStateValue, string> = {
  active: "Active",
  paused: "Paused",
  canceled: "Canceled",
}

export const MONEY_INTENT_STATUSES = ["QUEUED", "CONFIRMED", "CANCELED"] as const
export type MoneyIntentStatusValue = (typeof MONEY_INTENT_STATUSES)[number]
export const MONEY_INTENT_STATUS_LABELS: Record<MoneyIntentStatusValue, string> = {
  QUEUED: "Queued",
  CONFIRMED: "Confirmed",
  CANCELED: "Canceled",
}

export const QueueTransferSchema = z.object({
  direction: z.enum(TRANSFER_DIRECTIONS),
  amount: z.number().int().positive(), // cents
  counterparty: z.string().min(1),
  memo: z.string().optional(),
})
export type QueueTransferInput = z.infer<typeof QueueTransferSchema>

export const CardControlSchema = z.object({
  state: z.enum(CARD_STATES),
})
export type CardControlInput = z.infer<typeof CardControlSchema>

export const DisputeEvidenceSchema = z.object({
  evidence: z.string().min(1),
  evidenceFiles: z.array(z.string()).optional(),
})
export type DisputeEvidenceInput = z.infer<typeof DisputeEvidenceSchema>
```

- [ ] **Step 4: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/shapes.ts tests/billing/shapes-money.test.ts
git commit -m "feat(billing): money-ops zod inputs (transfer, card control, dispute evidence)"
```

---

### Task 2: Money guardrail lib (TDD)

**Files:** Create `lib/stripe/money.ts`; Test `tests/billing/money.test.ts`.

**Interfaces:**
- `interface MoneyIntentRow { id: string; kind: string; direction: string | null; amount: number; counterparty: string | null; reference: string | null; memo: string | null; status: string; requestedBy: string; requestedAt: string; decidedBy: string | null; decidedAt: string | null }`
- `listIntents(kind?: "ACH_TRANSFER" | "REFUND"): Promise<MoneyIntentRow[]>` — `findMany({ where: kind?{kind}:undefined, orderBy: { requestedAt: "desc" } })`, mapped (ISO dates).
- `queueAchTransfer(input: unknown, by: string): Promise<MoneyIntentRow>` — validate `QueueTransferSchema` (else `BillingError`, no write); create `StripeMoneyIntent` `{ kind:"ACH_TRANSFER", direction, amount, counterparty, memo: memo??null, status:"QUEUED", requestedBy: by }` (BOTH modes; no isLive branch).
- `confirmIntent(id: string, by: string): Promise<MoneyIntentRow>` — load; if missing or `status !== "QUEUED"` → `BillingError`; then `if (isLive()) throw StripeNotWiredError("confirmIntent")`; else update `{ status:"CONFIRMED", decidedBy: by, decidedAt: new Date() }`.
- `cancelIntent(id: string, by: string): Promise<MoneyIntentRow>` — load; if missing or `status !== "QUEUED"` → `BillingError`; update `{ status:"CANCELED", decidedBy: by, decidedAt: new Date() }` (BOTH modes, no isLive throw).

- [ ] **Step 1: Write the failing test** — `tests/billing/money.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeMoneyIntent = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const client = { stripeMoneyIntent };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listIntents, queueAchTransfer, confirmIntent, cancelIntent } from '@/lib/stripe/money';
import { BillingError, StripeNotWiredError, isLive } from '@/lib/stripe/config';
import { prisma } from '@/lib/prisma';

const smi = prisma.stripeMoneyIntent as unknown as Record<string, ReturnType<typeof vi.fn>>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => { vi.clearAllMocks(); live.mockReturnValue(false); });

describe('listIntents', () => {
  it('filters by kind and maps ISO dates', async () => {
    smi.findMany.mockResolvedValueOnce([{ id: 'm1', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', reference: null, memo: null, status: 'QUEUED', requestedBy: 'op', requestedAt: new Date('2026-06-02T00:00:00Z'), decidedBy: null, decidedAt: null }]);
    const r = await listIntents('ACH_TRANSFER');
    expect(smi.findMany).toHaveBeenCalledWith({ where: { kind: 'ACH_TRANSFER' }, orderBy: { requestedAt: 'desc' } });
    expect(r[0].requestedAt).toBe('2026-06-02T00:00:00.000Z');
    expect(r[0].decidedAt).toBeNull();
  });
});

describe('queueAchTransfer', () => {
  it('rejects invalid input without writing', async () => {
    await expect(queueAchTransfer({ direction: 'in', amount: 0, counterparty: 'x' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(smi.create).not.toHaveBeenCalled();
  });
  it('queues a QUEUED intent in seed mode', async () => {
    smi.create.mockResolvedValueOnce({ id: 'm2', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', reference: null, memo: 'payroll', status: 'QUEUED', requestedBy: 'op', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: null, decidedAt: null });
    const r = await queueAchTransfer({ direction: 'out', amount: 5000, counterparty: 'Gusto', memo: 'payroll' }, 'op');
    expect(smi.create).toHaveBeenCalledWith({ data: { kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', memo: 'payroll', status: 'QUEUED', requestedBy: 'op' } });
    expect(r.status).toBe('QUEUED');
  });
  it('queues even in live mode (queueing is local, no Stripe call)', async () => {
    live.mockReturnValue(true);
    smi.create.mockResolvedValueOnce({ id: 'm3', kind: 'ACH_TRANSFER', direction: 'in', amount: 100, counterparty: 'x', reference: null, memo: null, status: 'QUEUED', requestedBy: 'op', requestedAt: new Date(), decidedBy: null, decidedAt: null });
    await expect(queueAchTransfer({ direction: 'in', amount: 100, counterparty: 'x' }, 'op')).resolves.toMatchObject({ status: 'QUEUED' });
    expect(smi.create).toHaveBeenCalled();
  });
});

describe('confirmIntent', () => {
  it('rejects when not found or not QUEUED', async () => {
    smi.findUnique.mockResolvedValueOnce(null);
    await expect(confirmIntent('nope', 'op')).rejects.toBeInstanceOf(BillingError);
    smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'CONFIRMED' });
    await expect(confirmIntent('m1', 'op')).rejects.toBeInstanceOf(BillingError);
    expect(smi.update).not.toHaveBeenCalled();
  });
  it('throws StripeNotWiredError in live mode without updating', async () => {
    live.mockReturnValue(true);
    smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED' });
    await expect(confirmIntent('m1', 'op')).rejects.toBeInstanceOf(StripeNotWiredError);
    expect(smi.update).not.toHaveBeenCalled();
  });
  it('marks CONFIRMED with decidedBy in seed mode', async () => {
    smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED' });
    smi.update.mockResolvedValueOnce({ id: 'm1', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', reference: null, memo: null, status: 'CONFIRMED', requestedBy: 'req', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: 'op', decidedAt: new Date('2026-06-04T00:00:00Z') });
    const r = await confirmIntent('m1', 'op');
    expect(smi.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'CONFIRMED', decidedBy: 'op', decidedAt: expect.any(Date) } });
    expect(r.status).toBe('CONFIRMED');
    expect(r.decidedBy).toBe('op');
  });
});

describe('cancelIntent', () => {
  it('marks CANCELED in seed AND live (no Stripe call)', async () => {
    for (const liveMode of [false, true]) {
      vi.clearAllMocks();
      live.mockReturnValue(liveMode);
      smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED' });
      smi.update.mockResolvedValueOnce({ id: 'm1', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'g', reference: null, memo: null, status: 'CANCELED', requestedBy: 'req', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: 'op', decidedAt: new Date('2026-06-04T00:00:00Z') });
      const r = await cancelIntent('m1', 'op');
      expect(r.status).toBe('CANCELED');
      expect(smi.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'CANCELED', decidedBy: 'op', decidedAt: expect.any(Date) } });
    }
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/money.ts`:**

```ts
/** Money-movement guardrail for the Stripe console. Reached through actions/cms/billing.ts
 *  (gated MANAGE_BILLING). Used by Treasury (ACH) and, in D4, Customers (refunds). Money
 *  movement NEVER auto-executes: it is queued as a StripeMoneyIntent and requires an explicit
 *  confirm. Queue + cancel are local in both modes; confirm executes the live Stripe transfer
 *  (stubbed today) — in seed mode it just marks the intent CONFIRMED for the demo. */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { QueueTransferSchema } from "@/lib/stripe/shapes"

export interface MoneyIntentRow {
  id: string
  kind: string
  direction: string | null
  amount: number
  counterparty: string | null
  reference: string | null
  memo: string | null
  status: string
  requestedBy: string
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
}

type DbIntent = {
  id: string; kind: string; direction: string | null; amount: number
  counterparty: string | null; reference: string | null; memo: string | null
  status: string; requestedBy: string; requestedAt: Date; decidedBy: string | null; decidedAt: Date | null
}
const map = (r: DbIntent): MoneyIntentRow => ({
  id: r.id, kind: r.kind, direction: r.direction, amount: r.amount,
  counterparty: r.counterparty, reference: r.reference, memo: r.memo, status: r.status,
  requestedBy: r.requestedBy, requestedAt: r.requestedAt.toISOString(),
  decidedBy: r.decidedBy, decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
})

export async function listIntents(kind?: "ACH_TRANSFER" | "REFUND"): Promise<MoneyIntentRow[]> {
  const rows = (await prisma.stripeMoneyIntent.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { requestedAt: "desc" },
  })) as DbIntent[]
  return rows.map(map)
}

export async function queueAchTransfer(input: unknown, by: string): Promise<MoneyIntentRow> {
  const res = QueueTransferSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { direction, amount, counterparty, memo } = res.data
  const saved = (await prisma.stripeMoneyIntent.create({
    data: { kind: "ACH_TRANSFER", direction, amount, counterparty, memo: memo ?? null, status: "QUEUED", requestedBy: by },
  })) as DbIntent
  return map(saved)
}

async function loadQueued(id: string): Promise<void> {
  const intent = await prisma.stripeMoneyIntent.findUnique({ where: { id } })
  if (!intent || intent.status !== "QUEUED") throw new BillingError("Intent not found or not in QUEUED state")
}

export async function confirmIntent(id: string, by: string): Promise<MoneyIntentRow> {
  await loadQueued(id)
  if (isLive()) throw new StripeNotWiredError("confirmIntent")
  const updated = (await prisma.stripeMoneyIntent.update({
    where: { id }, data: { status: "CONFIRMED", decidedBy: by, decidedAt: new Date() },
  })) as DbIntent
  return map(updated)
}

export async function cancelIntent(id: string, by: string): Promise<MoneyIntentRow> {
  await loadQueued(id)
  const updated = (await prisma.stripeMoneyIntent.update({
    where: { id }, data: { status: "CANCELED", decidedBy: by, decidedAt: new Date() },
  })) as DbIntent
  return map(updated)
}
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/money.ts tests/billing/money.test.ts
git commit -m "feat(billing): money-movement guardrail (queue + confirm/cancel intents)"
```

---

### Task 3: Treasury + Offramp read libs (TDD)

**Files:** Create `lib/stripe/treasury.ts`, `lib/stripe/offramp.ts`; Test `tests/billing/treasury-offramp.test.ts`.

**Interfaces:**
- `listBalances(): Promise<{ balances: TreasuryBalance[]; live: boolean }>` (treasury.ts) — `getStripeSource().treasuryBalances()` + `isLive()`.
- `listTransactions(): Promise<{ transactions: TreasuryTransaction[]; live: boolean }>` (treasury.ts).
- `listSettlements(): Promise<{ settlements: OfframpSettlement[]; live: boolean }>` (offramp.ts).

(These are pure read passthroughs — no overlays, no mutations. The treasury page combines them with the money-intent queue from Task 2.)

- [ ] **Step 1: Write the failing test** — `tests/billing/treasury-offramp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listBalances, listTransactions } from '@/lib/stripe/treasury';
import { listSettlements } from '@/lib/stripe/offramp';
import { getStripeSource } from '@/lib/stripe/source';
import { isLive } from '@/lib/stripe/config';

const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    treasuryBalances: vi.fn(async () => [{ accountId: 'a', nickname: 'Op', available: 100, pending: 0, currency: 'USD' }]),
    treasuryTransactions: vi.fn(async () => [{ id: 't1', type: 'fee', amount: -1, counterparty: 'Stripe', status: 'posted', at: '2026-06-01T00:00:00.000Z' }]),
    offrampSettlements: vi.fn(async () => [{ id: 'o1', userId: 'u', cryptoAsset: 'BTC', cryptoAmount: 1, fiatAmount: 1, feeAmount: 0, status: 'settled', at: '2026-06-01T00:00:00.000Z' }]),
  });
});

describe('treasury reads', () => {
  it('returns balances + live flag', async () => {
    const r = await listBalances();
    expect(r.live).toBe(false);
    expect(r.balances[0].accountId).toBe('a');
  });
  it('returns transactions + live flag', async () => {
    const r = await listTransactions();
    expect(r.transactions[0].id).toBe('t1');
  });
  it('passes through live flag when live', async () => {
    live.mockReturnValue(true);
    expect((await listBalances()).live).toBe(true);
  });
});

describe('offramp reads', () => {
  it('returns settlements + live flag', async () => {
    const r = await listSettlements();
    expect(r.live).toBe(false);
    expect(r.settlements[0].id).toBe('o1');
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/treasury.ts`:**

```ts
/** Treasury reads (FBO balances + transactions). Pure source passthrough; the ACH
 *  money-movement queue lives in lib/stripe/money.ts. Gated via actions/cms/billing.ts. */
import { isLive } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import type { TreasuryBalance, TreasuryTransaction } from "@/lib/stripe/shapes"

export async function listBalances(): Promise<{ balances: TreasuryBalance[]; live: boolean }> {
  const live = isLive()
  return { balances: await getStripeSource().treasuryBalances(), live }
}

export async function listTransactions(): Promise<{ transactions: TreasuryTransaction[]; live: boolean }> {
  const live = isLive()
  return { transactions: await getStripeSource().treasuryTransactions(), live }
}
```

- [ ] **Step 4: Create `lib/stripe/offramp.ts`:**

```ts
/** Offramp settlements (crypto→fiat). Read-only source passthrough. Gated via
 *  actions/cms/billing.ts. */
import { isLive } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import type { OfframpSettlement } from "@/lib/stripe/shapes"

export async function listSettlements(): Promise<{ settlements: OfframpSettlement[]; live: boolean }> {
  const live = isLive()
  return { settlements: await getStripeSource().offrampSettlements(), live }
}
```

- [ ] **Step 5: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 6: Commit**

```bash
git add lib/stripe/treasury.ts lib/stripe/offramp.ts tests/billing/treasury-offramp.test.ts
git commit -m "feat(billing): treasury + offramp read libs (source passthrough)"
```

---

### Task 4: Issuing domain lib (TDD)

**Files:** Create `lib/stripe/issuing.ts`; Test `tests/billing/issuing.test.ts`.

**Interfaces:**
- `listCards(): Promise<{ cards: IssuingCard[]; live: boolean }>` — `getStripeSource().issuingCards()`; in SEED mode only, override `card.state` from the latest `StripeCardControl` per `cardId`.
- `listDisputes(): Promise<{ disputes: IssuingDispute[]; live: boolean }>` — `getStripeSource().issuingDisputes()`; in SEED mode only, attach the latest `StripeDisputeEvidence` per `disputeId` (`evidence` → `evidence ?? undefined`, `evidenceFiles`).
- `setCardControl(cardId: string, input: unknown, by: string): Promise<{ cardId: string; state: string }>` — validate `CardControlSchema` (else `BillingError`, no write); `if (isLive()) throw StripeNotWiredError("setCardControl")`; else `prisma.stripeCardControl.upsert` by `cardId`.
- `submitDisputeEvidence(disputeId: string, input: unknown, by: string): Promise<{ disputeId: string }>` — validate `DisputeEvidenceSchema` (else `BillingError`, no write); `if (isLive()) throw StripeNotWiredError("submitDisputeEvidence")`; else `prisma.stripeDisputeEvidence.create` (`evidenceFiles: evidenceFiles ?? []`).

- [ ] **Step 1: Write the failing test** — `tests/billing/issuing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeCardControl = { findMany: vi.fn(), upsert: vi.fn() };
  const stripeDisputeEvidence = { findMany: vi.fn(), create: vi.fn() };
  const client = { stripeCardControl, stripeDisputeEvidence };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listCards, listDisputes, setCardControl, submitDisputeEvidence } from '@/lib/stripe/issuing';
import { BillingError, StripeNotWiredError, isLive } from '@/lib/stripe/config';
import { getStripeSource } from '@/lib/stripe/source';
import { prisma } from '@/lib/prisma';

const scc = prisma.stripeCardControl as unknown as Record<string, ReturnType<typeof vi.fn>>;
const sde = prisma.stripeDisputeEvidence as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    issuingCards: vi.fn(async () => [
      { id: 'ic_001', last4: '4242', cardholder: 'flex', type: 'virtual', state: 'active', wallet: { apple: true, google: false }, spendLimit: 1000, spentMtd: 0 },
    ]),
    issuingDisputes: vi.fn(async () => [
      { id: 'idp_001', cardId: 'ic_003', amount: 8900, reason: 'fraudulent', status: 'submitted', openedAt: '2026-06-01T00:00:00.000Z' },
    ]),
  });
});

describe('listCards (seed overlay)', () => {
  it('overrides card state from StripeCardControl in seed mode', async () => {
    scc.findMany.mockResolvedValueOnce([{ cardId: 'ic_001', state: 'paused', by: 'op', at: new Date() }]);
    const r = await listCards();
    expect(r.cards.find((c) => c.id === 'ic_001')!.state).toBe('paused');
  });
  it('does NOT query overlays in live mode', async () => {
    live.mockReturnValue(true);
    const r = await listCards();
    expect(scc.findMany).not.toHaveBeenCalled();
    expect(r.cards[0].state).toBe('active');
  });
});

describe('listDisputes (seed overlay)', () => {
  it('attaches latest evidence in seed mode', async () => {
    sde.findMany.mockResolvedValueOnce([{ id: 'e1', disputeId: 'idp_001', evidence: 'receipt', evidenceFiles: ['a.pdf'], by: 'op', at: new Date('2026-06-02T00:00:00Z') }]);
    const r = await listDisputes();
    const d = r.disputes.find((x) => x.id === 'idp_001')!;
    expect(d.evidence).toBe('receipt');
    expect(d.evidenceFiles).toEqual(['a.pdf']);
  });
});

describe('setCardControl', () => {
  it('rejects invalid state without writing', async () => {
    await expect(setCardControl('ic_001', { state: 'frozen' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(scc.upsert).not.toHaveBeenCalled();
  });
  it('throws in live mode without writing', async () => {
    live.mockReturnValue(true);
    await expect(setCardControl('ic_001', { state: 'paused' }, 'op')).rejects.toBeInstanceOf(StripeNotWiredError);
    expect(scc.upsert).not.toHaveBeenCalled();
  });
  it('upserts by cardId in seed mode', async () => {
    scc.upsert.mockResolvedValueOnce({ cardId: 'ic_001', state: 'paused', by: 'op', at: new Date() });
    const r = await setCardControl('ic_001', { state: 'paused' }, 'op');
    expect(scc.upsert).toHaveBeenCalledWith({ where: { cardId: 'ic_001' }, create: { cardId: 'ic_001', state: 'paused', by: 'op' }, update: { state: 'paused', by: 'op' } });
    expect(r).toEqual({ cardId: 'ic_001', state: 'paused' });
  });
});

describe('submitDisputeEvidence', () => {
  it('rejects empty evidence without writing', async () => {
    await expect(submitDisputeEvidence('idp_001', { evidence: '' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(sde.create).not.toHaveBeenCalled();
  });
  it('throws in live mode without writing', async () => {
    live.mockReturnValue(true);
    await expect(submitDisputeEvidence('idp_001', { evidence: 'x' }, 'op')).rejects.toBeInstanceOf(StripeNotWiredError);
    expect(sde.create).not.toHaveBeenCalled();
  });
  it('creates evidence in seed mode (files default to [])', async () => {
    sde.create.mockResolvedValueOnce({ id: 'e2', disputeId: 'idp_001', evidence: 'receipt', evidenceFiles: [], by: 'op', at: new Date() });
    const r = await submitDisputeEvidence('idp_001', { evidence: 'receipt' }, 'op');
    expect(sde.create).toHaveBeenCalledWith({ data: { disputeId: 'idp_001', evidence: 'receipt', evidenceFiles: [], by: 'op' } });
    expect(r).toEqual({ disputeId: 'idp_001' });
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Create `lib/stripe/issuing.ts`:**

```ts
/** Issuing surface (cards + disputes). Reads come from getStripeSource(); in seed mode
 *  the StripeCardControl / StripeDisputeEvidence overlays are layered on so the demo is
 *  interactive. Mutations are low-risk hybrid: live → Stripe (stubbed today); seed → overlay. */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import { CardControlSchema, DisputeEvidenceSchema, type IssuingCard, type IssuingDispute } from "@/lib/stripe/shapes"

export async function listCards(): Promise<{ cards: IssuingCard[]; live: boolean }> {
  const live = isLive()
  const cards = await getStripeSource().issuingCards()
  if (live) return { cards, live }
  const controls = await prisma.stripeCardControl.findMany()
  const byCard = new Map(controls.map((c) => [c.cardId, c.state]))
  const applied = cards.map((c) =>
    byCard.has(c.id) ? { ...c, state: byCard.get(c.id) as IssuingCard["state"] } : c,
  )
  return { cards: applied, live }
}

export async function listDisputes(): Promise<{ disputes: IssuingDispute[]; live: boolean }> {
  const live = isLive()
  const disputes = await getStripeSource().issuingDisputes()
  if (live) return { disputes, live }
  const rows = await prisma.stripeDisputeEvidence.findMany({ orderBy: { at: "desc" } })
  const byDispute = new Map<string, { evidence: string | null; evidenceFiles: string[] }>()
  for (const e of rows) if (!byDispute.has(e.disputeId)) byDispute.set(e.disputeId, { evidence: e.evidence, evidenceFiles: e.evidenceFiles })
  const applied = disputes.map((d) => {
    const e = byDispute.get(d.id)
    return e ? { ...d, evidence: e.evidence ?? undefined, evidenceFiles: e.evidenceFiles } : d
  })
  return { disputes: applied, live }
}

export async function setCardControl(cardId: string, input: unknown, by: string): Promise<{ cardId: string; state: string }> {
  const res = CardControlSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  if (isLive()) throw new StripeNotWiredError("setCardControl")
  const saved = await prisma.stripeCardControl.upsert({
    where: { cardId },
    create: { cardId, state: res.data.state, by },
    update: { state: res.data.state, by },
  })
  return { cardId: saved.cardId, state: saved.state }
}

export async function submitDisputeEvidence(disputeId: string, input: unknown, by: string): Promise<{ disputeId: string }> {
  const res = DisputeEvidenceSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  if (isLive()) throw new StripeNotWiredError("submitDisputeEvidence")
  await prisma.stripeDisputeEvidence.create({
    data: { disputeId, evidence: res.data.evidence, evidenceFiles: res.data.evidenceFiles ?? [], by },
  })
  return { disputeId }
}
```

- [ ] **Step 4: Run → GREEN.** Then `tsc --noEmit` (0).
- [ ] **Step 5: Commit**

```bash
git add lib/stripe/issuing.ts tests/billing/issuing.test.ts
git commit -m "feat(billing): issuing domain lib (cards/disputes reads + control/evidence)"
```

---

### Task 5: Money-ops actions + audit literals (TDD)

**Files:** Modify `actions/cms/billing.ts` (append), `lib/cms/audit.ts` (five literals); Test `tests/billing/actions-money.test.ts`.

**Interfaces (actions, gated `MANAGE_BILLING`, reusing `actor()`/`ip()`):**
- Reads (no audit): `listBalancesAction()` → `{ok,balances,live}`; `listTransactionsAction()` → `{ok,transactions,live}`; `listMoneyIntentsAction()` → `{ok,intents}` (calls `listIntents("ACH_TRANSFER")`); `listCardsAction()` → `{ok,cards,live}`; `listDisputesAction()` → `{ok,disputes,live}`; `listSettlementsAction()` → `{ok,settlements,live}`.
- Mutations (audit on success; map `BillingError`+`StripeNotWiredError` → `{ok:false}`):
  - `queueAchTransferAction(input)` → audit `"stripe_money_queue"` (target=`${input.direction} ${input.amount}`), revalidate `/admin/billing/treasury`.
  - `confirmIntentAction(id)` → audit `"stripe_money_confirm"` (target=id), revalidate `/admin/billing/treasury`.
  - `cancelIntentAction(id)` → audit `"stripe_money_cancel"` (target=id), revalidate `/admin/billing/treasury`.
  - `setCardControlAction(cardId, input)` → audit `"stripe_card_control"` (target=cardId), revalidate `/admin/billing/issuing`.
  - `submitDisputeEvidenceAction(disputeId, input)` → audit `"stripe_dispute_evidence"` (target=disputeId), revalidate `/admin/billing/issuing`.

- [ ] **Step 1: Add five audit literals** to the `AuditAction` union in `lib/cms/audit.ts`: `| "stripe_money_queue"`, `| "stripe_money_confirm"`, `| "stripe_money_cancel"`, `| "stripe_card_control"`, `| "stripe_dispute_evidence"`.

- [ ] **Step 2: Write the failing test** — `tests/billing/actions-money.test.ts` (mirror `tests/billing/actions-revenue.test.ts`): mock `@/lib/cms/authz`, `@/lib/cms/audit`, `next/cache`, `next/headers`, and the libs `@/lib/stripe/money` (`listIntents`/`queueAchTransfer`/`confirmIntent`/`cancelIntent`), `@/lib/stripe/treasury` (`listBalances`/`listTransactions`), `@/lib/stripe/offramp` (`listSettlements`), `@/lib/stripe/issuing` (`listCards`/`listDisputes`/`setCardControl`/`submitDisputeEvidence`). Use the same `asUser` helper. Cover:
  - gate: without `MANAGE_BILLING`, a read (`listCardsAction`) and the mutators return `{ok:false}` and the domain fns are NOT called;
  - `queueAchTransferAction` audits `"stripe_money_queue"` + revalidates `/admin/billing/treasury`;
  - `confirmIntentAction('m1')` audits `"stripe_money_confirm"` target `m1` + revalidates treasury;
  - `cancelIntentAction('m1')` audits `"stripe_money_cancel"`;
  - `setCardControlAction('ic_1',{state:'paused'})` audits `"stripe_card_control"` target `ic_1` + revalidates `/admin/billing/issuing`;
  - `submitDisputeEvidenceAction('idp_1',{evidence:'x'})` audits `"stripe_dispute_evidence"`;
  - a `StripeNotWiredError` from `confirmIntent` maps to `{ok:false}` without auditing;
  - a `BillingError` from `setCardControl` maps to `{ok:false}` without auditing;
  - reads pass through `live` (e.g. `listBalancesAction` → `{ok:true, balances, live:false}`).
  Follow the exact mock/assertion style of `tests/billing/actions-revenue.test.ts`.

- [ ] **Step 3: Run → RED.**

- [ ] **Step 4: Append to `actions/cms/billing.ts`.** Add the import lines (the config import already has `BillingError, StripeNotWiredError` — reuse it):

```ts
import { listIntents, queueAchTransfer, confirmIntent, cancelIntent, type MoneyIntentRow } from "@/lib/stripe/money"
import { listBalances, listTransactions } from "@/lib/stripe/treasury"
import { listSettlements } from "@/lib/stripe/offramp"
import { listCards, listDisputes, setCardControl, submitDisputeEvidence } from "@/lib/stripe/issuing"
import type { TreasuryBalance, TreasuryTransaction, IssuingCard, IssuingDispute, OfframpSettlement } from "@/lib/stripe/shapes"
```

Then append the actions (mirror the existing gated read/mutation patterns exactly — `actor()` first, audit-on-success, `catch (e) { if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok:false, error: e.message }; throw e }`):

```ts
export async function listBalancesAction(): Promise<
  { ok: true; balances: TreasuryBalance[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { balances, live } = await listBalances()
  return { ok: true, balances, live }
}

export async function listTransactionsAction(): Promise<
  { ok: true; transactions: TreasuryTransaction[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { transactions, live } = await listTransactions()
  return { ok: true, transactions, live }
}

export async function listMoneyIntentsAction(): Promise<
  { ok: true; intents: MoneyIntentRow[] } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  return { ok: true, intents: await listIntents("ACH_TRANSFER") }
}

export async function queueAchTransferAction(
  input: { direction: string; amount: number; counterparty: string; memo?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await queueAchTransfer(input, a.me.email)
    await audit("stripe_money_queue", { actorId: a.me.id, target: `${input.direction} ${input.amount}`, ip: await ip() })
    revalidatePath("/admin/billing/treasury")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function confirmIntentAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await confirmIntent(id, a.me.email)
    await audit("stripe_money_confirm", { actorId: a.me.id, target: id, ip: await ip() })
    revalidatePath("/admin/billing/treasury")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function cancelIntentAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await cancelIntent(id, a.me.email)
    await audit("stripe_money_cancel", { actorId: a.me.id, target: id, ip: await ip() })
    revalidatePath("/admin/billing/treasury")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listCardsAction(): Promise<
  { ok: true; cards: IssuingCard[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { cards, live } = await listCards()
  return { ok: true, cards, live }
}

export async function listDisputesAction(): Promise<
  { ok: true; disputes: IssuingDispute[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { disputes, live } = await listDisputes()
  return { ok: true, disputes, live }
}

export async function setCardControlAction(
  cardId: string,
  input: { state: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await setCardControl(cardId, input, a.me.email)
    await audit("stripe_card_control", { actorId: a.me.id, target: cardId, ip: await ip() })
    revalidatePath("/admin/billing/issuing")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function submitDisputeEvidenceAction(
  disputeId: string,
  input: { evidence: string; evidenceFiles?: string[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await submitDisputeEvidence(disputeId, input, a.me.email)
    await audit("stripe_dispute_evidence", { actorId: a.me.id, target: disputeId, ip: await ip() })
    revalidatePath("/admin/billing/issuing")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listSettlementsAction(): Promise<
  { ok: true; settlements: OfframpSettlement[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { settlements, live } = await listSettlements()
  return { ok: true, settlements, live }
}
```

- [ ] **Step 5: Run → GREEN.** Then `node_modules/.bin/tsc --noEmit` + full suite.
- [ ] **Step 6: Commit**

```bash
git add actions/cms/billing.ts lib/cms/audit.ts tests/billing/actions-money.test.ts
git commit -m "feat(billing): money-ops actions (treasury/issuing/offramp) + audit literals"
```

---

### Task 6: MoneyIntentQueue + Treasury page + manager + hub card

**Files:** Create `components/cms/billing/MoneyIntentQueue.tsx`, `app/admin/billing/treasury/page.tsx`, `components/cms/billing/TreasuryManager.tsx`; Modify `app/admin/billing/page.tsx` (flip `treasury` to `ready:true`). No UI unit test.

**Interfaces:** Consumes `listBalancesAction`/`listTransactionsAction`/`listMoneyIntentsAction`/`queueAchTransferAction`/`confirmIntentAction`/`cancelIntentAction` (Task 5), `TreasuryBalance`/`TreasuryTransaction` (shapes), `MoneyIntentRow` (money lib), `TRANSFER_DIRECTIONS`/`MONEY_INTENT_STATUS_LABELS` (shapes), `isLive` (config). `MoneyIntentQueue` is shared (D4 reuses it for refunds).

- [ ] **Step 1: Flip the hub card** in `app/admin/billing/page.tsx`: change ONLY the `treasury` entry to `ready: true`.

- [ ] **Step 2: Create `components/cms/billing/MoneyIntentQueue.tsx`** — `"use client"`, reusable. Props: `{ intents: MoneyIntentRow[]; pending: boolean; onConfirm: (id: string) => void; onCancel: (id: string) => void; error?: string | null }`. Render stacked cards: amount (cents→`$X.XX`), direction, counterparty/reference, memo, a status badge (from `MONEY_INTENT_STATUS_LABELS`), `requestedBy`/`requestedAt`. For `status === "QUEUED"` rows, show **Confirm** + **Cancel** buttons (disabled while `pending`); for `CONFIRMED`/`CANCELED`, show `decidedBy`/`decidedAt` as history. Import `MoneyIntentRow` type via `import type` from `@/lib/stripe/money`; `MONEY_INTENT_STATUS_LABELS` from `@/lib/stripe/shapes`.

- [ ] **Step 3: Create `app/admin/billing/treasury/page.tsx`** — mirror the subscriptions page: `dynamic="force-dynamic"`, gate `MANAGE_BILLING`, heading "Treasury" + short description, render `<BillingBanner live={isLive()} />` then `<TreasuryManager />`.

- [ ] **Step 4: Create `components/cms/billing/TreasuryManager.tsx`** — `"use client"`, mobile-first, zinc, mirror the other managers. Requirements:
  - On mount call `listBalancesAction()`, `listTransactionsAction()`, `listMoneyIntentsAction()` (e.g. `Promise.all`); top-level error banner on any `{ok:false}`.
  - **Balances section:** stacked read-only cards — nickname, available/pending (cents→`$X.XX`), accountId.
  - **Transactions section:** stacked read-only cards — type, amount (cents→`$X.XX`, negative shown as `-$X.XX`), counterparty, status, `at` (locale).
  - **Queue ACH section:** a form — direction (select from `TRANSFER_DIRECTIONS`), amount (number Input, dollars→cents or cents directly with a hint), counterparty (Input), memo (optional Input). A "Queue transfer" Button → `queueAchTransferAction({ direction, amount: Number(amount), counterparty, memo: memo || undefined })` in `useTransition`; on success clear + refetch intents; on `{ok:false}` form-level error.
  - **Money intent queue:** render `<MoneyIntentQueue intents={intents} pending={pending} onConfirm={(id)=>handle(confirmIntentAction(id))} onCancel={(id)=>handle(cancelIntentAction(id))} error={queueError} />`; on confirm/cancel success refetch intents.
  - Import value consts from `@/lib/stripe/shapes`; import `MoneyIntentRow` type via `import type` from `@/lib/stripe/money`, `TreasuryBalance`/`TreasuryTransaction` via `import type` from `@/lib/stripe/shapes`.

- [ ] **Step 5: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green (360).

- [ ] **Step 6: Commit**

```bash
git add app/admin/billing/page.tsx app/admin/billing/treasury/page.tsx components/cms/billing/TreasuryManager.tsx components/cms/billing/MoneyIntentQueue.tsx
git commit -m "feat(billing): treasury page + manager + money-intent queue + hub card (mobile-first)"
```

---

### Task 7: Issuing page + manager + hub card

**Files:** Create `app/admin/billing/issuing/page.tsx`, `components/cms/billing/IssuingManager.tsx`; Modify `app/admin/billing/page.tsx` (flip `issuing` to `ready:true`). No UI unit test.

**Interfaces:** Consumes `listCardsAction`/`listDisputesAction`/`setCardControlAction`/`submitDisputeEvidenceAction` (Task 5), `IssuingCard`/`IssuingDispute` (shapes), `CARD_STATES`/`CARD_STATE_LABELS` (shapes), `isLive`.

- [ ] **Step 1: Flip the hub card** in `app/admin/billing/page.tsx`: change ONLY the `issuing` entry to `ready: true`.

- [ ] **Step 2: Create `app/admin/billing/issuing/page.tsx`** — mirror the subscriptions page; heading "Issuing" + short description; `<BillingBanner live={isLive()} />` then `<IssuingManager />`.

- [ ] **Step 3: Create `components/cms/billing/IssuingManager.tsx`** — `"use client"`, mobile-first, zinc, mirror the other managers. Requirements:
  - On mount call `listCardsAction()` + `listDisputesAction()`; top-level error banner on `{ok:false}`.
  - **Cards section:** stacked cards — `cardholder`, `••• last4`, type, a state badge (from `CARD_STATE_LABELS`), spendLimit/spentMtd (cents→`$X.XX`), wallet (apple/google). A state `<select>` (from `CARD_STATES`/`CARD_STATE_LABELS`) + "Apply" Button → `setCardControlAction(card.id, { state })` in `useTransition`; on success refetch cards; on `{ok:false}` per-card error.
  - **Disputes section:** stacked cards — `id`, `cardId`, amount (cents→`$X.XX`), reason, a status badge, `openedAt` (locale). Show existing `evidence`/`evidenceFiles` when present. An evidence textarea (Input or textarea) + optional comma-separated filenames Input + "Submit evidence" Button → `submitDisputeEvidenceAction(dispute.id, { evidence, evidenceFiles: files ? files.split(',').map(s=>s.trim()).filter(Boolean) : undefined })` in `useTransition`; on success refetch disputes; on `{ok:false}` per-card error.
  - Import value consts from `@/lib/stripe/shapes`; import `IssuingCard`/`IssuingDispute` TYPES via `import type` from `@/lib/stripe/shapes`.

- [ ] **Step 4: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green.

- [ ] **Step 5: Commit**

```bash
git add app/admin/billing/page.tsx app/admin/billing/issuing/page.tsx components/cms/billing/IssuingManager.tsx
git commit -m "feat(billing): issuing page + manager + hub card (mobile-first)"
```

---

### Task 8: Offramp page + manager + hub card

**Files:** Create `app/admin/billing/offramp/page.tsx`, `components/cms/billing/OfframpManager.tsx`; Modify `app/admin/billing/page.tsx` (flip `offramp` to `ready:true`). No UI unit test.

**Interfaces:** Consumes `listSettlementsAction` (Task 5), `OfframpSettlement` (shapes), `isLive`.

- [ ] **Step 1: Flip the hub card** in `app/admin/billing/page.tsx`: change ONLY the `offramp` entry to `ready: true`.

- [ ] **Step 2: Create `app/admin/billing/offramp/page.tsx`** — mirror the subscriptions page; heading "Offramp" + short description ("Crypto→fiat settlements."); `<BillingBanner live={isLive()} />` then `<OfframpManager />`.

- [ ] **Step 3: Create `components/cms/billing/OfframpManager.tsx`** — `"use client"`, mobile-first, zinc, read-only (no mutations). Requirements:
  - On mount call `listSettlementsAction()`; top-level error banner on `{ok:false}`.
  - Stacked read-only cards: `userId`, `cryptoAsset` + `cryptoAmount` (cents→`$X.XX`), `fiatAmount` (cents→`$X.XX`), `feeAmount` (cents→`$X.XX`), a status badge, `at` (locale). A small total/count header is optional.
  - Import the `OfframpSettlement` TYPE via `import type` from `@/lib/stripe/shapes`.

- [ ] **Step 4: Type-check + full suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 errors; green.

- [ ] **Step 5: Commit**

```bash
git add app/admin/billing/page.tsx app/admin/billing/offramp/page.tsx components/cms/billing/OfframpManager.tsx
git commit -m "feat(billing): offramp page + manager + hub card (mobile-first)"
```

---

## Self-Review

**Spec coverage (D3 = Money-ops row of the spec's sub-plan table):**
- Treasury balances + transactions reads → Task 3 + Task 6 UI. ✅
- ACH money-movement **queue+confirm guardrail** (never auto-execute) → Task 2 (`money.ts`) + Task 5 actions + Task 6 `MoneyIntentQueue`. ✅
- Issuing cards + card controls + disputes + evidence (hybrid + seed overlays) → Task 1 (zod) + Task 4 (`issuing.ts`) + Task 5 actions + Task 7 UI. ✅
- Offramp read-only settlements → Task 3 (`offramp.ts`) + Task 5 + Task 8 UI. ✅
- `MoneyIntentQueue` shared component (D4 reuses for refunds) → Task 6. ✅
- `MANAGE_BILLING` gating + audit on success + 5 audit literals → Task 5. ✅
- Hub cards treasury/issuing/offramp flipped + demo banner on Stripe-backed pages → Tasks 6–8. ✅
- *Deferred (noted):* live execution of confirmed transfers (confirm throws `StripeNotWiredError` in live until the Stripe SDK is wired); live card-control/dispute mutations (same stub). Refunds (`REFUND` kind) are D4 — `money.ts` already filters by kind so D4 only adds `queueRefund`. All intentional.

**Placeholder scan:** Tasks 1–5 contain complete code. Tasks 6–8 are UI, spec'd to concrete requirements mirroring the existing managers. No TBD. ✅

**Type consistency:** zod inputs (Task 1) feed `money.ts`/`issuing.ts` (Tasks 2,4) and the actions (Task 5). `MoneyIntentRow` (Task 2) → actions (Task 5) → `MoneyIntentQueue`/`TreasuryManager` (Task 6). The read types (`TreasuryBalance`/`TreasuryTransaction`/`IssuingCard`/`IssuingDispute`/`OfframpSettlement`) come from D1 shapes and are consumed by Tasks 3,4,6,7,8. Audit literals (Task 5) match call sites. `confirmIntent`/`cancelIntent`/`setCardControl`/`submitDisputeEvidence` throw `BillingError`+`StripeNotWiredError`, both caught by the actions. Reads return `{ ...; live }`. ✅

## Notes for follow-up
- **D4 Customers:** reuse `lib/stripe/money.ts` — add `queueRefund(input, by)` (`kind:"REFUND"`, `reference`=chargeId/invoiceId) and call `listIntents("REFUND")`; reuse `MoneyIntentQueue` + `confirmIntentAction`/`cancelIntentAction` for the refund queue. Extend the source with customer reads.
- **Live wiring:** replace the `if (isLive()) throw StripeNotWiredError(...)` branches in `money.ts`/`issuing.ts` with real Stripe SDK calls behind the same boundary (no action/UI change). The confirm path is where real ACH/transfer execution lands.
