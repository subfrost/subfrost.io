# SP-4 — Stripe Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed Stripe webhook receiver that persists a PII-free universal event log and auto-feeds the KYC queue (identity → KycIntake), replacing SP-2's manual sync button with push.

**Architecture:** A public `POST /api/webhooks/stripe` route verifies the Stripe signature, summarizes the event into a non-PII shape, upserts it into a new `StripeWebhookEvent` table (idempotent by `event.id`), then dispatches: `identity.verification_session.*` events run the KYC upsert (reusing SP-2 logic), every other type is logged only. A read-only `/admin/billing/events` viewer (BILLING_VIEW) renders the log. Mirrors the SP-1 `lib/stripe/` boundary.

**Tech Stack:** Next.js 16 App Router (route handlers, Node runtime), Prisma/Postgres, Stripe Node SDK v22 (`stripe.webhooks.constructEvent`), Vitest + Testing Library.

## Global Constraints

- Branch: `feat/sp4-stripe-webhooks`. Flow is branch→PR→merge — **never push to main**.
- Each task ends green: `npx tsc --noEmit` = 0 · `CI=true npx vitest run <file>` passing · (full `npx next build` = 0 only at the final task).
- Stripe SDK stays **out of the client bundle**: only `lib/stripe/client.ts`, `lib/stripe/source/live/*`, the route, and the webhook server libs (`verify`, `dispatch`, `handlers/*`) may import the `stripe` package — and `summary.ts`/`verify.ts`/`dispatch.ts`/`handlers/*` use **type-only** `import type Stripe from "stripe"`. `lib/stripe/config.ts` and `lib/stripe/shapes.ts` stay SDK-free.
- `prisma db push` must be **additive** (`npx prisma migrate diff` proves it before any prod push).
- **No PII** in `StripeWebhookEvent` — never store `verified_outputs`, names, DOB, or card PAN. Summary fields are object id / object status / amount / currency / reason only.
- Money stays human-confirmed: **only** `identity.*` mutates the DB; charge/payout/dispute/onramp are log-only.
- The route is **public** (no login gate) — signature verification is the auth. The viewer + action are gated `BILLING_VIEW`.
- Vitest hoisting: `vi.mock(...)` factories use `vi.fn()` **inline** + `vi.mocked()` at call sites; never reference a top-level `const`. Prisma is mocked as `{ default: client, prisma: client }`.
- Stripe API version is `"2026-05-27.dahlia"` — already pinned in `lib/stripe/client.ts`; do not change it.
- `STRIPE_WEBHOOK_SECRET` and its `k8s/external-secrets.yaml` entry are added **only after** the secret exists in Secret Manager (ESO syncs `data` atomically — a missing key fails the whole ExternalSecret). This is **operational, post-merge** — not a code task here (see "Live activation" at the end).

---

### Task 1: `StripeWebhookEvent` Prisma model (additive)

**Files:**
- Modify: `prisma/schema.prisma` (append a model near the other Stripe models, after `StripeApplication`)

**Interfaces:**
- Produces: Prisma model `StripeWebhookEvent` with fields `id, type, apiVersion, stripeCreated, receivedAt, status, handled, error, objectType, objectId, objectStatus, amount, currency, reason`. The generated client exposes `prisma.stripeWebhookEvent`.

- [ ] **Step 1: Add the model**

In `prisma/schema.prisma`, append:

```prisma
// SP-4: append-only-ish log of received Stripe webhook events. PII-free: only a
// non-sensitive summary is stored; full detail lives in the Stripe dashboard.
model StripeWebhookEvent {
  id            String   @id                  // Stripe event id (evt_...) = natural PK → idempotency
  type          String                        // e.g. "identity.verification_session.verified"
  apiVersion    String?
  stripeCreated DateTime                       // event.created
  receivedAt    DateTime @default(now())
  status        String   @default("received") // received | processed | ignored | failed
  handled       Boolean  @default(false)       // did a domain handler act on it?
  error         String?
  objectType    String?                         // event.data.object.object e.g. "charge","payout"
  objectId      String?
  objectStatus  String?                         // object.status (non-PII)
  amount        Int?                            // cents, when present
  currency      String?
  reason        String?                         // dispute / rejection reason (non-PII)

  @@index([type])
  @@index([receivedAt])
  @@index([status])
}
```

- [ ] **Step 2: Validate + generate the client**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and "Generated Prisma Client".

- [ ] **Step 3: Prove the change is additive**

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` is NOT the right check here; instead diff the committed schema against the working tree conceptually — confirm only a new `CREATE TABLE "StripeWebhookEvent"` (+ indexes) would be emitted, no `ALTER`/`DROP` on existing tables.
Run: `git diff --stat prisma/schema.prisma`
Expected: only additions (one new model block); no edits to existing models.

- [ ] **Step 4: Confirm tsc sees the new model**

Run: `npx tsc --noEmit`
Expected: exit 0 (no type errors from the regenerated client).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(printf 'feat(sp4): add StripeWebhookEvent model (additive)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: `summarizeEvent` (pure, PII-free) + `WebhookEventSummary` shape

**Files:**
- Modify: `lib/stripe/shapes.ts` (append `WebhookEventSummary` type — client-safe, SDK-free)
- Create: `lib/stripe/webhooks/summary.ts`
- Test: `tests/stripe/webhook-summary.test.ts`

**Interfaces:**
- Produces: `type WebhookEventSummary = { objectType: string | null; objectId: string | null; objectStatus: string | null; amount: number | null; currency: string | null; reason: string | null }` and `summarizeEvent(event: Stripe.Event): WebhookEventSummary`.

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-summary.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { summarizeEvent } from "@/lib/stripe/webhooks/summary"
import type Stripe from "stripe"

const evt = (type: string, object: Record<string, unknown>): Stripe.Event =>
  ({ id: "evt_1", type, data: { object } } as unknown as Stripe.Event)

describe("summarizeEvent", () => {
  it("summarizes a charge into non-PII fields", () => {
    const s = summarizeEvent(evt("charge.succeeded", { object: "charge", id: "ch_1", status: "succeeded", amount: 4200, currency: "usd" }))
    expect(s).toEqual({ objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 4200, currency: "usd", reason: null })
  })

  it("captures a dispute reason", () => {
    const s = summarizeEvent(evt("charge.dispute.created", { object: "dispute", id: "dp_1", status: "warning_needs_response", amount: 1000, currency: "usd", reason: "fraudulent" }))
    expect(s.reason).toBe("fraudulent")
  })

  it("NEVER includes PII from an identity event", () => {
    const s = summarizeEvent(evt("identity.verification_session.verified", {
      object: "identity.verification_session", id: "vs_1", status: "verified",
      verified_outputs: { first_name: "Ada", last_name: "Lovelace", dob: { year: 1815, month: 12, day: 10 } },
    }))
    expect(s).toEqual({ objectType: "identity.verification_session", objectId: "vs_1", objectStatus: "verified", amount: null, currency: null, reason: null })
    expect(JSON.stringify(s)).not.toMatch(/Ada|Lovelace|1815/)
  })

  it("is defensive when fields are missing", () => {
    const s = summarizeEvent(evt("customer.created", { object: "customer", id: "cus_1" }))
    expect(s).toEqual({ objectType: "customer", objectId: "cus_1", objectStatus: null, amount: null, currency: null, reason: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-summary.test.ts`
