# SP-2 — Stripe Identity → KYC review queue (design)

Date: 2026-06-21
Status: approved (brainstorming) — pending spec review
Branch: `feat/sp2-stripe-identity`

## Goal

Bring Stripe Identity verification sessions/results into the existing admin KYC
review queue, so compliance operators see real identity verifications (instead of
an empty queue) and disposition them. This is the first live source wired into the
KYC module (the `KycProvider` enum already has `STRIPE_IDENTITY`; `KycIntake` was
built with an `externalId` field "for once a live source is wired").

Non-goals (explicitly out of scope):
- **Webhooks** — push-based ingestion is **SP-4** (needs `STRIPE_WEBHOOK_SECRET`).
  SP-2 ships a manual "Sync from Stripe Identity" button; the design must work
  without webhooks.
- **Creating verification sessions** from the admin (that is a customer-facing
  flow). SP-2 only *reads* existing sessions.
- **Document/selfie images** — we pull verdict + extracted fields only, never the
  image `files` (avoids serving sensitive PII images).
- Other providers (Persona/Sumsub) — the enum keeps them; only `STRIPE_IDENTITY`
  gets a live source here.

## Decisions (locked during brainstorming)

1. **Integration model = sync/import into the DB.** A "Sync from Stripe Identity"
   button (webhook later in SP-4) pulls sessions and upserts them as `KycIntake`
   rows (idempotent by `externalId`). The existing review queue + append-only
   `KycDisposition` flow is reused unchanged.
2. **Detail depth = summary + verdict + extracted fields, NO images.** Pull the
   `VerificationSession` + its `VerificationReport` (verdict, check outcomes,
   extracted document fields); never the image files.
3. **Verdict ↔ human = human-in-the-loop always.** The Stripe verdict pre-fills
   context but never substitutes a human decision; every intake still requires a
   human `KycDisposition` as the official append-only record.
4. **riskScore is derived** from the Stripe verdict/checks (Stripe gives no risk
   score).
5. **Status semantics (refined):** on sync, intakes enter **`PENDING`**; the
   Stripe verdict is shown as its own badge. `IN_REVIEW`/`APPROVED`/`REJECTED`
   remain *human-only* states (set via dispositions) — the sync never writes them,
   so the existing meaning of `IN_REVIEW` ("a human flagged for review") is not
   overloaded.

## Architecture (mirrors the SP-1 `lib/stripe/` boundary)

```
Stripe API
  └─ lib/stripe/source/live/identity.ts   (server-only; getStripeClient(); degradeIfUnavailable)
        ├─ lists VerificationSessions (paginated) + expands last_verification_report
        └─ returns StripeIdentityVerification[]  (normalized; NO file/image data)
  lib/stripe/shapes.ts                     (+ StripeIdentityVerification type, client-safe)
        │
  lib/kyc/sync.ts                          (NEW; domain) syncStripeIdentity():
        ├─ calls the identity source
        ├─ maps each verification -> KycIntake upsert (by externalId, idempotent)
        ├─ preserves human dispositions (see Upsert rules)
        └─ returns { created, updated, skipped }
        │
  actions/cms/kyc.ts                        (+ syncStripeIdentityAction, gated MANAGE_AML, audited)
        │
  components/cms/KycManager.tsx             (+ "Sync from Stripe Identity" button;
                                             + expandable per-intake detail panel from providerData)
```

Rationale: the **read** of Stripe lives under `lib/stripe/source/live/*` exactly
like the billing surfaces (so the boundary/gating/degrade story is identical and
client-safe `config.ts` stays SDK-free). The **mapping + persistence** lives in
`lib/kyc/*` (KYC owns its data model). `actions/cms/kyc.ts` is the only entry
point and enforces `MANAGE_AML`.

## Data model changes (additive → safe `prisma db push`)

`KycIntake`:
- `externalId String? @unique` — add `@unique` so the sync can upsert idempotently
  by the Stripe session id. Existing rows have `externalId = null`; Postgres allows
  multiple NULLs under a unique index, so this is non-breaking.
