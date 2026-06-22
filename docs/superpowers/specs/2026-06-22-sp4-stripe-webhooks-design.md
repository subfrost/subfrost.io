# SP-4 — Stripe webhooks (design)

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branch: `feat/sp4-stripe-webhooks`

## Goal

Add a **signed Stripe webhook receiver** that ingests events in real time, persists a
**universal, PII-free event log** (every product: charge / dispute / payout / on-ramp /
identity), and runs **one domain handler** that auto-feeds the KYC queue
(`identity.verification_session.*` → `KycIntake` upsert), replacing SP-2's manual
"Sync from Stripe Identity" button with push. This is the push-based ingestion that
SP-2 and SP-3 both explicitly deferred to SP-4 (`needs STRIPE_WEBHOOK_SECRET`).

This is a web-admin / data surface, **not** on-chain.

## Non-goals (explicitly out of scope)

- **No money mutation from webhooks.** `StripeMoneyIntent` stays human-confirmed
  (QUEUED/CONFIRMED/CANCELED); the directive is "money not touched, movement = queue +
  human confirm". `charge.*` / `payout.*` / `dispute.*` events appear in the log
  (observability) but never auto-confirm or auto-mutate money state.
- **No bespoke on-ramp / charge / payout handlers.** SP-3 is a no-DB passthrough; a
  dedicated on-ramp handler would have nothing to persist to (SP-3 already rejected the
  snapshot table). These events are covered by the universal log; only identity mutates.
- **No raw payload / no PII in our DB.** We store a non-PII summary only (no
  `verified_outputs`, no card PAN). Full detail = deep-link to the Stripe dashboard.
- **No reprocessing UI in v1.** Failed events are visible in the log and Stripe's retry
  re-dispatches them; the SP-2 manual sync remains the KYC fallback. A reprocess action
  (`BILLING_EDIT`) is YAGNI for now.
- **No alerting / notifications.** Surfacing disputes/failures as alerts is a later
  concern (Resend is broken in prod anyway). v1 is a read-only viewer.
- **No customer-facing flows.** We only *receive* events; we never create verification
  sessions or on-ramp sessions.

## Decisions (locked during brainstorming)

1. **One SP-4** = receiver + signature verification + idempotent event persistence +
   read-only universal viewer + the identity→KYC handler. Cohesive single cut because the
   only new mutating handler reuses logic SP-2 already wrote.
2. **Persist events** in a new `StripeWebhookEvent` table (additive, safe `db push`).
   Webhooks are push (we can't re-query arbitrary past events beyond Stripe's ~30d
   `events.list`); a durable, filterable, fast log is the value, and handler idempotency
   needs a per-event record. The "passthrough / display-only" alternative was rejected
   for this reason.
