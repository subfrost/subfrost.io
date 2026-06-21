# F2-A — AML Foundation + KYC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the AML privilege foundation, a responsive admin shell, and a working KYC review-queue module in `subfrost.io/admin`, gated by a new `MANAGE_AML` privilege.

**Architecture:** Follows the F1 CMS pattern exactly — pure domain lib (`lib/kyc/admin.ts`) → privilege-gated server actions (`actions/cms/kyc.ts`) → server page (`app/admin/kyc/page.tsx`) → client manager (`components/cms/KycManager.tsx`). KYC intakes are sourced from an external provider later (Stripe Identity/Persona/Sumsub); for now the queue reads whatever rows exist in Postgres and dispositions are stored append-only. The fixed-width admin sidebar is refactored into a responsive drawer so every admin page is mobile-friendly (flex directive).

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma/Postgres, React 18 client components, Tailwind (zinc theme), `@/components/ui/*` primitives, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-f2-compliance-aml-stripe-design.md` (this is the first of four plans: A=AML foundation+KYC, B=FinCEN, C=MTL/OFAC, D=Stripe).

## Global Constraints

- **Branch:** `feat/compliance-aml-stripe`. **No PR, no push** (user policy) — commit locally only.
- **Prisma flow:** NO migration files. After editing `prisma/schema.prisma`, run `node_modules/.bin/prisma generate`. Production sync is `prisma db push` via io-sa, **always** preceded by `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` to confirm the change is **additive** (do NOT run db push as part of this plan — schema reaches prod in a separate, authorized step).
- **IDs:** `String @id @default(cuid())`. **Theme:** zinc (`bg-zinc-950/900`, `text-zinc-100/400`, borders `border-zinc-800`). **Mobile-first** for all new UI.
- **Test mocks:** mock `@/lib/prisma` (return `{ prisma: client, default: client }`), `@/lib/cms/authz` (`currentUser`), `@/lib/cms/audit` (`audit`), `next/cache` (`revalidatePath`). Tests live under `tests/<domain>/`.
- **Verify gate (every task that compiles/tests):** `node_modules/.bin/tsc --noEmit` → 0 errors; `CI=true node_modules/.bin/vitest run` → all green (new tests + the existing 240).
- **Auth pattern:** domain lib is pure (throws typed domain error); the action resolves `currentUser()`, checks `me.privileges.includes("MANAGE_AML")`, audits mutations, `revalidatePath`s; the page redirects unauthorized users.

---

### Task 1: New privileges (`MANAGE_AML`, `MANAGE_BILLING`)

**Files:**
- Modify: `prisma/schema.prisma` (enum `Privilege`, around line 230-241)
- Modify: `lib/cms/privileges.ts:14-39`

**Interfaces:**
- Produces: privilege literals `"MANAGE_AML"` and `"MANAGE_BILLING"` usable as `Privilege`; both included in `ALL_PRIVILEGES` (so ADMIN inherits them) and `PRIVILEGE_LABELS`.

- [ ] **Step 1: Add the two enum members to the Prisma schema**

In `prisma/schema.prisma`, inside `enum Privilege { … }`, after the `MANAGE_FUEL` line, add:

```prisma
  MANAGE_AML // compliance: KYC review, FinCEN/BSA filings, MTL, OFAC rescreen
  MANAGE_BILLING // compliance: Stripe treasury/issuing/offramp + applications tracker
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `node_modules/.bin/prisma generate`
Expected: "Generated Prisma Client" — the `Privilege` type now includes the two new members.

- [ ] **Step 3: Register the privileges in the CMS layer**

In `lib/cms/privileges.ts`, append to `ALL_PRIVILEGES` (after `"MANAGE_FUEL",`):

```ts
  "MANAGE_AML",
  "MANAGE_BILLING",
```

And add to `PRIVILEGE_LABELS` (after the `MANAGE_FUEL` entry):

```ts
  MANAGE_AML: "Manage AML / compliance",
  MANAGE_BILLING: "Manage billing (Stripe)",
```

(ADMIN already gets every privilege via `ROLE_PRIVILEGES.ADMIN = [...ALL_PRIVILEGES]`; no role-bundle edit needed. Non-admins receive `MANAGE_AML` as a per-user grant on `User.privileges`.)

