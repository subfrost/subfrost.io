# SP-2 Stripe Identity → KYC Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Stripe Identity verification sessions into the existing admin KYC review queue (manual button now; webhook is SP-4), so operators see real verifications and disposition them.

**Architecture:** A server-only live reader under `lib/stripe/source/live/identity.ts` pulls VerificationSessions + their reports (verdict + extracted fields, no images) and returns a normalized shape. A pure mapper (`lib/kyc/identity-map.ts`) turns each into KycIntake fields (status always PENDING, riskScore derived from the verdict). `lib/kyc/sync.ts` upserts by `externalId` (idempotent, preserving human dispositions). An action (`actions/cms/kyc.ts`, gated MANAGE_AML) drives a "Sync from Stripe Identity" button in `KycManager`, which also gains an expandable detail panel rendered from the stored `providerData`.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Prisma/Postgres, `stripe` SDK v22 (apiVersion `2026-05-27.dahlia`), Vitest (happy-dom), Tailwind (zinc theme).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-21-sp2-stripe-identity-design.md` — every task implicitly includes its requirements.
- **No webhooks** (SP-4). Manual button only.
- **No document/selfie images** — pull verdict + extracted fields only, never `files`.
- **Human-in-the-loop:** sync never writes APPROVED/REJECTED/IN_REVIEW; all synced intakes enter `PENDING`. Those three statuses are set only by human `KycDisposition`.
- **Boundary:** `config.ts` stays client-safe (SDK-free); the Stripe SDK is only reached via `getStripeClient()` (server-only). Live reads use `degradeIfUnavailable` so a disabled Identity product degrades to `[]`, never a 500.
- **Idempotency:** upsert by `KycIntake.externalId` (Stripe session id); a re-sync must not duplicate rows nor overwrite a row that already has a human disposition.
- **Gating:** all entry via `actions/cms/kyc.ts`, privilege `MANAGE_AML`.
- **Package manager:** pnpm. NEVER `git add` `.npmrc` (untracked). Tests run `CI=true node_modules/.bin/vitest run`.
- **Verify gates:** `node_modules/.bin/tsc --noEmit` = 0; `CI=true node_modules/.bin/vitest run` green; `node_modules/.bin/next build` exit 0.
- **Prisma changes are additive** → `db push` to prod happens in the final task via io-sa after `migrate diff` proves additive (no local DB; tests mock prisma).

---

## File Structure

- `lib/stripe/shapes.ts` (modify) — add `IdentityVerdict`, `IdentityProviderData`, `StripeIdentityVerification`.
- `lib/kyc/identity-map.ts` (create) — pure mapper verification → intake fields.
- `prisma/schema.prisma` (modify) — `KycIntake.externalId @unique`, `providerData Json?`.
- `lib/stripe/source/live/identity.ts` (create) — live Stripe Identity reader.
- `lib/kyc/sync.ts` (create) — `syncStripeIdentity()` (gating + degrade + upsert).
- `actions/cms/kyc.ts` (modify) — `syncStripeIdentityAction()`.
- `lib/kyc/admin.ts` (modify) — `listIntakes()` returns `providerData`.
- `components/cms/KycManager.tsx` (modify) — sync button + expandable detail.
- Tests: `tests/kyc/identity-map.test.ts`, `tests/stripe/live-identity.test.ts`, `tests/kyc/sync.test.ts`, `tests/kyc/actions.test.ts` (extend).

---

### Task 1: Shapes + pure mapper

**Files:**
- Modify: `lib/stripe/shapes.ts`
- Create: `lib/kyc/identity-map.ts`
- Test: `tests/kyc/identity-map.test.ts`

**Interfaces:**
- Produces:
  - `StripeIdentityVerification` = `{ id: string; verdict: IdentityVerdict; lastError: {code:string;reason:string}|null; document: {type:string|null;country:string|null}; extracted: {firstName:string|null;lastName:string|null;dob:string|null}; email: string; createdAt: string }`
  - `IdentityVerdict` = `"verified"|"processing"|"requires_input"|"canceled"`
  - `IdentityProviderData` = `{ verdict: IdentityVerdict; lastError: {code:string;reason:string}|null; document: {type:string|null;country:string|null}; extracted: {firstName:string|null;lastName:string|null;dob:string|null} }`
  - `mapIdentityVerification(v: StripeIdentityVerification): MappedIdentityIntake` where `MappedIdentityIntake = { externalId: string; customerName: string; customerEmail: string; provider: "STRIPE_IDENTITY"; submittedAt: Date; status: "PENDING"; riskScore: "LOW"|"MEDIUM"|"HIGH"; providerData: IdentityProviderData }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/kyc/identity-map.test.ts