3. **Persistence depth = metadata + non-PII summary + deep-link.** Store
   id/type/createdAt/status/error + a small non-sensitive summary (object id, amount in
   cents, object status, dispute/rejection reason). **Never** `verified_outputs` (identity
   PII) or card PAN. This avoids leaking KYC PII (which lives behind `AML_VIEW`) into a
   `BILLING_VIEW`-gated log, and matches the codebase philosophy (SP-2 "never the image
   files"; SP-3 deep-links instead of duplicating sensitive data).
4. **Receiver is public, secured by signature.** The Stripe-facing route has **no** login
   gate (Stripe calls it unauthenticated); the security boundary is
   `stripe.webhooks.constructEvent`. It is the single `/admin`-adjacent surface outside the
   auth gate, by design.
5. **Idempotency by `event.id`**, with failure-aware re-dispatch (see "Idempotency &
   retries").
6. **Live activation is deferred** and does not block the build. We already hold `sk_live`,
   so the webhook endpoint (and its `whsec_`) can be created via the Stripe API or the
   dashboard once the receiver is deployed — no dependency on the grey.

## Architecture (mirrors the SP-1 `lib/stripe/` boundary)

```
Stripe (signed POST)
  └─ app/api/webhooks/stripe/route.ts        runtime "nodejs"; raw body via req.text(); PUBLIC*
        1. constructWebhookEvent(rawBody, sig)   bad sig / missing secret → 400
        2. summarizeEvent(event)                 PURE, non-PII summary (unit-tested)
        3. recordEvent(event, summary)           upsert StripeWebhookEvent by event.id (idempotent)
        4. dispatchEvent(event)                  identity.* → KYC handler; else → "ignored" (log only)
        5. return 200 { received:true }          handler failure → status "failed" + 500 (Stripe retries)
  lib/stripe/webhooks/
     ├─ verify.ts      constructWebhookEvent(rawBody, sig) — getStripeClient().webhooks.constructEvent
     │                 + process.env.STRIPE_WEBHOOK_SECRET (throws on bad sig / missing secret)
     ├─ summary.ts     summarizeEvent(event) -> WebhookEventSummary  (PURE; no SDK; no PII)
     ├─ store.ts       recordEvent(event, summary) / markProcessed(id) / markIgnored(id) / markFailed(id, error)
     ├─ dispatch.ts    dispatchEvent(event) -> switch(type){ identity.verification_session.* -> onIdentityEvent; default -> ignored }
     └─ handlers/identity.ts   onIdentityEvent(event) -> liveIdentityVerification(id) -> mapIdentityVerification -> upsertIdentityIntake
  lib/kyc/sync.ts                       REFACTOR: extract upsertIdentityIntake(v) (the loop body);
                                        bulk syncStripeIdentity() AND the webhook handler both call it.
  lib/stripe/source/live/identity.ts    (+ liveIdentityVerification(id): single fetch, expands last_verification_report)
  lib/stripe/shapes.ts                  (+ WebhookEventRow, WebhookEventSummary — client-safe, SDK-free)
  actions/cms/billing.ts                (+ listWebhookEventsAction(filter?), gated BILLING_VIEW, pure read)
  app/admin/billing/events/page.tsx     (server component; if(!user) redirect("/admin/login"))
  components/cms/billing/WebhookEventsManager.tsx   (client; read-only; mobile-first)
  lib/cms/admin-nav.ts                  (+ "Events" item in the Billing group, BILLING_VIEW)
  prisma/schema.prisma                  (+ model StripeWebhookEvent — additive)
  k8s/external-secrets.yaml             (+ STRIPE_WEBHOOK_SECRET — added ONLY after the secret exists in Secret Manager**)
```

\* **Public by design** — the route has no login gate; signature verification is the auth
(Stripe calls it unauthenticated).

\*\* **Atomic-ESO gotcha:** External Secrets syncs `data` atomically — adding the entry
before the secret exists in Secret Manager would fail the WHOLE ExternalSecret (the exact
failure `resend-api-key` caused). So the `external-secrets.yaml` edit happens only after
`gcloud secrets create stripe-webhook-secret`.

Rationale: the Stripe **read** (`liveIdentityVerification`) lives under
`lib/stripe/source/live/*` exactly like the other surfaces (identical boundary/gating/degrade
story; client-safe `config.ts`/`shapes.ts` stay SDK-free). The **summary** is a pure function
(unit-testable without the SDK). The **mutation** reuses `lib/kyc/*` (KYC owns its model). The
route is the only ingestion entry point; `actions/cms/billing.ts` is the only viewer entry point
and enforces `BILLING_VIEW`.

## Data model (additive → safe `prisma db push`)

```prisma
model StripeWebhookEvent {
  id            String   @id                       // Stripe event id (evt_...) = natural PK → idempotency
  type          String                             // "identity.verification_session.verified", "charge.succeeded"...
  apiVersion    String?                            // event.api_version
  stripeCreated DateTime                           // event.created (epoch → DateTime)
  receivedAt    DateTime @default(now())
  status        String   @default("received")      // received | processed | ignored | failed
  handled       Boolean  @default(false)           // did a domain handler act on it?
  error         String?                            // handler error message (when failed)
  // non-PII summary (NEVER verified_outputs / PAN):
  objectType    String?                            // event.data.object.object e.g. "charge","identity.verification_session","payout"
  objectId      String?                            // the object's id
  objectStatus  String?                            // object.status (non-PII)
  amount        Int?                               // cents, when present (charge/payout/onramp source amount)
  currency      String?
  reason        String?                            // dispute reason / on-ramp rejection reason (non-PII)

  @@index([type])
  @@index([receivedAt])
  @@index([status])
}
```

No other models change. No enum changes.

## Receiver flow (`app/api/webhooks/stripe/route.ts`)

`export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` (needs the
Node crypto path and the exact raw bytes; no static optimization).

1. Read the **raw** body with `await req.text()` and the `stripe-signature` header. (Raw
   bytes are required — `constructEvent` recomputes the HMAC over them.)
2. `constructWebhookEvent(rawBody, sig)`:
   - `STRIPE_WEBHOOK_SECRET` unset → throw → route returns **400** (can't verify; pre-activation
     this path is test-only since no live endpoint exists yet).
   - signature invalid → `constructEvent` throws → route returns **400**.
   - valid → returns the typed `Stripe.Event`.
3. `summarizeEvent(event)` → non-PII `WebhookEventSummary`.
4. `recordEvent(event, summary)` (idempotent upsert by `event.id`):
   - **New** id → create row (`status:"received"`), continue to dispatch.
   - **Existing** row with `status ∈ {processed, ignored}` → it's a completed replay →
     **short-circuit: return 200** without re-dispatching.
   - **Existing** row with `status == "failed"` (a prior attempt failed; Stripe is retrying)
     → continue to dispatch (re-attempt).
5. `dispatchEvent(event)`:
   - `type.startsWith("identity.verification_session.")` → `onIdentityEvent(event)` →
     `markProcessed(id)` (`handled:true`, `status:"processed"`).
   - otherwise → `markIgnored(id)` (`status:"ignored"`, `handled:false`) — log only.
   - handler throws → `markFailed(id, error)` (`status:"failed"`) → route returns **500**
     so Stripe retries later (the retry re-dispatches because the row is `failed`).
6. Success → return **200** `{ received: true }`.

The event row is written before dispatch, so an event is never lost even if the handler
fails; failed events are visible in the log and the SP-2 manual sync is the KYC fallback.

## Identity handler & KYC reuse

`lib/kyc/sync.ts` refactor (improve the code we touch): extract the loop body of
`syncStripeIdentity()` into

```ts
export async function upsertIdentityIntake(v: MappedIdentity): Promise<"created" | "updated">
```

(`MappedIdentity` = the return type of `mapIdentityVerification`). `syncStripeIdentity()`
becomes: list → `mapIdentityVerification` → `upsertIdentityIntake` per row (behavior
identical; existing SP-2 tests stay green). The upsert rules are unchanged: create new,
preserve human dispositions, refresh `providerData`/status/risk only when no disposition.

`lib/stripe/source/live/identity.ts` gains `liveIdentityVerification(id: string)`: fetches a
single `VerificationSession` with `last_verification_report` expanded (mirrors the bulk
`liveIdentityVerifications`, same normalization, **no `files`/images**).

`lib/stripe/webhooks/handlers/identity.ts`:
```ts
export async function onIdentityEvent(event: Stripe.Event): Promise<void> {
  const id = (event.data.object as { id: string }).id           // vs_...
  const v = await liveIdentityVerification(id)                  // expanded report, no images
  if (!v) return                                                // unavailable/degraded → no-op
  await upsertIdentityIntake(mapIdentityVerification(v))
}
```

Idempotent (upsert by `externalId`), human dispositions preserved — identical guarantees to
the SP-2 button, now triggered per event.

## Idempotency & retries (the subtle part)

`event.id` is the primary key, so Stripe's at-least-once delivery is naturally deduped.
Completed events (`processed`/`ignored`) short-circuit to 200 on replay (no double-apply).
Only `failed` events are re-dispatched on Stripe's retry, and a handler failure returns 500
to enlist that retry. This is the standard webhook pattern; the extra branch is a few lines.
Worst case (a persistent handler bug) is bounded noise — the event is stored, visible, and
recoverable via the manual SP-2 sync.

## Viewer UI (`WebhookEventsManager.tsx`, read-only, mirrors `OnrampManager`)

- **Header counters:** total + a status breakdown (received / processed / ignored / failed),
  `failed` emphasized.
- **Controls:** filter by event `type` (or type prefix) + a **"failed only"** toggle.
- **List** (most-recent first), each row: `receivedAt` · type · status badge · object summary
  (`objectType` + truncated `objectId`) · amount when present.
- **Expandable detail** (click a row, mirrors `KycManager`/`OnrampManager`): full `objectId`,
  `objectStatus`, amount/currency, `reason`, `handled`, `error` (if failed), and a **"View in
  Stripe"** deep-link to `https://dashboard.stripe.com/{test/}events/{id}` (`test/` prefix when
  `!isLive()`; the link is a convenience, not load-bearing — same caveat as SP-3).
- **Empty state:** before live activation the table is empty with a non-blocking notice
  ("No webhook events yet — the Stripe endpoint isn't connected"), consistent with the demo/degrade
  banners elsewhere.

## Gating, errors, degrade

- **Route:** no `currentUser`/privilege check — signature verification is the gate. The handler
  runs server-side with no user context (audited via the event row's `handled`/`status`, not
  `AuditLog`).
- **Viewer:** `listWebhookEventsAction` calls `actor("BILLING_VIEW")` (rejects otherwise) — no
  audit for a pure read (consistent with the other billing list actions). Page redirects to
  `/admin/login` when unauthenticated.
- The identity source read degrades exactly like SP-2/SP-3 (`liveIdentityVerification` returns
  `null` when Identity is unavailable → handler no-ops, event recorded as `processed`/`ignored`,
  no throw, no 500 storm).

## Testing (TDD; Stripe SDK mocked — no sandbox)

- **`summarizeEvent` (pure):** charge event → `{objectType:"charge", objectId, amount, currency,
  objectStatus}`; payout/on-ramp → amount; dispute → `reason`; **identity event → asserts NO PII**
  (no name/DOB/`verified_outputs` anywhere in the summary).
- **`constructWebhookEvent`:** mock `getStripeClient().webhooks.constructEvent`; bad signature →
  throws → route returns 400; valid → returns the event. (Vitest hoisting: `vi.fn()` inline +
  `vi.mocked()`, per `tests/cms/kyc-manager.test.tsx`.)
- **Idempotency:** same `event.id` posted twice → handler runs once; second call short-circuits
  to 200 (row already `processed`).
- **Dispatch routing:** `identity.verification_session.verified` → `onIdentityEvent` called, row
  `processed`+`handled`; `charge.succeeded` → `ignored`, handler NOT called.
- **Handler failure path:** `onIdentityEvent` throws → row `failed` + route returns 500; a
  subsequent retry (same id, row `failed`) re-dispatches.
- **`upsertIdentityIntake` (single-session):** created / updated / preserves human disposition —
  inherits the SP-2 sync assertions, now at the extracted-function level.
- **Action gating:** `listWebhookEventsAction` rejects without `BILLING_VIEW`.
- **Route happy path:** valid signed event → 200 `{received:true}`; ignored type → 200.

## Live activation (deferred — with the user's OK; does NOT block the build)

1. **Deploy** the receiver (merge → Cloud Build short-sha → bump `newTag` → Flux). Until the
   secret is set, the route returns 400 to any call; there is no live endpoint yet, so this is inert.
2. **Create the Stripe webhook endpoint** → URL `https://subfrost.io/api/webhooks/stripe`,
   `enabled_events: ["*"]` (universal log; volume is low). Either via the Stripe API using `sk_live`
   (a one-shot script, kept out of the repo) **or** the user/grey via the dashboard. Stripe returns
   the endpoint `secret` (`whsec_...`).
3. **Store the secret:** `gcloud secrets create stripe-webhook-secret --project night-wolves-jogging
   --data-file=-`, then add the `STRIPE_WEBHOOK_SECRET` entry to `k8s/external-secrets.yaml`
   (key `stripe-webhook-secret`) — **only after** the secret exists in Secret Manager (atomic-ESO gotcha).
4. **Roll out** so the pod picks up the env, then **validate** with a Stripe test event → it appears
   in `/admin/billing/events`.

## Verification

`tsc --noEmit` = 0; `vitest run` green; `next build` exit 0 (Stripe SDK stays out of the client
bundle — only `client.ts`, `source/live/*`, and the server route import the SDK; `config.ts`/
`shapes.ts` remain SDK-free). Additive `prisma db push` (`migrate diff` proves additive before
prod, per the established flow). No deploy in SP-4 itself unless requested — it ships behind the
existing `BILLING_VIEW` gate, dormant until the webhook secret is set.