- [ ] **Step 4: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors (the `PRIVILEGE_LABELS` record is now exhaustive over the widened `Privilege`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma lib/cms/privileges.ts
git commit -m "feat(compliance): add MANAGE_AML + MANAGE_BILLING privileges"
```

---

### Task 2: KYC Prisma models

**Files:**
- Modify: `prisma/schema.prisma` (append models + enums near the other compliance models)

**Interfaces:**
- Produces: Prisma models `KycIntake`, `KycDisposition`; enums `KycProvider`, `RiskScore`, `KycStatus`, `KycDecision`. Client accessors `prisma.kycIntake` and `prisma.kycDisposition`.

- [ ] **Step 1: Append the KYC schema block**

At the end of `prisma/schema.prisma`, add:

```prisma
// ============================================
// COMPLIANCE — KYC (F2-A)
// ============================================

enum KycProvider {
  PERSONA
  STRIPE_IDENTITY
  SUMSUB
}

enum RiskScore {
  LOW
  MEDIUM
  HIGH
}

enum KycStatus {
  PENDING
  IN_REVIEW
  APPROVED
  REJECTED
}

enum KycDecision {
  APPROVE
  REJECT
  REVIEW
}

model KycIntake {
  id            String           @id @default(cuid())
  externalId    String? // id at the provider, once a live source is wired
  customerEmail String
  customerName  String
  provider      KycProvider
  riskScore     RiskScore
  status        KycStatus        @default(PENDING)
  submittedAt   DateTime
  createdAt     DateTime         @default(now())
  dispositions  KycDisposition[]

  @@index([status])
}

model KycDisposition {
  id       String      @id @default(cuid())
  intakeId String
  intake   KycIntake   @relation(fields: [intakeId], references: [id], onDelete: Cascade)
  decision KycDecision
  notes    String?
  by       String // operator email
  at       DateTime    @default(now())

  @@index([intakeId])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `node_modules/.bin/prisma generate`
Expected: "Generated Prisma Client" with `kycIntake` / `kycDisposition` accessors.

- [ ] **Step 3: Confirm the diff is additive (no prod write)**

Run: `node_modules/.bin/prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀". (The prod `db push` happens later in an authorized step; this task only changes the local schema + generated client.)

- [ ] **Step 4: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(compliance): KYC intake + disposition models"
```

---

### Task 3: KYC domain lib (TDD)

**Files:**
- Create: `lib/kyc/admin.ts`
- Test: `tests/kyc/admin.test.ts`

**Interfaces:**
- Consumes: `prisma.kycIntake`, `prisma.kycDisposition`, `prisma.$transaction` from `@/lib/prisma`.
- Produces:
  - `class KycError extends Error`
  - `type KycDecision = "APPROVE" | "REJECT" | "REVIEW"`
  - `interface DispositionRow { id: string; decision: KycDecision; notes: string | null; by: string; at: string }`
  - `interface KycIntakeRow { id: string; externalId: string | null; customerEmail: string; customerName: string; provider: string; riskScore: string; status: string; submittedAt: string; latestDecision: KycDecision | null; dispositions: DispositionRow[] }`
  - `listIntakes(): Promise<KycIntakeRow[]>`
  - `recordDisposition(intakeId: string, decision: KycDecision, notes: string | null, by: string): Promise<{ customerName: string }>`

- [ ] **Step 1: Write the failing tests**

Create `tests/kyc/admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const kycIntake = { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() };
  const kycDisposition = { create: vi.fn() };
  const client = {
    kycIntake,
    kycDisposition,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma: client, default: client };
});

import { listIntakes, recordDisposition, KycError } from '@/lib/kyc/admin';
import { prisma } from '@/lib/prisma';

const ki = prisma.kycIntake as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const kd = prisma.kycDisposition as unknown as { create: ReturnType<typeof vi.fn> };
const tx = (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction;

beforeEach(() => vi.clearAllMocks());

describe('listIntakes', () => {
  it('maps rows and derives latestDecision from the newest disposition', async () => {
    ki.findMany.mockResolvedValueOnce([
      {
        id: 'k1',
        externalId: null,
        customerEmail: 'a@b.io',
        customerName: 'Ada',
        provider: 'PERSONA',
        riskScore: 'LOW',
        status: 'IN_REVIEW',
        submittedAt: new Date('2026-06-01T00:00:00Z'),
        dispositions: [
          { id: 'd1', decision: 'REVIEW', notes: 'pending docs', by: 'op@x.io', at: new Date('2026-06-02T00:00:00Z') },
        ],
      },
    ]);
    const res = await listIntakes();
    expect(ki.findMany).toHaveBeenCalledWith({
      orderBy: { submittedAt: 'desc' },
      include: { dispositions: { orderBy: { at: 'desc' } } },
    });
    expect(res[0]).toMatchObject({ id: 'k1', customerName: 'Ada', latestDecision: 'REVIEW' });
    expect(res[0].submittedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(res[0].dispositions[0].at).toBe('2026-06-02T00:00:00.000Z');
  });

  it('returns latestDecision null when there are no dispositions', async () => {
    ki.findMany.mockResolvedValueOnce([
      { id: 'k2', externalId: null, customerEmail: 'c@d.io', customerName: 'Cay', provider: 'SUMSUB', riskScore: 'HIGH', status: 'PENDING', submittedAt: new Date('2026-06-03T00:00:00Z'), dispositions: [] },
    ]);
    const res = await listIntakes();
    expect(res[0].latestDecision).toBeNull();
  });
});

describe('recordDisposition', () => {
  it('rejects an unknown decision', async () => {
    await expect(recordDisposition('k1', 'NOPE' as never, null, 'op@x.io')).rejects.toBeInstanceOf(KycError);
    expect(ki.findUnique).not.toHaveBeenCalled();
  });

  it('throws when the intake does not exist', async () => {
    ki.findUnique.mockResolvedValueOnce(null);
    await expect(recordDisposition('nope', 'APPROVE', null, 'op@x.io')).rejects.toBeInstanceOf(KycError);
  });

  it('appends a disposition and sets status by decision in one transaction', async () => {
    ki.findUnique.mockResolvedValueOnce({ id: 'k1', customerName: 'Ada' });
    kd.create.mockReturnValueOnce({});
    ki.update.mockReturnValueOnce({});
    const res = await recordDisposition('k1', 'APPROVE', ' looks good ', 'op@x.io');
    expect(tx).toHaveBeenCalledTimes(1);
    expect(kd.create).toHaveBeenCalledWith({
      data: { intakeId: 'k1', decision: 'APPROVE', notes: 'looks good', by: 'op@x.io' },
    });
    expect(ki.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { status: 'APPROVED' } });
    expect(res).toEqual({ customerName: 'Ada' });
  });

  it('maps REJECT→REJECTED and REVIEW→IN_REVIEW, nulling empty notes', async () => {
    ki.findUnique.mockResolvedValue({ id: 'k1', customerName: 'Ada' });
    await recordDisposition('k1', 'REJECT', '   ', 'op@x.io');
    expect(ki.update).toHaveBeenLastCalledWith({ where: { id: 'k1' }, data: { status: 'REJECTED' } });
    expect(kd.create).toHaveBeenLastCalledWith({ data: { intakeId: 'k1', decision: 'REJECT', notes: null, by: 'op@x.io' } });
    await recordDisposition('k1', 'REVIEW', null, 'op@x.io');
    expect(ki.update).toHaveBeenLastCalledWith({ where: { id: 'k1' }, data: { status: 'IN_REVIEW' } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/admin.test.ts`
Expected: FAIL — `Cannot find module '@/lib/kyc/admin'`.

- [ ] **Step 3: Write the domain lib**

Create `lib/kyc/admin.ts`:

```ts
/**
 * Admin-only KYC review operations. Reached only through `actions/cms/kyc.ts`,
 * which gates on `MANAGE_AML`. Intakes originate from an external provider
 * (Stripe Identity / Persona / Sumsub) once that source is wired; until then
 * the queue reads whatever rows exist. Dispositions are append-only so the
 * full review history is preserved for audit.
 */
import prisma from "@/lib/prisma"

export class KycError extends Error {}

export type KycDecision = "APPROVE" | "REJECT" | "REVIEW"

const STATUS_BY_DECISION: Record<KycDecision, "APPROVED" | "REJECTED" | "IN_REVIEW"> = {
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  REVIEW: "IN_REVIEW",
}

export interface DispositionRow {
  id: string
  decision: KycDecision
  notes: string | null
  by: string
  at: string
}

export interface KycIntakeRow {
  id: string
  externalId: string | null
  customerEmail: string
  customerName: string
  provider: string
  riskScore: string
  status: string
  submittedAt: string
  latestDecision: KycDecision | null
  dispositions: DispositionRow[]
}

export async function listIntakes(): Promise<KycIntakeRow[]> {
  const rows = await prisma.kycIntake.findMany({
    orderBy: { submittedAt: "desc" },
    include: { dispositions: { orderBy: { at: "desc" } } },
  })
  return rows.map((r) => {
    const dispositions: DispositionRow[] = r.dispositions.map((d) => ({
      id: d.id,
      decision: d.decision as KycDecision,
      notes: d.notes,
      by: d.by,
      at: d.at.toISOString(),
    }))
    return {
      id: r.id,
      externalId: r.externalId,
      customerEmail: r.customerEmail,
      customerName: r.customerName,
      provider: r.provider,
      riskScore: r.riskScore,
      status: r.status,
      submittedAt: r.submittedAt.toISOString(),
      latestDecision: dispositions[0]?.decision ?? null,
      dispositions,
    }
  })
}

export async function recordDisposition(
  intakeId: string,
  decision: KycDecision,
  notes: string | null,
  by: string,
): Promise<{ customerName: string }> {
  if (!STATUS_BY_DECISION[decision]) throw new KycError(`Invalid decision: ${decision}`)
  const intake = await prisma.kycIntake.findUnique({ where: { id: intakeId } })
  if (!intake) throw new KycError("Intake not found")
  const cleanNotes = notes?.trim() || null
  await prisma.$transaction([
    prisma.kycDisposition.create({ data: { intakeId, decision, notes: cleanNotes, by } }),
    prisma.kycIntake.update({ where: { id: intakeId }, data: { status: STATUS_BY_DECISION[decision] } }),
  ])
  return { customerName: intake.customerName }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/admin.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kyc/admin.ts tests/kyc/admin.test.ts
git commit -m "feat(compliance): KYC domain lib (listIntakes + recordDisposition)"
```

---

### Task 4: KYC server actions (TDD)

**Files:**
- Create: `actions/cms/kyc.ts`
- Modify: `lib/cms/audit.ts:7-27` (add `"kyc_disposition"` to `AuditAction`)
- Test: `tests/kyc/actions.test.ts`

**Interfaces:**
- Consumes: `listIntakes`, `recordDisposition`, `KycError`, `KycDecision`, `KycIntakeRow` from `@/lib/kyc/admin`; `currentUser` from `@/lib/cms/authz`; `audit` from `@/lib/cms/audit`; `revalidatePath` from `next/cache`.
- Produces:
  - `listIntakesAction(): Promise<{ ok: true; intakes: KycIntakeRow[] } | { ok: false; error: string }>`
  - `recordDispositionAction(intakeId: string, decision: KycDecision, notes: string | null): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Add the audit action literal**

In `lib/cms/audit.ts`, add to the `AuditAction` union (after `"delete_fuel"`):

```ts
  | "kyc_disposition"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/kyc/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/kyc/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/kyc/admin')>();
  return { ...actual, listIntakes: vi.fn(), recordDisposition: vi.fn() };
});