Expected: FAIL — cannot find module `@/lib/stripe/webhooks/summary`.

- [ ] **Step 3: Add the shape**

Append to `lib/stripe/shapes.ts`:

```ts
// SP-4: client-safe, PII-free summary of a Stripe webhook event (no verified_outputs / PAN).
export type WebhookEventSummary = {
  objectType: string | null
  objectId: string | null
  objectStatus: string | null
  amount: number | null
  currency: string | null
  reason: string | null
}
```

- [ ] **Step 4: Implement the summary**

Create `lib/stripe/webhooks/summary.ts`:

```ts
import type Stripe from "stripe"
import type { WebhookEventSummary } from "@/lib/stripe/shapes"

/** Reduces a Stripe event to a small, NON-PII summary. Only reads object/id/status/
 *  amount/currency/reason — never names, DOB, verified_outputs, or card PAN. Pure. */
export function summarizeEvent(event: Stripe.Event): WebhookEventSummary {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null)
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null)
  return {
    objectType: str(obj.object),
    objectId: str(obj.id),
    objectStatus: str(obj.status),
    amount: num(obj.amount),
    currency: str(obj.currency),
    reason: str(obj.reason),
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-summary.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests) and tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/stripe/shapes.ts lib/stripe/webhooks/summary.ts tests/stripe/webhook-summary.test.ts
git commit -m "$(printf 'feat(sp4): summarizeEvent — PII-free webhook event summary\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `constructWebhookEvent` (signature verification)

**Files:**
- Create: `lib/stripe/webhooks/verify.ts`
- Test: `tests/stripe/webhook-verify.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()` from `@/lib/stripe/client` (returns a `Stripe` whose `.webhooks.constructEvent(body, sig, secret)` verifies + parses).
- Produces: `constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event` — throws if the secret is unset, the header is missing, or the signature is invalid.

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-verify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: vi.fn(() => ({ webhooks: { constructEvent: vi.fn() } })),
}))

import { constructWebhookEvent } from "@/lib/stripe/webhooks/verify"
import { getStripeClient } from "@/lib/stripe/client"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
})

describe("constructWebhookEvent", () => {
  it("returns the parsed event for a valid signature", () => {
    const fake = { id: "evt_1", type: "charge.succeeded" }
    const ce = vi.fn(() => fake)
    vi.mocked(getStripeClient).mockReturnValueOnce({ webhooks: { constructEvent: ce } } as never)
    const out = constructWebhookEvent("raw-body", "sig")
    expect(out).toBe(fake)
    expect(ce).toHaveBeenCalledWith("raw-body", "sig", "whsec_test")
  })

  it("throws when the signature is invalid", () => {
    const ce = vi.fn(() => { throw new Error("No signatures found matching the expected signature") })
    vi.mocked(getStripeClient).mockReturnValueOnce({ webhooks: { constructEvent: ce } } as never)
    expect(() => constructWebhookEvent("raw", "bad")).toThrow(/signature/i)
  })

  it("throws when STRIPE_WEBHOOK_SECRET is unset", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    expect(() => constructWebhookEvent("raw", "sig")).toThrow(/STRIPE_WEBHOOK_SECRET/)
  })

  it("throws when the signature header is missing", () => {
    expect(() => constructWebhookEvent("raw", null)).toThrow(/signature/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-verify.test.ts`
Expected: FAIL — cannot find module `@/lib/stripe/webhooks/verify`.

- [ ] **Step 3: Implement**

Create `lib/stripe/webhooks/verify.ts`:

```ts
import type Stripe from "stripe"
import { getStripeClient } from "@/lib/stripe/client"

/** Verifies a raw Stripe webhook body against the signature header using
 *  STRIPE_WEBHOOK_SECRET. Throws on missing secret/header or bad signature.
 *  Server-only (uses getStripeClient → the stripe SDK). */
export function constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set")
  if (!signature) throw new Error("Missing stripe-signature header")
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-verify.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests) and tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/webhooks/verify.ts tests/stripe/webhook-verify.test.ts
git commit -m "$(printf 'feat(sp4): constructWebhookEvent — verify Stripe signature\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: `store.ts` — persistence + idempotency + list (+ `WebhookEventRow` shape)

**Files:**
- Modify: `lib/stripe/shapes.ts` (append `WebhookEventRow`)
- Create: `lib/stripe/webhooks/store.ts`
- Test: `tests/stripe/webhook-store.test.ts`

**Interfaces:**
- Consumes: `summarizeEvent` output (`WebhookEventSummary`); `prisma.stripeWebhookEvent`.
- Produces:
  - `recordEvent(event: Stripe.Event, summary: WebhookEventSummary): Promise<"process" | "replay">` — `"replay"` means it was already completed (processed/ignored) → caller skips dispatch; `"process"` means proceed.
  - `markProcessed(id: string)`, `markIgnored(id: string)`, `markFailed(id: string, error: string)` — status transitions.
  - `listWebhookEvents(filter?: { type?: string; status?: string }): Promise<WebhookEventRow[]>` — newest first, capped at 200, dates as ISO strings.
  - `type WebhookEventRow = { id, type, status, handled, error, stripeCreated, receivedAt, objectType, objectId, objectStatus, amount, currency, reason }` (dates are ISO strings).

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const stripeWebhookEvent = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() }
  const client = { stripeWebhookEvent }
  return { prisma: client, default: client }
})

import { recordEvent, markProcessed, markIgnored, markFailed, listWebhookEvents } from "@/lib/stripe/webhooks/store"
import prisma from "@/lib/prisma"
import type Stripe from "stripe"
import type { WebhookEventSummary } from "@/lib/stripe/shapes"

const swe = (prisma as unknown as { stripeWebhookEvent: Record<string, ReturnType<typeof vi.fn>> }).stripeWebhookEvent
const event = { id: "evt_1", type: "charge.succeeded", api_version: "2026-05-27.dahlia", created: 1750000000, data: { object: {} } } as unknown as Stripe.Event
const summary: WebhookEventSummary = { objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 100, currency: "usd", reason: null }

beforeEach(() => vi.clearAllMocks())

describe("recordEvent", () => {
  it("creates a new row and returns 'process' for an unseen event", async () => {
    swe.findUnique.mockResolvedValueOnce(null)
    const r = await recordEvent(event, summary)
    expect(r).toBe("process")
    expect(swe.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: "evt_1", type: "charge.succeeded", status: "received", objectId: "ch_1" }) }))
  })

  it("returns 'replay' (no create) when the event was already processed", async () => {
    swe.findUnique.mockResolvedValueOnce({ id: "evt_1", status: "processed" })
    const r = await recordEvent(event, summary)
    expect(r).toBe("replay")
    expect(swe.create).not.toHaveBeenCalled()
  })

  it("returns 'process' (no create) for a prior failed event so it re-dispatches", async () => {
    swe.findUnique.mockResolvedValueOnce({ id: "evt_1", status: "failed" })
    const r = await recordEvent(event, summary)
    expect(r).toBe("process")
    expect(swe.create).not.toHaveBeenCalled()
  })

  it("treats a concurrent unique-violation as 'replay'", async () => {
    swe.findUnique.mockResolvedValueOnce(null)
    swe.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    const r = await recordEvent(event, summary)
    expect(r).toBe("replay")
  })
})

describe("status transitions", () => {
  it("markProcessed sets processed + handled", async () => {
    await markProcessed("evt_1")
    expect(swe.update).toHaveBeenCalledWith({ where: { id: "evt_1" }, data: { status: "processed", handled: true } })
  })
  it("markIgnored sets ignored", async () => {
    await markIgnored("evt_1")
    expect(swe.update).toHaveBeenCalledWith({ where: { id: "evt_1" }, data: { status: "ignored", handled: false } })
  })
  it("markFailed records the error", async () => {
    await markFailed("evt_1", "boom")
    expect(swe.update).toHaveBeenCalledWith({ where: { id: "evt_1" }, data: { status: "failed", error: "boom" } })
  })
})

describe("listWebhookEvents", () => {
  it("maps rows to ISO-string dates, newest first, filtered", async () => {
    swe.findMany.mockResolvedValueOnce([
      { id: "evt_1", type: "charge.succeeded", status: "processed", handled: true, error: null, stripeCreated: new Date("2026-06-22T00:00:00Z"), receivedAt: new Date("2026-06-22T00:00:01Z"), objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 100, currency: "usd", reason: null },
    ])
    const rows = await listWebhookEvents({ status: "processed" })
    expect(swe.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "processed" }, orderBy: { receivedAt: "desc" }, take: 200 }))
    expect(rows[0].stripeCreated).toBe("2026-06-22T00:00:00.000Z")
    expect(rows[0].receivedAt).toBe("2026-06-22T00:00:01.000Z")
  })

  it("uses a contains filter for type", async () => {
    swe.findMany.mockResolvedValueOnce([])
    await listWebhookEvents({ type: "identity" })
    expect(swe.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { type: { contains: "identity" } } }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-store.test.ts`