import { describe, it, expect } from "vitest"
import { mapIdentityVerification } from "@/lib/kyc/identity-map"
import type { StripeIdentityVerification } from "@/lib/stripe/shapes"

const base: StripeIdentityVerification = {
  id: "vs_1",
  verdict: "verified",
  lastError: null,
  document: { type: "passport", country: "US" },
  extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
  email: "ada@x.io",
  createdAt: "2026-06-21T00:00:00.000Z",
}

describe("mapIdentityVerification", () => {
  it("maps verified -> PENDING/LOW and keeps the verdict in providerData", () => {
    const m = mapIdentityVerification(base)
    expect(m).toMatchObject({
      externalId: "vs_1",
      customerName: "Ada Lovelace",
      customerEmail: "ada@x.io",
      provider: "STRIPE_IDENTITY",
      status: "PENDING",
      riskScore: "LOW",
    })
    expect(m.submittedAt.toISOString()).toBe("2026-06-21T00:00:00.000Z")
    expect(m.providerData.verdict).toBe("verified")
  })

  it("derives riskScore from the verdict", () => {
    expect(mapIdentityVerification({ ...base, verdict: "processing" }).riskScore).toBe("MEDIUM")
    expect(mapIdentityVerification({ ...base, verdict: "canceled" }).riskScore).toBe("MEDIUM")
    expect(
      mapIdentityVerification({ ...base, verdict: "requires_input", lastError: { code: "document_unverified", reason: "blurry" } }).riskScore,
    ).toBe("HIGH")
  })

  it("falls back to (unknown)/empty when name/email are missing", () => {
    const m = mapIdentityVerification({
      ...base,
      extracted: { firstName: null, lastName: null, dob: null },
      email: "",
    })
    expect(m.customerName).toBe("(unknown)")
    expect(m.customerEmail).toBe("")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/identity-map.test.ts`
Expected: FAIL — cannot find module `@/lib/kyc/identity-map`.

- [ ] **Step 3: Add the shapes**

Append to `lib/stripe/shapes.ts`:

```ts
// --- Stripe Identity (SP-2: KYC source) ---
export const IDENTITY_VERDICTS = ["verified", "processing", "requires_input", "canceled"] as const
export type IdentityVerdict = (typeof IDENTITY_VERDICTS)[number]

export type IdentityProviderData = {
  verdict: IdentityVerdict
  lastError: { code: string; reason: string } | null
  document: { type: string | null; country: string | null }
  extracted: { firstName: string | null; lastName: string | null; dob: string | null }
}

export type StripeIdentityVerification = {
  id: string
  verdict: IdentityVerdict
  lastError: { code: string; reason: string } | null
  document: { type: string | null; country: string | null }
  extracted: { firstName: string | null; lastName: string | null; dob: string | null }
  email: string
  createdAt: string // ISO
}
```

- [ ] **Step 4: Write the mapper**

Create `lib/kyc/identity-map.ts`:

```ts
import type { IdentityVerdict, StripeIdentityVerification, IdentityProviderData } from "@/lib/stripe/shapes"

export interface MappedIdentityIntake {
  externalId: string
  customerName: string
  customerEmail: string
  provider: "STRIPE_IDENTITY"
  submittedAt: Date
  status: "PENDING"
  riskScore: "LOW" | "MEDIUM" | "HIGH"
  providerData: IdentityProviderData
}

// Stripe Identity gives no numeric risk score — derive a triage signal from the verdict.
const RISK: Record<IdentityVerdict, "LOW" | "MEDIUM" | "HIGH"> = {
  verified: "LOW",
  processing: "MEDIUM",
  requires_input: "HIGH",
  canceled: "MEDIUM",
}

export function mapIdentityVerification(v: StripeIdentityVerification): MappedIdentityIntake {
  const name = [v.extracted.firstName, v.extracted.lastName].filter(Boolean).join(" ").trim()
  return {
    externalId: v.id,
    customerName: name || "(unknown)",
    customerEmail: v.email || "",
    provider: "STRIPE_IDENTITY",
    submittedAt: new Date(v.createdAt),
    status: "PENDING", // human-in-the-loop: every synced intake awaits a human disposition
    riskScore: RISK[v.verdict],
    providerData: {
      verdict: v.verdict,
      lastError: v.lastError,
      document: v.document,
      extracted: v.extracted,
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/identity-map.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit` (expected exit 0)

```bash
git add lib/stripe/shapes.ts lib/kyc/identity-map.ts tests/kyc/identity-map.test.ts
git commit -m "feat(sp2): identity shapes + verdict->intake mapper"
```

---

### Task 2: Prisma schema (additive)

**Files:**
- Modify: `prisma/schema.prisma` (model `KycIntake`)

**Interfaces:**
- Produces: `KycIntake.externalId` becomes unique (enables `findUnique`/upsert by it); `KycIntake.providerData: Json?` available on the generated client.

- [ ] **Step 1: Edit the model**

In `prisma/schema.prisma`, model `KycIntake`, change the `externalId` line and add `providerData`:

```prisma
model KycIntake {
  id            String           @id @default(cuid())
  externalId    String?          @unique // id at the provider (Stripe vs_...); unique for idempotent sync
  customerEmail String
  customerName  String
  provider      KycProvider
  riskScore     RiskScore
  status        KycStatus        @default(PENDING)
  submittedAt   DateTime
  providerData  Json? // synced provider summary (verdict, lastError, document, extracted) — SP-2
  createdAt     DateTime         @default(now())
  dispositions  KycDisposition[]

  @@index([status])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `node_modules/.bin/prisma generate`
Expected: "Generated Prisma Client" (no schema errors).

- [ ] **Step 3: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit` (expected exit 0)

```bash
git add prisma/schema.prisma
git commit -m "feat(sp2): KycIntake.externalId unique + providerData json (additive)"
```

---

### Task 3: Live Stripe Identity reader

**Files:**
- Create: `lib/stripe/source/live/identity.ts`
- Test: `tests/stripe/live-identity.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()` from `@/lib/stripe/client`; `StripeIdentityVerification`, `IdentityVerdict` from `@/lib/stripe/shapes`.
- Produces: `liveIdentityVerifications(): Promise<StripeIdentityVerification[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/stripe/live-identity.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const list = vi.fn()
vi.mock("@/lib/stripe/client", () => ({ getStripeClient: () => ({ identity: { verificationSessions: { list } } }) }))

import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"

beforeEach(() => vi.clearAllMocks())

describe("liveIdentityVerifications", () => {
  it("normalizes a verified session into our shape", async () => {
    list.mockResolvedValueOnce({
      has_more: false,
      data: [
        {
          id: "vs_1",
          status: "verified",
          created: 1781913600, // 2026-06-20T00:00:00Z
          last_error: null,
          metadata: { email: "ada@x.io" },
          verified_outputs: { first_name: "Ada", last_name: "Lovelace", dob: { year: 1815, month: 12, day: 10 } },
          last_verification_report: { document: { type: "passport", issuing_country: "US" } },
        },
      ],
    })
    const out = await liveIdentityVerifications()
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: "vs_1",
      verdict: "verified",
      email: "ada@x.io",
      document: { type: "passport", country: "US" },
      extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
    })
  })

  it("reads failure reason + document from the report when not verified", async () => {
    list.mockResolvedValueOnce({
      has_more: false,
      data: [
        {
          id: "vs_2",
          status: "requires_input",
          created: 1781913600,
          last_error: { code: "document_unverified", reason: "blurry" },
          metadata: {},
          verified_outputs: null,
          last_verification_report: {
            document: { type: "driving_license", issuing_country: "GB", first_name: "Grace", last_name: "Hopper", dob: { year: 1906, month: 12, day: 9 } },
          },
        },
      ],
    })
    const out = await liveIdentityVerifications()
    expect(out[0]).toMatchObject({
      id: "vs_2",
      verdict: "requires_input",
      lastError: { code: "document_unverified", reason: "blurry" },
      document: { type: "driving_license", country: "GB" },
      extracted: { firstName: "Grace", lastName: "Hopper", dob: "1906-12-09" },
      email: "",
    })
  })

  it("paginates via has_more/starting_after", async () => {
    list
      .mockResolvedValueOnce({ has_more: true, data: [{ id: "vs_a", status: "processing", created: 1, last_error: null, metadata: {}, verified_outputs: null, last_verification_report: null }] })
      .mockResolvedValueOnce({ has_more: false, data: [{ id: "vs_b", status: "canceled", created: 2, last_error: null, metadata: {}, verified_outputs: null, last_verification_report: null }] })
    const out = await liveIdentityVerifications()
    expect(out.map((v) => v.id)).toEqual(["vs_a", "vs_b"])
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[1][0]).toMatchObject({ starting_after: "vs_a" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/stripe/live-identity.test.ts`
Expected: FAIL — cannot find module `@/lib/stripe/source/live/identity`.

- [ ] **Step 3: Implement the reader**

Create `lib/stripe/source/live/identity.ts`:

```ts
import { getStripeClient } from "@/lib/stripe/client"
import type { StripeIdentityVerification, IdentityVerdict } from "@/lib/stripe/shapes"

const VERDICTS: IdentityVerdict[] = ["verified", "processing", "requires_input", "canceled"]
const verdictOf = (s: string): IdentityVerdict => (VERDICTS.includes(s as IdentityVerdict) ? (s as IdentityVerdict) : "processing")

const iso = (sec: number | null | undefined) => new Date((sec ?? 0) * 1000).toISOString()
const dob = (d: { year?: number; month?: number; day?: number } | null | undefined): string | null =>
  d?.year && d?.month && d?.day
    ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
    : null

/** Lists Stripe Identity verification sessions + their report summary. No file/image
 *  data is read. Server-only (uses getStripeClient). */
export async function liveIdentityVerifications(): Promise<StripeIdentityVerification[]> {
  const stripe = getStripeClient()
  const out: StripeIdentityVerification[] = []
  let startingAfter: string | undefined
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page: any = await (stripe as any).identity.verificationSessions.list({
      limit: 100,
      expand: ["data.last_verification_report"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const vs of page.data as any[]) {
      const vo = vs.verified_outputs ?? null
      const docReport = vs.last_verification_report?.document ?? null
      out.push({
        id: vs.id,
        verdict: verdictOf(vs.status),
        lastError: vs.last_error ? { code: vs.last_error.code ?? "", reason: vs.last_error.reason ?? "" } : null,
        document: { type: docReport?.type ?? null, country: docReport?.issuing_country ?? null },
        extracted: {
          firstName: vo?.first_name ?? docReport?.first_name ?? null,
          lastName: vo?.last_name ?? docReport?.last_name ?? null,
          dob: dob(vo?.dob ?? docReport?.dob),
        },
        email: vs.metadata?.email ?? vo?.email ?? "",
        createdAt: iso(vs.created),
      })
    }
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/stripe/live-identity.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit` (expected exit 0)

```bash
git add lib/stripe/source/live/identity.ts tests/stripe/live-identity.test.ts
git commit -m "feat(sp2): live Stripe Identity reader (sessions+report, no images)"
```

---

### Task 4: Sync domain (gating + degrade + upsert)

**Files:**
- Create: `lib/kyc/sync.ts`
- Test: `tests/kyc/sync.test.ts`

**Interfaces:**
- Consumes: `isLive` from `@/lib/stripe/config`; `degradeIfUnavailable` from `@/lib/stripe/source/live/degrade`; `liveIdentityVerifications` from `@/lib/stripe/source/live/identity`; `mapIdentityVerification` from `@/lib/kyc/identity-map`; `prisma` from `@/lib/prisma`.
- Produces: `syncStripeIdentity(): Promise<{ created: number; updated: number; skipped: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/kyc/sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/config", () => ({ isLive: vi.fn(() => true) }))
vi.mock("@/lib/stripe/source/live/identity", () => ({ liveIdentityVerifications: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: { kycIntake: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}))

import { syncStripeIdentity } from "@/lib/kyc/sync"
import { isLive } from "@/lib/stripe/config"
import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"
import prisma from "@/lib/prisma"
import type { StripeIdentityVerification } from "@/lib/stripe/shapes"

const v = (id: string, verdict: StripeIdentityVerification["verdict"] = "verified"): StripeIdentityVerification => ({
  id, verdict, lastError: null,
  document: { type: "passport", country: "US" },
  extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
  email: "ada@x.io", createdAt: "2026-06-21T00:00:00.000Z",
})

beforeEach(() => vi.clearAllMocks())

describe("syncStripeIdentity", () => {
  it("creates a new intake for an unseen session", async () => {
    vi.mocked(liveIdentityVerifications).mockResolvedValueOnce([v("vs_1")])
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce(null as never)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 1, updated: 0, skipped: 0 })
    expect(prisma.kycIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ externalId: "vs_1", status: "PENDING", riskScore: "LOW" }) }),
    )
  })

  it("preserves status/riskScore when the row already has a human disposition", async () => {
    vi.mocked(liveIdentityVerifications).mockResolvedValueOnce([v("vs_1", "requires_input")])
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [{ id: "d1" }] } as never)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 1, skipped: 0 })
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).not.toHaveProperty("status")
    expect(arg.data).not.toHaveProperty("riskScore")
    expect(arg.data).toHaveProperty("providerData")
  })

  it("refreshes status/riskScore when the row has no disposition yet", async () => {
    vi.mocked(liveIdentityVerifications).mockResolvedValueOnce([v("vs_1", "requires_input")])
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [] } as never)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 1, skipped: 0 })
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).toMatchObject({ status: "PENDING", riskScore: "HIGH" })
  })

  it("degrades to zeros when Stripe Identity is unavailable", async () => {
    vi.mocked(liveIdentityVerifications).mockRejectedValueOnce(new Error("not enabled"))
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 0, skipped: 0 })
    expect(prisma.kycIntake.create).not.toHaveBeenCalled()
  })

  it("returns zeros without calling Stripe when not live", async () => {
    vi.mocked(isLive).mockReturnValueOnce(false)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 0, skipped: 0 })
    expect(liveIdentityVerifications).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/sync.test.ts`
Expected: FAIL — cannot find module `@/lib/kyc/sync`.

- [ ] **Step 3: Implement the sync**

Create `lib/kyc/sync.ts`:

```ts
import prisma from "@/lib/prisma"
import { isLive } from "@/lib/stripe/config"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"
import { mapIdentityVerification } from "@/lib/kyc/identity-map"
import type { Prisma } from "@prisma/client"

export interface SyncResult {
  created: number
  updated: number
  skipped: number
}

/** Pulls Stripe Identity verifications and upserts them as KycIntake rows
 *  (idempotent by externalId). Never overwrites a row that already carries a human
 *  disposition. Degrades to zeros if Identity is unavailable or the key is unset. */
export async function syncStripeIdentity(): Promise<SyncResult> {
  if (!isLive()) return { created: 0, updated: 0, skipped: 0 }
  const verifications = await degradeIfUnavailable(liveIdentityVerifications, [])

  let created = 0
  let updated = 0
  const skipped = 0
  for (const v of verifications) {
    const m = mapIdentityVerification(v)
    const existing = await prisma.kycIntake.findUnique({
      where: { externalId: m.externalId },
      include: { dispositions: { take: 1 } },
    })
    const providerData = m.providerData as unknown as Prisma.InputJsonValue
    if (!existing) {
      await prisma.kycIntake.create({
        data: {
          externalId: m.externalId,
          customerEmail: m.customerEmail,
          customerName: m.customerName,
          provider: m.provider,
          riskScore: m.riskScore,
          status: m.status,
          submittedAt: m.submittedAt,
          providerData,
        },
      })
      created++
    } else if (existing.dispositions.length > 0) {
      // Human already decided — only refresh the synced summary, never the decision.
      await prisma.kycIntake.update({
        where: { id: existing.id },
        data: { providerData, customerName: m.customerName, customerEmail: m.customerEmail },
      })
      updated++
    } else {
      await prisma.kycIntake.update({
        where: { id: existing.id },
        data: {
          providerData,
          customerName: m.customerName,
          customerEmail: m.customerEmail,
          status: m.status,
          riskScore: m.riskScore,
        },
      })
      updated++
    }
  }
  return { created, updated, skipped }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/sync.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit` (expected exit 0)

```bash
git add lib/kyc/sync.ts tests/kyc/sync.test.ts
git commit -m "feat(sp2): syncStripeIdentity upsert (idempotent, preserves dispositions)"
```

---

### Task 5: Server action

**Files:**
- Modify: `actions/cms/kyc.ts`
- Test: `tests/kyc/actions.test.ts` (extend)

**Interfaces:**
- Consumes: `syncStripeIdentity` from `@/lib/kyc/sync`; existing `actor()`, `audit`, `ip()`, `revalidatePath` already in the file.
- Produces: `syncStripeIdentityAction(): Promise<{ ok: true; created: number; updated: number; skipped: number } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test (extend the existing file)**

Add to `tests/kyc/actions.test.ts`: extend the `vi.mock("@/lib/kyc/admin", ...)` is unaffected; add a mock for the sync module near the other mocks at the top:

```ts
vi.mock("@/lib/kyc/sync", () => ({ syncStripeIdentity: vi.fn() }))
```

And add these imports with the others:

```ts
import { syncStripeIdentityAction } from "@/actions/cms/kyc"
import { syncStripeIdentity } from "@/lib/kyc/sync"
```

Then add a new describe block:

```ts
describe("syncStripeIdentityAction", () => {
  it("rejects without MANAGE_AML", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["MANAGE_FUEL"]))
    const res = await syncStripeIdentityAction()
    expect(res.ok).toBe(false)
    expect(syncStripeIdentity).not.toHaveBeenCalled()
  })

  it("syncs, audits and returns counts for an authorized operator", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["MANAGE_AML"]))
    vi.mocked(syncStripeIdentity).mockResolvedValueOnce({ created: 2, updated: 1, skipped: 0 })
    const res = await syncStripeIdentityAction()
    expect(res).toEqual({ ok: true, created: 2, updated: 1, skipped: 0 })
    expect(audit).toHaveBeenCalledWith("kyc_identity_sync", expect.objectContaining({ target: "2 new, 1 updated" }))
    expect(revalidatePath).toHaveBeenCalledWith("/admin/kyc")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/actions.test.ts`
Expected: FAIL — `syncStripeIdentityAction` is not exported.

- [ ] **Step 3: Implement the action**

In `actions/cms/kyc.ts`, add the import (with the other `@/lib/kyc/...` import) and the action. Add to the imports:

```ts
import { syncStripeIdentity } from "@/lib/kyc/sync"
```

Append this action:

```ts
export async function syncStripeIdentityAction(): Promise<
  { ok: true; created: number; updated: number; skipped: number } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { created, updated, skipped } = await syncStripeIdentity()
  await audit("kyc_identity_sync", { actorId: a.me.id, target: `${created} new, ${updated} updated`, ip: await ip() })
  revalidatePath("/admin/kyc")
  return { ok: true, created, updated, skipped }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/actions.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit` (expected exit 0)

```bash
git add actions/cms/kyc.ts tests/kyc/actions.test.ts
git commit -m "feat(sp2): syncStripeIdentityAction (gated MANAGE_AML, audited)"
```

---

### Task 6: Expose providerData on the queue read

**Files:**
- Modify: `lib/kyc/admin.ts`
- Test: `tests/kyc/admin.test.ts` (create if absent, else extend)

**Interfaces:**
- Consumes: `IdentityProviderData` from `@/lib/stripe/shapes`.
- Produces: `KycIntakeRow.providerData: IdentityProviderData | null` (populated from the DB row).

- [ ] **Step 1: Write the failing test**

```ts
// tests/kyc/admin.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({ default: { kycIntake: { findMany: vi.fn() } } }))

import { listIntakes } from "@/lib/kyc/admin"
import prisma from "@/lib/prisma"

beforeEach(() => vi.clearAllMocks())

describe("listIntakes", () => {
  it("surfaces providerData on each row", async () => {
    vi.mocked(prisma.kycIntake.findMany as any).mockResolvedValueOnce([
      {
        id: "k1", externalId: "vs_1", customerEmail: "ada@x.io", customerName: "Ada",
        provider: "STRIPE_IDENTITY", riskScore: "LOW", status: "PENDING",
        submittedAt: new Date("2026-06-21T00:00:00Z"),
        providerData: { verdict: "verified", lastError: null, document: { type: "passport", country: "US" }, extracted: { firstName: "Ada", lastName: null, dob: null } },
        dispositions: [],
      },
    ])
    const rows = await listIntakes()
    expect(rows[0].providerData).toMatchObject({ verdict: "verified" })
  })

  it("returns null providerData for legacy rows", async () => {
    vi.mocked(prisma.kycIntake.findMany as any).mockResolvedValueOnce([
      {
        id: "k2", externalId: null, customerEmail: "x", customerName: "x",
        provider: "PERSONA", riskScore: "LOW", status: "PENDING",
        submittedAt: new Date(), providerData: null, dispositions: [],
      },
    ])
    const rows = await listIntakes()
    expect(rows[0].providerData).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/admin.test.ts`
Expected: FAIL — `providerData` is undefined on the row.

- [ ] **Step 3: Implement**

In `lib/kyc/admin.ts`: add the import and extend `KycIntakeRow` + the `listIntakes` map.

Add import:

```ts
import type { IdentityProviderData } from "@/lib/stripe/shapes"
```

Add to `KycIntakeRow`:

```ts
  providerData: IdentityProviderData | null
```

In the `listIntakes` row map (the returned object), add:

```ts
      providerData: (r.providerData as IdentityProviderData | null) ?? null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/kyc/admin.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit` (expected exit 0)

```bash
git add lib/kyc/admin.ts tests/kyc/admin.test.ts
git commit -m "feat(sp2): surface providerData on KycIntakeRow"
```

---

### Task 7: KycManager — sync button + detail panel

**Files:**
- Modify: `components/cms/KycManager.tsx`
- Test: `tests/cms/kyc-manager.test.tsx`

**Interfaces:**
- Consumes: `syncStripeIdentityAction` from `@/actions/cms/kyc`; `KycIntakeRow.providerData` from `@/lib/kyc/admin`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/cms/kyc-manager.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

vi.mock("@/actions/cms/kyc", () => ({
  listIntakesAction: vi.fn(),
  recordDispositionAction: vi.fn(),
  rescreenOfacAction: vi.fn(),
  syncStripeIdentityAction: vi.fn(),
}))

import { KycManager } from "@/components/cms/KycManager"
import { listIntakesAction, syncStripeIdentityAction } from "@/actions/cms/kyc"

const row = {
  id: "k1", externalId: "vs_1", customerEmail: "ada@x.io", customerName: "Ada Lovelace",
  provider: "STRIPE_IDENTITY", riskScore: "LOW", status: "PENDING",
  submittedAt: "2026-06-21T00:00:00.000Z", latestDecision: null, dispositions: [],
  providerData: { verdict: "verified", lastError: null, document: { type: "passport", country: "US" }, extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" } },
}

beforeEach(() => vi.clearAllMocks())

describe("KycManager", () => {
  it("shows a Sync from Stripe Identity button and runs the sync", async () => {
    vi.mocked(listIntakesAction).mockResolvedValue({ ok: true, intakes: [row] } as never)
    vi.mocked(syncStripeIdentityAction).mockResolvedValue({ ok: true, created: 1, updated: 0, skipped: 0 } as never)
    render(<KycManager />)
    const btn = await screen.findByRole("button", { name: /sync from stripe identity/i })
    fireEvent.click(btn)
    await waitFor(() => expect(syncStripeIdentityAction).toHaveBeenCalled())
  })

  it("reveals the Stripe verdict + extracted fields when a row is expanded", async () => {
    vi.mocked(listIntakesAction).mockResolvedValue({ ok: true, intakes: [row] } as never)
    render(<KycManager />)
    const toggle = await screen.findByRole("button", { name: /details/i })
    fireEvent.click(toggle)
    expect(await screen.findByText(/verified/i)).toBeInTheDocument()
    expect(screen.getByText(/passport/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true node_modules/.bin/vitest run tests/cms/kyc-manager.test.tsx`
Expected: FAIL — no "Sync from Stripe Identity" button / no details toggle.

- [ ] **Step 3: Implement the UI**

In `components/cms/KycManager.tsx`:

(a) Extend the action import:

```tsx
import { listIntakesAction, recordDispositionAction, rescreenOfacAction, syncStripeIdentityAction } from "@/actions/cms/kyc"
```

(b) Add expand state next to the other `useState` hooks:

```tsx
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
```

(c) Add the sync button right before the existing "Run OFAC rescreen" `<Button>`:

```tsx
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setNotice(null)
              const res = await syncStripeIdentityAction()
              if (res.ok) {
                setNotice(`Synced from Stripe Identity: ${res.created} new, ${res.updated} updated`)
                fetchRows()
              } else {
                setError(res.error)
              }
            })
          }
        >
          Sync from Stripe Identity
        </Button>
```

(d) Inside the `<li>` for each row, after the existing meta `<div>` (the `{r.provider} · submitted …` line) and before the disposition row, add a details toggle + panel:

```tsx
                  {r.providerData && (
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      className="mt-2 text-xs text-zinc-400 underline"
                    >
                      {expanded[r.id] ? "Hide details" : "Details"}
                    </button>
                  )}
                  {r.providerData && expanded[r.id] && (
                    <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-300">
                      <div>
                        <span className="text-zinc-500">Stripe verdict: </span>
                        <span className="font-medium text-white">{r.providerData.verdict}</span>
                        {r.providerData.lastError && (
                          <span className="text-red-300"> — {r.providerData.lastError.reason}</span>
                        )}
                      </div>
                      <div className="mt-1">
                        <span className="text-zinc-500">Document: </span>
                        {r.providerData.document.type ?? "—"}
                        {r.providerData.document.country ? ` (${r.providerData.document.country})` : ""}
                      </div>
                      <div className="mt-1">
                        <span className="text-zinc-500">Extracted: </span>
                        {[r.providerData.extracted.firstName, r.providerData.extracted.lastName].filter(Boolean).join(" ") || "—"}
                        {r.providerData.extracted.dob ? ` · DOB ${r.providerData.extracted.dob}` : ""}
                      </div>
                    </div>
                  )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true node_modules/.bin/vitest run tests/cms/kyc-manager.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit` (expected exit 0)

```bash
git add components/cms/KycManager.tsx tests/cms/kyc-manager.test.tsx
git commit -m "feat(sp2): KycManager sync button + Stripe Identity detail panel"
```

---

### Task 8: Full verification + prod schema push

**Files:** none (verification + ops)

- [ ] **Step 1: Full typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Full test suite**

Run: `CI=true node_modules/.bin/vitest run`
Expected: all green (prior 442 passed + the new SP-2 tests; 50 skipped unchanged).

- [ ] **Step 3: Production build**

Run: `node_modules/.bin/next build`
Expected: exit 0.

- [ ] **Step 4: Prove the migration is additive (prod, via io-sa)**

Start the Cloud SQL proxy (`.ioenv-check/cloud-sql-proxy.exe` with the io-sa key) and run, against the live `DATABASE_URL` (from Secret Manager `db-connection-string-k8s`):

Run: `node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
Expected: only `ALTER TABLE "KycIntake" ADD COLUMN "providerData"` + a `CREATE UNIQUE INDEX` on `externalId` — additive, no DROP. If anything destructive appears, STOP and report.

- [ ] **Step 5: Apply additively + re-verify zero drift**

Run: `node_modules/.bin/prisma db push --skip-generate`
Then: `node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
Expected: second diff is empty (no drift).

- [ ] **Step 6: Open the PR**

```bash
git push -u origin feat/sp2-stripe-identity
gh pr create --base main --head feat/sp2-stripe-identity \
  --title "feat(sp2): Stripe Identity -> KYC review queue" \
  --body "Implements docs/superpowers/specs/2026-06-21-sp2-stripe-identity-design.md. Manual sync (webhook = SP-4), summary+verdict+fields (no images), human-in-the-loop, derived riskScore. Additive schema (externalId @unique, providerData json). tsc 0, vitest green, next build 0, db push additive (zero drift)."
```

---

## Self-Review

**Spec coverage:**
- Sync/import model → Tasks 3 (read) + 4 (upsert) + 5 (action) + 7 (button). ✓
- Detail = summary+verdict+fields, no images → Task 3 (no `files`), Task 6 (expose), Task 7 (panel). ✓
- Human-in-the-loop / all PENDING → Task 1 (status PENDING) + Task 4 (preserve dispositions). ✓
- Derived riskScore → Task 1 (RISK map). ✓
- externalId @unique + providerData Json? → Task 2. ✓
- Gating MANAGE_AML / degrade / isLive → Task 4 (isLive+degrade) + Task 5 (actor gate). ✓
- Status mapping table (all PENDING) → Task 1. ✓
- Testing (mapping, idempotency, gating, degrade) → Tasks 1,3,4,5,6,7. ✓

**Placeholder scan:** No placeholders — every code/test step is a complete file or a precise edit with full code.

**Type consistency:** `StripeIdentityVerification`/`IdentityVerdict`/`IdentityProviderData` defined in Task 1, consumed identically in Tasks 3/4/6. `mapIdentityVerification` (Task 1) → `MappedIdentityIntake` consumed in Task 4. `syncStripeIdentity(): SyncResult {created,updated,skipped}` (Task 4) consumed by `syncStripeIdentityAction` (Task 5) and rendered in Task 7. `providerData` shape consistent across Tasks 1/6/7. ✓