import { listIntakesAction, recordDispositionAction } from '@/actions/cms/kyc';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import * as kyc from '@/lib/kyc/admin';
import { KycError } from '@/lib/kyc/admin';

const asUser = (privileges: string[]) =>
  ({ id: 'u1', email: 'op@x.io', name: null, role: 'EDITOR', privileges }) as never;

beforeEach(() => vi.clearAllMocks());

describe('authorization', () => {
  it('rejects reads without MANAGE_AML', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_FUEL']));
    const res = await listIntakesAction();
    expect(res.ok).toBe(false);
    expect(kyc.listIntakes).not.toHaveBeenCalled();
  });

  it('rejects dispositions without MANAGE_AML', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]));
    const res = await recordDispositionAction('k1', 'APPROVE', null);
    expect(res.ok).toBe(false);
    expect(kyc.recordDisposition).not.toHaveBeenCalled();
  });
});

describe('recordDispositionAction', () => {
  beforeEach(() => vi.mocked(currentUser).mockResolvedValue(asUser(['MANAGE_AML'])));

  it('records, audits with the customer name and revalidates', async () => {
    vi.mocked(kyc.recordDisposition).mockResolvedValueOnce({ customerName: 'Ada' });
    const res = await recordDispositionAction('k1', 'APPROVE', 'ok');
    expect(res).toEqual({ ok: true });
    expect(kyc.recordDisposition).toHaveBeenCalledWith('k1', 'APPROVE', 'ok', 'op@x.io');
    expect(audit).toHaveBeenCalledWith('kyc_disposition', expect.objectContaining({ actorId: 'u1', target: 'Ada' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/kyc');
  });

  it('maps a KycError to an error envelope without auditing', async () => {
    vi.mocked(kyc.recordDisposition).mockRejectedValueOnce(new KycError('Intake not found'));
    const res = await recordDispositionAction('nope', 'APPROVE', null);
    expect(res).toEqual({ ok: false, error: 'Intake not found' });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('listIntakesAction', () => {
  it('returns the intakes for an authorized caller', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_AML']));
    vi.mocked(kyc.listIntakes).mockResolvedValueOnce([]);
    const res = await listIntakesAction();
    expect(res).toEqual({ ok: true, intakes: [] });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/actions.test.ts`
Expected: FAIL — `Cannot find module '@/actions/cms/kyc'`.

- [ ] **Step 4: Write the server actions**

Create `actions/cms/kyc.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import {
  KycError,
  listIntakes,
  recordDisposition,
  type KycDecision,
  type KycIntakeRow,
} from "@/lib/kyc/admin"

const REQUIRED: Privilege = "MANAGE_AML"

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

export async function listIntakesAction(): Promise<
  { ok: true; intakes: KycIntakeRow[] } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  return { ok: true, intakes: await listIntakes() }
}

export async function recordDispositionAction(
  intakeId: string,
  decision: KycDecision,
  notes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    const { customerName } = await recordDisposition(intakeId, decision, notes, a.me.email)
    await audit("kyc_disposition", { actorId: a.me.id, target: customerName, ip: await ip() })
    revalidatePath("/admin/kyc")
    return { ok: true }
  } catch (e) {
    if (e instanceof KycError) return { ok: false, error: e.message }
    throw e
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/actions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Full type-check + suite**

Run: `node_modules/.bin/tsc --noEmit && CI=true node_modules/.bin/vitest run`
Expected: 0 type errors; all tests green (the 240 existing + 11 new).

- [ ] **Step 7: Commit**

```bash
git add actions/cms/kyc.ts lib/cms/audit.ts tests/kyc/actions.test.ts
git commit -m "feat(compliance): KYC server actions gated by MANAGE_AML"
```

---

### Task 5: KYC page + manager component

**Files:**
- Create: `app/admin/kyc/page.tsx`
- Create: `components/cms/KycManager.tsx`

**Interfaces:**
- Consumes: `currentUser` from `@/lib/cms/authz`; `listIntakesAction`, `recordDispositionAction` from `@/actions/cms/kyc`; `KycIntakeRow`, `KycDecision` from `@/lib/kyc/admin`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`.
- Produces: route `/admin/kyc` (gated on `MANAGE_AML`).

- [ ] **Step 1: Create the page**

Create `app/admin/kyc/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { KycManager } from "@/components/cms/KycManager"

export const dynamic = "force-dynamic"

export default async function KycPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("MANAGE_AML")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">KYC review queue</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Customer identity intakes awaiting disposition. Decisions are recorded with your email and
        kept as an append-only history.
      </p>
      <KycManager />
    </div>
  )
}
```

- [ ] **Step 2: Create the manager component (mobile-first card list)**

Create `components/cms/KycManager.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listIntakesAction, recordDispositionAction } from "@/actions/cms/kyc"
import type { KycIntakeRow, KycDecision } from "@/lib/kyc/admin"

const RISK_CLS: Record<string, string> = {
  LOW: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  MEDIUM: "bg-amber-950/50 text-amber-300 border-amber-800/50",
  HIGH: "bg-red-950/50 text-red-300 border-red-800/50",
}
const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-300 border-zinc-700",
  IN_REVIEW: "bg-blue-950/50 text-blue-300 border-blue-800/50",
  APPROVED: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  REJECTED: "bg-red-950/50 text-red-300 border-red-800/50",
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function KycManager() {
  const [rows, setRows] = useState<KycIntakeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [notesById, setNotesById] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await listIntakesAction()
    if (res.ok) {
      setRows(res.intakes)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const disposition = (id: string, decision: KycDecision) =>
    startTransition(async () => {
      const res = await recordDispositionAction(id, decision, notesById[id]?.trim() || null)
      if (res.ok) {
        setNotesById((p) => ({ ...p, [id]: "" }))
        fetchRows()
      } else {
        setError(res.error)
      }
    })

  const visible = search
    ? rows.filter(
        (r) =>
          r.customerName.toLowerCase().includes(search.toLowerCase()) ||
          r.customerEmail.toLowerCase().includes(search.toLowerCase()),
      )
    : rows

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="max-w-md flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
        />
        <span className="text-xs text-zinc-500">{visible.length} intake(s)</span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">
          {search ? "No matching intakes." : "No intakes in the queue yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{r.customerName}</span>
                    <Badge label={r.riskScore} cls={RISK_CLS[r.riskScore] ?? STATUS_CLS.PENDING} />
                    <Badge label={r.status} cls={STATUS_CLS[r.status] ?? STATUS_CLS.PENDING} />
                  </div>
                  <div className="mt-1 truncate text-sm text-zinc-400">{r.customerEmail}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {r.provider} · submitted {new Date(r.submittedAt).toLocaleDateString()}
                    {r.dispositions.length > 0 && ` · ${r.dispositions.length} prior decision(s)`}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={notesById[r.id] ?? ""}
                  onChange={(e) => setNotesById((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="Disposition note (optional)…"
                  className="flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => disposition(r.id, "APPROVE")}>Approve</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => disposition(r.id, "REVIEW")}>Review</Button>
                  <Button size="sm" variant="ghost" disabled={pending} className="text-red-400 hover:text-red-300" onClick={() => disposition(r.id, "REJECT")}>Reject</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Visual smoke check**

The route is gated and needs a logged-in user with `MANAGE_AML` + a DB. Verify with the `run` skill (or `pnpm dev` + the webapp-testing skill): load `/admin/kyc`, confirm the page renders the empty-state card on a mobile viewport (~380px) without horizontal scroll, and the search box + heading are visible. (No automated UI test in this plan — KYC logic is covered by Tasks 3-4.)

- [ ] **Step 5: Commit**

```bash
git add app/admin/kyc/page.tsx components/cms/KycManager.tsx
git commit -m "feat(compliance): KYC review queue page + manager (mobile-first)"
```

---

### Task 6: Responsive admin shell + KYC nav

**Files:**
- Create: `components/cms/AdminShell.tsx`
- Modify: `app/admin/layout.tsx` (replace the inline sidebar with `AdminShell`)

**Interfaces:**
- Consumes: `currentUser` from `@/lib/cms/authz`; `logout` from `@/actions/cms/auth`.
- Produces: `AdminShell` client component — fixed sidebar on `md+`, hamburger-toggled drawer on mobile. Nav items gated by the passed-in privilege list. Adds the KYC item under `MANAGE_AML`.

- [ ] **Step 1: Create the responsive shell client component**

Create `components/cms/AdminShell.tsx`:

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { logout } from "@/actions/cms/auth"
import {
  FileText, Users, PlusCircle, LogOut, KeyRound, UserCircle, ScrollText, Ticket, Fuel, ShieldCheck, Menu, X,
} from "lucide-react"

export interface ShellUser {
  name: string | null
  email: string
  role: string
  privileges: string[]
}

export function AdminShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const can = (p: string) => user.privileges.includes(p)

  const nav = (
    <nav className="flex-1 space-y-1 text-sm" onClick={() => setOpen(false)}>
      <NavItem href="/admin" icon={<FileText size={16} />}>Articles</NavItem>
      <NavItem href="/admin/articles/new" icon={<PlusCircle size={16} />}>New article</NavItem>
      <NavItem href="/admin/profile" icon={<UserCircle size={16} />}>My profile</NavItem>
      {can("MANAGE_API_KEYS") && <NavItem href="/admin/api-keys" icon={<KeyRound size={16} />}>API keys</NavItem>}
      {can("MANAGE_USERS") && <NavItem href="/admin/users" icon={<Users size={16} />}>Users</NavItem>}
      {can("MANAGE_REFERRAL_CODES") && <NavItem href="/admin/codes" icon={<Ticket size={16} />}>Referral codes</NavItem>}
      {can("MANAGE_FUEL") && <NavItem href="/admin/fuel" icon={<Fuel size={16} />}>FUEL</NavItem>}
      {can("MANAGE_AML") && <NavItem href="/admin/kyc" icon={<ShieldCheck size={16} />}>KYC review</NavItem>}
      {can("VIEW_AUDIT") && <NavItem href="/admin/audit" icon={<ScrollText size={16} />}>Audit log</NavItem>}
    </nav>
  )

  const footer = (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <div className="px-2 text-sm text-zinc-300">{user.name ?? user.email}</div>
      <div className="px-2 text-xs uppercase tracking-wide text-zinc-500">{user.role}</div>
      <form action={logout} className="mt-3">
        <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
          <LogOut size={16} /> Sign out
        </button>
      </form>
      <a href="/articles" className="mt-1 block px-2 text-xs text-zinc-600 hover:text-zinc-400">View articles ↗</a>
    </div>
  )

  const brand = (
    <div className="px-2">
      <div className="text-lg font-bold text-white">SUBFROST</div>
      <div className="text-xs uppercase tracking-widest text-zinc-500">Editorial</div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4 md:flex">
        <div className="mb-6">{brand}</div>
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Close menu"><X size={18} /></button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 md:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white" aria-label="Open menu"><Menu size={20} /></button>
          <span className="font-bold text-white">SUBFROST</span>
        </header>
        <main className="flex-1 overflow-y-auto p-5 md:p-8">{children}</main>
      </div>
    </div>
  )
}

function NavItem({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md px-2 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
      {icon}
      {children}
    </Link>
  )
}
```

- [ ] **Step 2: Replace the layout body with the shell**

Replace the entire contents of `app/admin/layout.tsx` with:

```tsx
import { currentUser } from "@/lib/cms/authz"
import { AdminShell } from "@/components/cms/AdminShell"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  // Middleware gates /admin/* (login exempt); reaching here without a user means
  // the login page, which renders bare on a dark background.
  if (!user) return <div className="min-h-screen bg-zinc-950">{children}</div>

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, role: user.role, privileges: user.privileges }}
    >
      {children}
    </AdminShell>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Visual check (desktop + mobile)**

With a logged-in admin, load `/admin` via the `run`/webapp-testing skill:
- Desktop (≥768px): the sidebar shows as before, now including "KYC review" for an AML-privileged user.
- Mobile (~380px): the sidebar is hidden; a top bar with a hamburger appears; tapping it opens the drawer; tapping a link or the backdrop closes it. No horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add components/cms/AdminShell.tsx app/admin/layout.tsx
git commit -m "feat(admin): responsive admin shell (mobile drawer) + KYC nav"
```

---

## Self-Review

**Spec coverage (this plan = spec sequence items 0 + 1):**
- Privileges `MANAGE_AML` / `MANAGE_BILLING` → Task 1. ✅
- Responsive admin shell (sidebar → drawer) → Task 6. ✅
- KYC models (intake + append-only disposition) → Task 2. ✅
- KYC domain + actions gated by `MANAGE_AML` → Tasks 3-4. ✅
- KYC page + mobile-first manager → Task 5. ✅
- *Deferred to follow-up (noted, out of this plan):* retrofit of F1 `CodesManager`/`FuelManager` responsiveness (visual-only, touches F1 components — separable; a reviewer could approve KYC while rejecting that restyle). FinCEN/MTL/Stripe → Plans B/C/D.

**Placeholder scan:** No TBD/TODO; every code step has complete code; UI tasks state explicit visual-verification steps (KYC logic is unit-covered in Tasks 3-4). ✅

**Type consistency:** `KycDecision` ("APPROVE"|"REJECT"|"REVIEW") is identical across `lib/kyc/admin.ts`, `actions/cms/kyc.ts`, and `KycManager.tsx`. Action shapes: `listIntakesAction → {ok,intakes}`, `recordDispositionAction(intakeId, decision, notes)` match the component call sites. `audit("kyc_disposition", …)` matches the union member added in Task 4. Status mapping APPROVE→APPROVED / REJECT→REJECTED / REVIEW→IN_REVIEW is consistent between the domain lib and its test. ✅

## Notes for follow-up plans

- **Live KYC source:** when a provider is wired (Stripe Identity in Plan D, or Persona/Sumsub), add an ingest path that upserts `KycIntake` by `externalId`. Until then the queue is fed by a seed/admin script (out of scope here).
- **F1 mobile retrofit:** `CodesManager`/`FuelManager` are desktop-first tables; restyle to stacked cards on narrow viewports in a dedicated small plan.