Expected: FAIL — cannot find module `@/lib/stripe/webhooks/store`.

- [ ] **Step 3: Add the row shape**

Append to `lib/stripe/shapes.ts`:

```ts
// SP-4: client-safe row for the webhook event viewer (dates as ISO strings).
export type WebhookEventRow = {
  id: string
  type: string
  status: string
  handled: boolean
  error: string | null
  stripeCreated: string
  receivedAt: string
  objectType: string | null
  objectId: string | null
  objectStatus: string | null
  amount: number | null
  currency: string | null
  reason: string | null
}
```

- [ ] **Step 4: Implement the store**

Create `lib/stripe/webhooks/store.ts`:

```ts
import type Stripe from "stripe"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import type { WebhookEventSummary, WebhookEventRow } from "@/lib/stripe/shapes"

/** Persist the event idempotently by event.id. Returns "replay" when it was already
 *  completed (processed/ignored) so the caller skips re-dispatch; "process" otherwise
 *  (new event → row created as "received"; a prior "failed" row → left as-is to retry). */
export async function recordEvent(event: Stripe.Event, summary: WebhookEventSummary): Promise<"process" | "replay"> {
  const existing = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } })
  if (existing && (existing.status === "processed" || existing.status === "ignored")) return "replay"
  if (!existing) {
    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          id: event.id,
          type: event.type,
          apiVersion: event.api_version ?? null,
          stripeCreated: new Date(event.created * 1000),
          status: "received",
          handled: false,
          objectType: summary.objectType,
          objectId: summary.objectId,
          objectStatus: summary.objectStatus,
          amount: summary.amount,
          currency: summary.currency,
          reason: summary.reason,
        },
      })
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return "replay" // concurrent duplicate
      throw e
    }
  }
  return "process"
}

export const markProcessed = (id: string) =>
  prisma.stripeWebhookEvent.update({ where: { id }, data: { status: "processed", handled: true } })

export const markIgnored = (id: string) =>
  prisma.stripeWebhookEvent.update({ where: { id }, data: { status: "ignored", handled: false } })

export const markFailed = (id: string, error: string) =>
  prisma.stripeWebhookEvent.update({ where: { id }, data: { status: "failed", error } })

export async function listWebhookEvents(filter?: { type?: string; status?: string }): Promise<WebhookEventRow[]> {
  const where: Prisma.StripeWebhookEventWhereInput = {}
  if (filter?.type) where.type = { contains: filter.type }
  if (filter?.status) where.status = filter.status
  const rows = await prisma.stripeWebhookEvent.findMany({ where, orderBy: { receivedAt: "desc" }, take: 200 })
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    handled: r.handled,
    error: r.error,
    stripeCreated: r.stripeCreated.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    objectType: r.objectType,
    objectId: r.objectId,
    objectStatus: r.objectStatus,
    amount: r.amount,
    currency: r.currency,
    reason: r.reason,
  }))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-store.test.ts && npx tsc --noEmit`
Expected: PASS (9 tests) and tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/stripe/shapes.ts lib/stripe/webhooks/store.ts tests/stripe/webhook-store.test.ts
git commit -m "$(printf 'feat(sp4): webhook event store — idempotent persist + list\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Extract `upsertIdentityIntake` from `syncStripeIdentity`

**Files:**
- Modify: `lib/kyc/sync.ts`
- Test: `tests/kyc/upsert-identity-intake.test.ts` (new, direct) — and existing `tests/kyc/sync.test.ts` must stay green.

**Interfaces:**
- Consumes: `MappedIdentityIntake` (from `@/lib/kyc/identity-map`); `prisma.kycIntake`.
- Produces: `upsertIdentityIntake(m: MappedIdentityIntake): Promise<"created" | "updated">` — idempotent by `externalId`, preserves human dispositions. `syncStripeIdentity()` keeps its existing `SyncResult` contract by calling it per row.

- [ ] **Step 1: Write the failing test**