- `providerData Json?` — NEW, nullable. Holds the synced summary so the queue is
  self-contained (no Stripe round-trip to render the list/detail):
  ```jsonc
  {
    "verdict": "verified" | "processing" | "requires_input" | "canceled",
    "lastError": { "code": "...", "reason": "..." } | null,
    "document": { "type": "driving_license|passport|id_card|null", "country": "US|null" },
    "extracted": { "firstName": "...", "lastName": "...", "dob": "YYYY-MM-DD|null" }
  }
  ```

No other models change. No enum changes (`KycProvider.STRIPE_IDENTITY` already
exists; statuses reuse `KycStatus`).

## Sync flow & mapping

`syncStripeIdentity()`:
1. List `VerificationSession`s (paginated; `limit` per page, follow `has_more`).
   For each, read the `last_verification_report` (expanded) for verdict + checks +
   extracted fields. **No `files`.**
2. Map each session → `KycIntake` shape:
   - `externalId` ← `vs.id`
   - `customerName` ← `verified_outputs` (first + last) › report document name ›
     `metadata.name` › `"(unknown)"`
   - `customerEmail` ← `related_customer` email › `metadata.email` › `""`
   - `provider` ← `STRIPE_IDENTITY`
   - `submittedAt` ← `vs.created`
   - `providerData` ← `{ verdict, lastError, document, extracted }`
   - `riskScore` (derived) and `status` (only when no human disposition yet):

   | `vs.status`      | status (no disposition yet) | riskScore |
   |------------------|-----------------------------|-----------|
   | `verified`       | PENDING                     | LOW       |
   | `processing`     | PENDING                     | MEDIUM    |
   | `requires_input` | PENDING                     | HIGH      |
   | `canceled`       | PENDING                     | MEDIUM    |

3. **Upsert rules (idempotent + preserve human decisions):**
   - No existing row for `externalId` → **create** (status/risk per table). `created++`
   - Existing row **with ≥1 disposition** → only refresh `providerData` (+ name/email
     if newly available); **do NOT touch status/riskScore** (never overwrite a human
     decision). `updated++`
   - Existing row **with no disposition** → refresh `providerData`, status, riskScore.
     `updated++`
4. Returns `{ created, updated, skipped }` for the action to audit + surface.

## Gating, errors, degrade

- Gated by `isLive()` (`STRIPE_SECRET_KEY`, already set in prod via SP-1). If Identity
  is not enabled on the Stripe account, `degradeIfUnavailable` makes the list read
  return `[]` → the sync reports 0 and the UI shows a non-blocking notice (same
  pattern as Treasury/Issuing degrading). No dead screen, no 500.
- A per-session report fetch failure is swallowed for that session: keep the summary
  (verdict from the session), skip the extracted detail.
- The action maps `KycError`/`BillingError` to `{ ok:false, error }`; unexpected
  errors bubble (the queue already renders an error banner).

## UI

`KycManager.tsx`:
- New **"Sync from Stripe Identity"** button next to "Run OFAC rescreen". On click:
  call `syncStripeIdentityAction()`, then refetch; show `"Synced: N new, M updated"`
  (or the degrade notice).
- Per-intake **expandable detail** (click a row to expand): renders from
  `providerData` — verdict badge, failure reason (if any), document type/country,
  extracted name/DOB. No images. Existing list fields (name/email/risk/status badges,
  disposition buttons) unchanged.

## Testing (TDD; Stripe SDK mocked — no sandbox)

- **Mapping** (`lib/kyc/sync` unit, `vi.mock('@/lib/stripe/source/live/identity')` or
  `@/lib/stripe/client`): each `vs.status` → expected status + riskScore + providerData.
- **Idempotency / preservation:** second sync of the same `externalId` creates no
  duplicate; a row with a disposition keeps its human status/risk on re-sync; a row
  without a disposition gets refreshed.
- **Action gating:** `syncStripeIdentityAction` rejects without `MANAGE_AML`; audits
  on success.
- **Degrade:** identity source unavailable → sync returns zeros, no throw.

## Verification

`tsc --noEmit` = 0; `vitest run` green; `next build` exit 0. Additive `db push`
(`migrate diff` to prove additive before pushing to prod, per the established flow).
No deploy in SP-2 itself unless requested — ships behind the existing MANAGE_AML gate
and the live key already present.