Create `tests/kyc/upsert-identity-intake.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { kycIntake: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}))

import { upsertIdentityIntake } from "@/lib/kyc/sync"
import prisma from "@/lib/prisma"
import type { MappedIdentityIntake } from "@/lib/kyc/identity-map"

const m = (over: Partial<MappedIdentityIntake> = {}): MappedIdentityIntake => ({
  externalId: "vs_1", customerName: "Ada Lovelace", customerEmail: "ada@x.io",
  provider: "STRIPE_IDENTITY", submittedAt: new Date("2026-06-21T00:00:00Z"),
  status: "PENDING", riskScore: "HIGH",
  providerData: { verdict: "requires_input", lastError: null, document: { type: null, country: null }, extracted: { firstName: "Ada", lastName: "Lovelace", dob: null } },
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("upsertIdentityIntake", () => {
  it("creates when unseen", async () => {
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce(null as never)
    expect(await upsertIdentityIntake(m())).toBe("created")
    expect(prisma.kycIntake.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ externalId: "vs_1", status: "PENDING", riskScore: "HIGH" }) }))
  })

  it("preserves status/riskScore when a human disposition exists", async () => {
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [{ id: "d1" }] } as never)
    expect(await upsertIdentityIntake(m())).toBe("updated")
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).not.toHaveProperty("status")
    expect(arg.data).toHaveProperty("providerData")
  })

  it("refreshes status/riskScore when no disposition yet", async () => {
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [] } as never)
    expect(await upsertIdentityIntake(m())).toBe("updated")
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).toMatchObject({ status: "PENDING", riskScore: "HIGH" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/kyc/upsert-identity-intake.test.ts`
Expected: FAIL — `upsertIdentityIntake` is not exported from `@/lib/kyc/sync`.

- [ ] **Step 3: Refactor `sync.ts`**

Replace the body of `lib/kyc/sync.ts` (keep the imports for `prisma`, `isLive`, `degradeIfUnavailable`, `liveIdentityVerifications`, `mapIdentityVerification`, `Prisma`) with:

```ts
import prisma from "@/lib/prisma"
import { isLive } from "@/lib/stripe/config"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"
import { mapIdentityVerification, type MappedIdentityIntake } from "@/lib/kyc/identity-map"
import type { Prisma } from "@prisma/client"

export interface SyncResult {
  created: number
  updated: number
  skipped: number
}

/** Upserts a single mapped Identity verification as a KycIntake (idempotent by
 *  externalId). Never overwrites a row that already carries a human disposition. */
export async function upsertIdentityIntake(m: MappedIdentityIntake): Promise<"created" | "updated"> {
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
    return "created"
  }
  if (existing.dispositions.length > 0) {
    await prisma.kycIntake.update({
      where: { id: existing.id },
      data: { providerData, customerName: m.customerName, customerEmail: m.customerEmail },
    })
    return "updated"
  }
  await prisma.kycIntake.update({
    where: { id: existing.id },
    data: { providerData, customerName: m.customerName, customerEmail: m.customerEmail, status: m.status, riskScore: m.riskScore },
  })
  return "updated"
}

/** Pulls all Stripe Identity verifications and upserts them. Degrades to zeros if
 *  Identity is unavailable or the key is unset. */
export async function syncStripeIdentity(): Promise<SyncResult> {
  if (!isLive()) return { created: 0, updated: 0, skipped: 0 }
  const verifications = await degradeIfUnavailable(liveIdentityVerifications, [])
  let created = 0
  let updated = 0
  for (const v of verifications) {
    const r = await upsertIdentityIntake(mapIdentityVerification(v))
    if (r === "created") created++
    else updated++
  }
  return { created, updated, skipped: 0 }
}
```

- [ ] **Step 4: Run both test files to verify green**

Run: `CI=true npx vitest run tests/kyc/upsert-identity-intake.test.ts tests/kyc/sync.test.ts && npx tsc --noEmit`
Expected: PASS (3 new + 5 existing) and tsc exit 0. (The existing `sync.test.ts` proves behavior is unchanged.)

- [ ] **Step 5: Commit**

```bash
git add lib/kyc/sync.ts tests/kyc/upsert-identity-intake.test.ts
git commit -m "$(printf 'refactor(sp4): extract upsertIdentityIntake for webhook reuse\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: `liveIdentityVerification(id)` — single-session fetch

**Files:**
- Modify: `lib/stripe/source/live/identity.ts` (extract `normalizeSession`; add single fetch)
- Test: `tests/stripe/live-identity-single.test.ts`

**Interfaces:**
- Consumes: `getStripeClient()` (`.identity.verificationSessions.retrieve(id, { expand })`).
- Produces: `liveIdentityVerification(id: string): Promise<StripeIdentityVerification | null>` — normalized (NO images), `null` when the session can't be fetched.

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/live-identity-single.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: vi.fn(() => ({ identity: { verificationSessions: { retrieve: vi.fn() } } })),
}))

import { liveIdentityVerification } from "@/lib/stripe/source/live/identity"
import { getStripeClient } from "@/lib/stripe/client"

beforeEach(() => vi.clearAllMocks())

describe("liveIdentityVerification", () => {
  it("normalizes a single session (no image data)", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "vs_1", status: "verified", last_error: null,
      verified_outputs: { first_name: "Ada", last_name: "Lovelace", dob: { year: 1815, month: 12, day: 10 }, email: "ada@x.io" },
      last_verification_report: { document: { type: "passport", issuing_country: "US" } },
      metadata: {}, created: 1750000000,
    })
    vi.mocked(getStripeClient).mockReturnValueOnce({ identity: { verificationSessions: { retrieve } } } as never)
    const v = await liveIdentityVerification("vs_1")
    expect(retrieve).toHaveBeenCalledWith("vs_1", { expand: ["last_verification_report"] })
    expect(v).toMatchObject({ id: "vs_1", verdict: "verified", document: { type: "passport", country: "US" }, extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" }, email: "ada@x.io" })
  })

  it("returns null when retrieve yields nothing", async () => {
    const retrieve = vi.fn().mockResolvedValue(null)
    vi.mocked(getStripeClient).mockReturnValueOnce({ identity: { verificationSessions: { retrieve } } } as never)
    expect(await liveIdentityVerification("vs_x")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/live-identity-single.test.ts`
Expected: FAIL — `liveIdentityVerification` is not exported.

- [ ] **Step 3: Extract `normalizeSession` and add the single fetch**

In `lib/stripe/source/live/identity.ts`, factor the per-session mapping out of the loop and add the single fetch. The file becomes:

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

/** Normalize one raw VerificationSession into our PII-limited shape (no image files). */
function normalizeSession(vs: any): StripeIdentityVerification {
  const vo = vs.verified_outputs ?? null
  const docReport = vs.last_verification_report?.document ?? null
  return {
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
  }
}

/** Lists Stripe Identity verification sessions + their report summary. No image data. */
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
    for (const vs of page.data as any[]) out.push(normalizeSession(vs))
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return out
}

/** Fetches one Stripe Identity verification session (report expanded; no image data).
 *  Used by the SP-4 webhook handler. Returns null when the session can't be fetched. */
export async function liveIdentityVerification(id: string): Promise<StripeIdentityVerification | null> {
  const stripe = getStripeClient()
  const vs: any = await (stripe as any).identity.verificationSessions.retrieve(id, {
    expand: ["last_verification_report"],
  })
  if (!vs) return null
  return normalizeSession(vs)
}
```

- [ ] **Step 4: Run new + existing identity-source tests**

Run: `CI=true npx vitest run tests/stripe/live-identity-single.test.ts tests/stripe/live-identity.test.ts && npx tsc --noEmit`
Expected: PASS (2 new + existing list tests unchanged) and tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/source/live/identity.ts tests/stripe/live-identity-single.test.ts
git commit -m "$(printf 'feat(sp4): liveIdentityVerification single-session fetch\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: `onIdentityEvent` handler (identity → KYC, degrading)

**Files:**
- Create: `lib/stripe/webhooks/handlers/identity.ts`
- Test: `tests/stripe/webhook-handler-identity.test.ts`

**Interfaces:**
- Consumes: `degradeIfUnavailable`, `liveIdentityVerification(id)`, `mapIdentityVerification`, `upsertIdentityIntake`.
- Produces: `onIdentityEvent(event: Stripe.Event): Promise<void>` — fetches the session by id, maps it, upserts the KycIntake. No-op (no throw) when the id is missing or the source degrades.

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-handler-identity.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/source/live/identity", () => ({ liveIdentityVerification: vi.fn() }))
vi.mock("@/lib/kyc/sync", () => ({ upsertIdentityIntake: vi.fn() }))

import { onIdentityEvent } from "@/lib/stripe/webhooks/handlers/identity"
import { liveIdentityVerification } from "@/lib/stripe/source/live/identity"
import { upsertIdentityIntake } from "@/lib/kyc/sync"
import type Stripe from "stripe"
import type { StripeIdentityVerification } from "@/lib/stripe/shapes"

const event = (id: string): Stripe.Event =>
  ({ id: "evt_1", type: "identity.verification_session.verified", data: { object: { id } } } as unknown as Stripe.Event)

const verification: StripeIdentityVerification = {
  id: "vs_1", verdict: "verified", lastError: null,
  document: { type: "passport", country: "US" },
  extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
  email: "ada@x.io", createdAt: "2026-06-21T00:00:00.000Z",
}

beforeEach(() => vi.clearAllMocks())

describe("onIdentityEvent", () => {
  it("fetches the session and upserts the intake", async () => {
    vi.mocked(liveIdentityVerification).mockResolvedValueOnce(verification)
    await onIdentityEvent(event("vs_1"))
    expect(liveIdentityVerification).toHaveBeenCalledWith("vs_1")
    expect(upsertIdentityIntake).toHaveBeenCalledWith(expect.objectContaining({ externalId: "vs_1", status: "PENDING", riskScore: "LOW" }))
  })

  it("no-ops when the source degrades (returns null)", async () => {
    vi.mocked(liveIdentityVerification).mockResolvedValueOnce(null)
    await onIdentityEvent(event("vs_1"))
    expect(upsertIdentityIntake).not.toHaveBeenCalled()
  })

  it("no-ops (no throw) when the source throws", async () => {
    vi.mocked(liveIdentityVerification).mockRejectedValueOnce(new Error("not enabled"))
    await expect(onIdentityEvent(event("vs_1"))).resolves.toBeUndefined()
    expect(upsertIdentityIntake).not.toHaveBeenCalled()
  })

  it("no-ops when the event has no object id", async () => {
    await onIdentityEvent({ id: "evt_1", type: "identity.verification_session.verified", data: { object: {} } } as unknown as Stripe.Event)
    expect(liveIdentityVerification).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-handler-identity.test.ts`
Expected: FAIL — cannot find module `@/lib/stripe/webhooks/handlers/identity`.

- [ ] **Step 3: Implement**

Create `lib/stripe/webhooks/handlers/identity.ts`:

```ts
import type Stripe from "stripe"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveIdentityVerification } from "@/lib/stripe/source/live/identity"
import { mapIdentityVerification } from "@/lib/kyc/identity-map"
import { upsertIdentityIntake } from "@/lib/kyc/sync"

/** Handle an identity.verification_session.* event: fetch the session (report
 *  expanded, no images), map it, and upsert the KycIntake. Degrades to a no-op if
 *  Identity is unavailable — the event row still records receipt, and the manual
 *  SP-2 sync remains the fallback. */
export async function onIdentityEvent(event: Stripe.Event): Promise<void> {
  const id = (event.data.object as { id?: string }).id
  if (!id) return
  const v = await degradeIfUnavailable(() => liveIdentityVerification(id), null)
  if (!v) return
  await upsertIdentityIntake(mapIdentityVerification(v))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-handler-identity.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests) and tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/webhooks/handlers/identity.ts tests/stripe/webhook-handler-identity.test.ts
git commit -m "$(printf 'feat(sp4): identity webhook handler → KYC upsert\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: `dispatchEvent` (type routing)

**Files:**
- Create: `lib/stripe/webhooks/dispatch.ts`
- Test: `tests/stripe/webhook-dispatch.test.ts`

**Interfaces:**
- Consumes: `onIdentityEvent`.
- Produces: `dispatchEvent(event: Stripe.Event): Promise<{ handled: boolean }>` — `handled:true` when a domain handler ran; `false` for log-only types. A handler throw propagates (the route maps it to a 500).

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-dispatch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/webhooks/handlers/identity", () => ({ onIdentityEvent: vi.fn() }))

import { dispatchEvent } from "@/lib/stripe/webhooks/dispatch"
import { onIdentityEvent } from "@/lib/stripe/webhooks/handlers/identity"
import type Stripe from "stripe"

const ev = (type: string): Stripe.Event => ({ id: "evt_1", type, data: { object: { id: "x" } } } as unknown as Stripe.Event)

beforeEach(() => vi.clearAllMocks())

describe("dispatchEvent", () => {
  it("routes identity.verification_session.* to the identity handler", async () => {
    const r = await dispatchEvent(ev("identity.verification_session.verified"))
    expect(onIdentityEvent).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ handled: true })
  })

  it("ignores unrelated types (log-only)", async () => {
    const r = await dispatchEvent(ev("charge.succeeded"))
    expect(onIdentityEvent).not.toHaveBeenCalled()
    expect(r).toEqual({ handled: false })
  })

  it("propagates a handler error", async () => {
    vi.mocked(onIdentityEvent).mockRejectedValueOnce(new Error("boom"))
    await expect(dispatchEvent(ev("identity.verification_session.requires_input"))).rejects.toThrow("boom")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-dispatch.test.ts`
Expected: FAIL — cannot find module `@/lib/stripe/webhooks/dispatch`.

- [ ] **Step 3: Implement**

Create `lib/stripe/webhooks/dispatch.ts`:

```ts
import type Stripe from "stripe"
import { onIdentityEvent } from "@/lib/stripe/webhooks/handlers/identity"

/** Route a verified event to its domain handler. Only identity.* mutates the DB;
 *  every other type is log-only (handled:false). Handler errors propagate so the
 *  route can mark the event failed and return 500 (Stripe retries). */
export async function dispatchEvent(event: Stripe.Event): Promise<{ handled: boolean }> {
  if (event.type.startsWith("identity.verification_session.")) {
    await onIdentityEvent(event)
    return { handled: true }
  }
  return { handled: false }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-dispatch.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests) and tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/webhooks/dispatch.ts tests/stripe/webhook-dispatch.test.ts
git commit -m "$(printf 'feat(sp4): dispatchEvent — webhook type routing\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 9: `POST /api/webhooks/stripe` route (orchestration)

**Files:**
- Create: `app/api/webhooks/stripe/route.ts`
- Test: `tests/stripe/webhook-route.test.ts`

**Interfaces:**
- Consumes: `constructWebhookEvent`, `summarizeEvent`, `recordEvent`, `markProcessed`, `markIgnored`, `markFailed`, `dispatchEvent`.
- Produces: `POST(req: Request): Promise<Response>`. Status map: bad signature → 400; replay → 200 `{received:true,replay:true}`; handled → 200 `{received:true}` after `markProcessed`; log-only → 200 after `markIgnored`; handler throw → `markFailed` + 500. `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/webhooks/verify", () => ({ constructWebhookEvent: vi.fn() }))
vi.mock("@/lib/stripe/webhooks/summary", () => ({ summarizeEvent: vi.fn(() => ({ objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 1, currency: "usd", reason: null })) }))
vi.mock("@/lib/stripe/webhooks/store", () => ({ recordEvent: vi.fn(), markProcessed: vi.fn(), markIgnored: vi.fn(), markFailed: vi.fn() }))
vi.mock("@/lib/stripe/webhooks/dispatch", () => ({ dispatchEvent: vi.fn() }))

import { POST } from "@/app/api/webhooks/stripe/route"
import { constructWebhookEvent } from "@/lib/stripe/webhooks/verify"
import { recordEvent, markProcessed, markIgnored, markFailed } from "@/lib/stripe/webhooks/store"
import { dispatchEvent } from "@/lib/stripe/webhooks/dispatch"

const req = (body = "{}", sig: string | null = "sig") =>
  new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }) as never

beforeEach(() => vi.clearAllMocks())

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 on an invalid signature", async () => {
    vi.mocked(constructWebhookEvent).mockImplementationOnce(() => { throw new Error("bad sig") })
    const res = await POST(req())
    expect(res.status).toBe(400)
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it("processes a handled event → markProcessed + 200", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_1", type: "identity.verification_session.verified" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("process")
    vi.mocked(dispatchEvent).mockResolvedValueOnce({ handled: true })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(markProcessed).toHaveBeenCalledWith("evt_1")
    expect(await res.json()).toEqual({ received: true })
  })

  it("ignores a log-only event → markIgnored + 200", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_2", type: "charge.succeeded" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("process")
    vi.mocked(dispatchEvent).mockResolvedValueOnce({ handled: false })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(markIgnored).toHaveBeenCalledWith("evt_2")
  })

  it("short-circuits a replay without dispatching", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_1", type: "charge.succeeded" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("replay")
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(dispatchEvent).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ received: true, replay: true })
  })

  it("marks failed + returns 500 when the handler throws", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_3", type: "identity.verification_session.verified" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("process")
    vi.mocked(dispatchEvent).mockRejectedValueOnce(new Error("boom"))
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(markFailed).toHaveBeenCalledWith("evt_3", "boom")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-route.test.ts`
Expected: FAIL — cannot find module `@/app/api/webhooks/stripe/route`.

- [ ] **Step 3: Implement**

Create `app/api/webhooks/stripe/route.ts`:

```ts
import { constructWebhookEvent } from "@/lib/stripe/webhooks/verify"
import { summarizeEvent } from "@/lib/stripe/webhooks/summary"
import { recordEvent, markProcessed, markIgnored, markFailed } from "@/lib/stripe/webhooks/store"
import { dispatchEvent } from "@/lib/stripe/webhooks/dispatch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Public Stripe webhook receiver. Security = signature verification (no login gate).
 *  Verify → summarize (PII-free) → persist idempotently → dispatch. Only identity.*
 *  mutates the DB; everything else is log-only. */
export async function POST(req: Request): Promise<Response> {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")

  let event
  try {
    event = constructWebhookEvent(body, sig)
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${(e as Error).message}`, { status: 400 })
  }

  const decision = await recordEvent(event, summarizeEvent(event))
  if (decision === "replay") return Response.json({ received: true, replay: true })

  try {
    const { handled } = await dispatchEvent(event)
    if (handled) await markProcessed(event.id)
    else await markIgnored(event.id)
  } catch (e) {
    await markFailed(event.id, (e as Error).message)
    return new Response("handler failed", { status: 500 })
  }

  return Response.json({ received: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-route.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests) and tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/stripe/route.ts tests/stripe/webhook-route.test.ts
git commit -m "$(printf 'feat(sp4): POST /api/webhooks/stripe receiver\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 10: `listWebhookEventsAction` (BILLING_VIEW)

**Files:**
- Modify: `actions/cms/billing.ts` (add the action + imports)
- Test: `tests/stripe/webhook-events-action.test.ts`

**Interfaces:**
- Consumes: `actor("BILLING_VIEW")` (existing helper in `actions/cms/billing.ts`); `listWebhookEvents` from the store; `isLive()` from config.
- Produces: `listWebhookEventsAction(filter?: { type?: string; status?: string }): Promise<{ ok: true; events: WebhookEventRow[]; live: boolean } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-events-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/stripe/webhooks/store", () => ({ listWebhookEvents: vi.fn() }))

import { listWebhookEventsAction } from "@/actions/cms/billing"
import { currentUser } from "@/lib/cms/authz"
import { listWebhookEvents } from "@/lib/stripe/webhooks/store"

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.STRIPE_SECRET_KEY
})

describe("listWebhookEventsAction", () => {
  it("rejects a user without BILLING_VIEW", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["FUEL_VIEW"] } as never)
    const res = await listWebhookEventsAction()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/privileges/i)
    expect(listWebhookEvents).not.toHaveBeenCalled()
  })

  it("returns events + live for a BILLING_VIEW user", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["BILLING_VIEW"] } as never)
    vi.mocked(listWebhookEvents).mockResolvedValue([{ id: "evt_1", type: "charge.succeeded" } as never])
    const res = await listWebhookEventsAction({ status: "processed" })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.live).toBe(false)
      expect(res.events).toHaveLength(1)
    }
    expect(listWebhookEvents).toHaveBeenCalledWith({ status: "processed" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-events-action.test.ts`
Expected: FAIL — `listWebhookEventsAction` is not exported from `@/actions/cms/billing`.

- [ ] **Step 3: Implement**

In `actions/cms/billing.ts`, add to the imports near the other stripe imports:

```ts
import { isLive } from "@/lib/stripe/config"
import { listWebhookEvents } from "@/lib/stripe/webhooks/store"
import type { WebhookEventRow } from "@/lib/stripe/shapes"
```

(If `isLive` is already imported in this file, do not duplicate it — reuse the existing import.) Then append the action at the end of the file:

```ts
export async function listWebhookEventsAction(
  filter?: { type?: string; status?: string },
): Promise<{ ok: true; events: WebhookEventRow[]; live: boolean } | { ok: false; error: string }> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  return { ok: true, events: await listWebhookEvents(filter), live: isLive() }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-events-action.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests) and tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add actions/cms/billing.ts tests/stripe/webhook-events-action.test.ts
git commit -m "$(printf 'feat(sp4): listWebhookEventsAction (BILLING_VIEW)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 11: Viewer page + `WebhookEventsManager` + nav item

**Files:**
- Modify: `lib/cms/admin-nav.ts` (add "Webhook events" leaf + `Webhook` icon import)
- Create: `components/cms/billing/WebhookEventsManager.tsx`
- Create: `app/admin/billing/events/page.tsx`
- Test: `tests/stripe/webhook-ui.test.tsx`

**Interfaces:**
- Consumes: `listWebhookEventsAction`, `WebhookEventRow`, `NAV_GROUPS`.
- Produces: nav leaf at `/admin/billing/events` (BILLING_VIEW); `WebhookEventsManager` client component; the page server component.

- [ ] **Step 1: Write the failing test**

Create `tests/stripe/webhook-ui.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { NAV_GROUPS } from "@/lib/cms/admin-nav"

vi.mock("@/actions/cms/billing", () => ({ listWebhookEventsAction: vi.fn() }))

import { WebhookEventsManager } from "@/components/cms/billing/WebhookEventsManager"
import { listWebhookEventsAction } from "@/actions/cms/billing"
import type { WebhookEventRow } from "@/lib/stripe/shapes"

const row = (id: string, type: string, status: string, over: Partial<WebhookEventRow> = {}): WebhookEventRow => ({
  id, type, status, handled: status === "processed", error: status === "failed" ? "boom" : null,
  stripeCreated: "2026-06-22T00:00:00.000Z", receivedAt: "2026-06-22T00:00:01.000Z",
  objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 4200, currency: "usd", reason: null, ...over,
})

beforeEach(() => vi.mocked(listWebhookEventsAction).mockReset())

describe("admin nav", () => {
  it("has a Webhook events item under Billing gated by BILLING_VIEW", () => {
    const billing = NAV_GROUPS.find((g) => g.key === "billing")!
    const item = billing.items.find((i) => i.href === "/admin/billing/events")
    expect(item).toBeTruthy()
    expect(item!.privilege).toBe("BILLING_VIEW")
  })
})

describe("WebhookEventsManager", () => {
  it("renders event rows after load", async () => {
    vi.mocked(listWebhookEventsAction).mockResolvedValue({
      ok: true, live: false,
      events: [row("evt_1", "charge.succeeded", "processed"), row("evt_2", "identity.verification_session.verified", "failed", { objectType: "identity.verification_session", objectId: "vs_1" })],
    } as never)
    render(<WebhookEventsManager />)
    await waitFor(() => expect(screen.getByText("charge.succeeded")).toBeInTheDocument())
    expect(screen.getByText("identity.verification_session.verified")).toBeInTheDocument()
  })

  it("filters to failed-only", async () => {
    vi.mocked(listWebhookEventsAction).mockResolvedValue({
      ok: true, live: false,
      events: [row("evt_1", "charge.succeeded", "processed"), row("evt_2", "payout.paid", "failed")],
    } as never)
    render(<WebhookEventsManager />)
    await waitFor(() => expect(screen.getByText("charge.succeeded")).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText(/failed only/i))
    expect(screen.queryByText("charge.succeeded")).not.toBeInTheDocument()
    expect(screen.getByText("payout.paid")).toBeInTheDocument()
  })

  it("expands a row to show the View in Stripe deep-link", async () => {
    vi.mocked(listWebhookEventsAction).mockResolvedValue({ ok: true, live: false, events: [row("evt_1", "charge.succeeded", "processed")] } as never)
    render(<WebhookEventsManager />)
    await waitFor(() => expect(screen.getByText("charge.succeeded")).toBeInTheDocument())
    fireEvent.click(screen.getByText("charge.succeeded"))
    const link = await screen.findByText(/View in Stripe/)
    expect((link.closest("a") as HTMLAnchorElement).href).toContain("evt_1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/stripe/webhook-ui.test.tsx`
Expected: FAIL — cannot find module `@/components/cms/billing/WebhookEventsManager` (and the nav assertion fails).

- [ ] **Step 3: Add the nav leaf**

In `lib/cms/admin-nav.ts`: add `Webhook` to the `lucide-react` import line, and add this leaf to the `billing` group's `items` array (after the "Applications" item):

```ts
      { label: "Webhook events", href: "/admin/billing/events", icon: Webhook, privilege: "BILLING_VIEW" },
```

- [ ] **Step 4: Implement the manager**

Create `components/cms/billing/WebhookEventsManager.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { listWebhookEventsAction } from "@/actions/cms/billing"
import { centsToUsd } from "@/lib/stripe/format"
import type { WebhookEventRow } from "@/lib/stripe/shapes"

const STATUSES = ["received", "processed", "ignored", "failed"] as const

function statusClass(status: string): string {
  if (status === "processed") return "border-green-700/50 bg-green-950/40 text-green-400"
  if (status === "failed") return "border-red-700/50 bg-red-950/40 text-red-400"
  if (status === "ignored") return "border-zinc-700/50 bg-zinc-900/40 text-zinc-400"
  return "border-amber-700/50 bg-amber-950/40 text-amber-400"
}

function stripeUrl(id: string, live: boolean): string {
  // Convenience deep-link to the event in the dashboard; not load-bearing.
  return `https://dashboard.stripe.com/${live ? "" : "test/"}events/${id}`
}

export function WebhookEventsManager() {
  const [events, setEvents] = useState<WebhookEventRow[]>([])
  const [live, setLive] = useState(false)
  const [failedOnly, setFailedOnly] = useState(false)
  const [typeFilter, setTypeFilter] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const res = await listWebhookEventsAction()
    if (res.ok) {
      setEvents(res.events)
      setLive(res.live)
      setBanner(null)
    } else {
      setBanner(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const counts = STATUSES.map((s) => [s, events.filter((e) => e.status === s).length] as const)
  let rows = failedOnly ? events.filter((e) => e.status === "failed") : events
  if (typeFilter) rows = rows.filter((e) => e.type.includes(typeFilter))

  if (loading) return <div className="text-zinc-500">Loading…</div>

  return (
    <div className="space-y-6">
      {banner && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {banner}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {events.length === 0 && (
        <div className="rounded-lg bg-zinc-900/60 p-3 text-sm text-zinc-400">
          No webhook events yet — the Stripe endpoint isn&apos;t connected.
        </div>
      )}

      {/* Status breakdown */}
      <section className="flex flex-wrap gap-2">
        {counts.map(([s, n]) => (
          <span key={s} className={`rounded-md border px-2 py-0.5 text-xs ${s === "failed" ? "border-red-700/50 text-red-300" : "border-zinc-800 text-zinc-400"}`}>
            {s}: {n}
          </span>
        ))}
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          placeholder="filter by type…"
          className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1 text-xs text-zinc-200"
        />
        <label className="ml-2 flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
          Failed only
        </label>
      </div>

      {/* List */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">
          Events <span className="text-sm font-normal text-zinc-500">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No events match.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((e) => (
              <li key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <button type="button" onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="w-full text-left">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{e.type}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${statusClass(e.status)}`}>{e.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                    <span>{e.objectType ?? "—"} · {e.objectId ?? "—"}</span>
                    {e.amount != null && <span>{centsToUsd(e.amount)}</span>}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{new Date(e.receivedAt).toLocaleString()}</div>
                </button>

                {expanded === e.id && (
                  <div className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                    <div>Object: <span className="break-all text-zinc-300">{e.objectType ?? "—"} / {e.objectId ?? "—"}</span> · status: {e.objectStatus ?? "—"}</div>
                    {e.reason && <div>Reason: {e.reason}</div>}
                    {e.error && <div className="text-red-400">Error: {e.error}</div>}
                    <div>Stripe created: {new Date(e.stripeCreated).toLocaleString()}</div>
                    <a href={stripeUrl(e.id, live)} target="_blank" rel="noopener noreferrer" className="inline-block underline hover:text-zinc-200">
                      View in Stripe ↗
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Implement the page**

Create `app/admin/billing/events/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { WebhookEventsManager } from "@/components/cms/billing/WebhookEventsManager"

export const dynamic = "force-dynamic"

export default async function WebhookEventsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("BILLING_VIEW")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Webhook events</h1>
      <p className="mb-6 text-sm text-zinc-500">Live Stripe events received at /api/webhooks/stripe. Read-only log; identity events feed the KYC queue.</p>
      <WebhookEventsManager />
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `CI=true npx vitest run tests/stripe/webhook-ui.test.tsx && npx tsc --noEmit`
Expected: PASS (nav + 3 manager tests) and tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/cms/admin-nav.ts components/cms/billing/WebhookEventsManager.tsx app/admin/billing/events/page.tsx tests/stripe/webhook-ui.test.tsx
git commit -m "$(printf 'feat(sp4): webhook events viewer + nav (BILLING_VIEW)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 12: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Run the entire test suite**

Run: `CI=true npx vitest run`
Expected: all green (the SP-3 baseline of 567 passed / 50 skipped + the new SP-4 tests; 0 failures).

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: exit 0. Confirm the build output does NOT flag the `stripe` SDK in any client chunk (only the route + server libs import it; `config.ts`/`shapes.ts` stay SDK-free).

- [ ] **Step 4: Prove the schema change is additive (pre-prod)**

Run: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
Expected: only `CREATE TABLE "StripeWebhookEvent"` + its indexes; no `ALTER`/`DROP` on existing tables. (Run against a non-prod DB, or review the SQL without applying. The actual `prisma db push` to prod happens during deploy, not here.)

- [ ] **Step 5: Final commit (if anything was touched) and open the PR**

```bash
git push -u origin feat/sp4-stripe-webhooks
gh pr create --title "SP-4: Stripe webhooks (receiver + universal log + identity→KYC)" --body "$(cat <<'BODY'
Signed receiver at POST /api/webhooks/stripe (public; signature is the auth), a PII-free
universal event log (StripeWebhookEvent, additive), a read-only /admin/billing/events
viewer (BILLING_VIEW), and one handler feeding KYC (identity → KycIntake, reusing SP-2's
sync via an extracted upsertIdentityIntake). Money stays human-confirmed; charge/payout/
dispute/onramp are log-only. Ships dormant until STRIPE_WEBHOOK_SECRET is set (live
activation runbook in the plan).

Spec: docs/superpowers/specs/2026-06-22-sp4-stripe-webhooks-design.md
Plan: docs/superpowers/plans/2026-06-22-sp4-stripe-webhooks.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

(Merge is the user's call — do not auto-merge.)

---

## Live activation (operational, post-merge — with the user's OK; NOT a code task)

These steps turn the dormant receiver on. They touch prod secrets and register an
outward-facing endpoint, so they run only after the user approves and the route is deployed.

1. **Deploy** the merged code (Cloud Build short-sha → bump `newTag` in `k8s/kustomization.yaml` → Flux). Until the secret is set the route 400s any caller; there is no live endpoint yet, so this is inert.
2. **Create the Stripe webhook endpoint** → URL `https://subfrost.io/api/webhooks/stripe`, `enabled_events: ["*"]` (universal log; volume is low). Either via the Stripe API using the existing `sk_live` (a one-shot script kept OUT of the repo) **or** the user/grey via the Stripe dashboard. Stripe returns the endpoint signing secret `whsec_…`.
3. **Store the secret:** `gcloud secrets create stripe-webhook-secret --project night-wolves-jogging --data-file=-` (paste the `whsec_`), then add to `k8s/external-secrets.yaml` under `spec.data`:
   ```yaml
       - secretKey: STRIPE_WEBHOOK_SECRET
         remoteRef:
           key: stripe-webhook-secret
   ```
   **Only after** the Secret Manager entry exists — ESO syncs `data` atomically, so adding the key first would fail the whole ExternalSecret (the `resend-api-key` failure mode).
4. **Roll out** so the pod picks up the env (`kubectl-io.sh -n subfrost rollout restart deploy subfrost-io`), then **validate**: send a Stripe test event (or trigger a real identity verification) → it appears in `/admin/billing/events`, and an `identity.verification_session.*` event creates/updates a row in `/admin/kyc`.

---

## Self-Review

**Spec coverage:**
- Receiver + signature verification → Tasks 3, 9. ✓
- PII-free universal log persistence (`StripeWebhookEvent`, additive) → Tasks 1, 2, 4. ✓
- Idempotency by `event.id` + failure-aware re-dispatch → Tasks 4 (recordEvent), 9 (route). ✓
- identity→KYC handler reusing SP-2 (extracted `upsertIdentityIntake`) + single fetch → Tasks 5, 6, 7. ✓
- Dispatch routing (identity mutates, rest log-only) → Task 8. ✓
- Read-only viewer `/admin/billing/events` (BILLING_VIEW) + nav → Tasks 10, 11. ✓
- Public route (no login gate) → Task 9 (no `currentUser`/privilege in the route). ✓
- Money stays human-confirmed → enforced by Task 8 (only identity.* routes to a handler). ✓
- Deep-link to Stripe, non-PII → Tasks 2 (summary), 11 (link). ✓
- Live activation + atomic-ESO gotcha → operational section (intentionally not a code task). ✓
- Verification (tsc/vitest/build/migrate-diff) → Task 12. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Every code step has complete code; every test step has complete assertions.

**Type consistency:** `WebhookEventSummary` (Task 2) consumed by `recordEvent`/`summarizeEvent` (Tasks 4, 9). `WebhookEventRow` (Task 4) consumed by `listWebhookEvents`/`listWebhookEventsAction`/manager (Tasks 4, 10, 11). `recordEvent → "process"|"replay"` matches the route's `decision` check (Task 9). `dispatchEvent → { handled: boolean }` matches the route (Task 9). `upsertIdentityIntake → "created"|"updated"` consumed by `syncStripeIdentity` (Task 5) and `onIdentityEvent` (Task 7). `MappedIdentityIntake` (existing) is the shared mapped type. `liveIdentityVerification(id) → StripeIdentityVerification | null` consumed by the handler (Task 7). All consistent.
