# Documents (e-sign) + delegated reviewer links — design

**Date:** 2026-06-23
**Source:** ported from `subfrost-admin` (`apps/admin-web`, Next.js pages-router +
JSON store) into `subfrost.io` (App Router + Prisma + server actions + GCS).

Closes the two remaining "work we already did in admin that wasn't here yet"
gaps from the migration brief:

- **A. Document sender / e-sign (Documenso)** — the legal-contract / invoicing /
  SAFE-aggregation surface. Ported from admin's `lib/esign.ts`,
  `lib/documenso.ts`, `lib/esign-types.ts`, `/documents/*`, and the webhook.
- **B. External-reviewer compliance flow** — delegated, password-protected,
  scoped, expiring links for outside AML reviewers. Ported from admin's
  `lib/reviews.ts` + `/compliance/*`.

## What changed vs. the source

| Concern | subfrost-admin | subfrost.io (this port) |
|---|---|---|
| Persistence | JSON file store (`.data/*.json`) | Prisma models `Envelope`, `ReviewLink`, `ReviewSession` |
| PDF bytes | data PVC `uploads/` | private GCS objects (`documents/<id>.pdf`), streamed only via a gated route |
| API surface | `/api/*` route handlers | server actions (`actions/cms/documents.ts`, `actions/cms/reviews.ts`) + 3 route handlers (upload, attachment, webhook) |
| Auth | Cloudflare Access + JSON RBAC | `currentUser()` + IAM privileges (`documents.read/write`, `compliance.reviews`) |
| Audit | `lib/audit.ts` JSON | `lib/cms/audit.ts` (Prisma `AuditLog`) |

The transport client (`lib/esign/documenso.ts`), the client-safe types
(`lib/esign/types.ts`), and the UI helpers (`lib/esign/document-ui.ts`) are
carried over near-verbatim. The state machine (`lib/esign/store.ts`) keeps the
exact recipient-rollup / terminal-stickiness / webhook-dedup logic; only the
persistence calls were re-targeted to Prisma.

## Data model

- `Envelope` — `kind`/`status` hold the lowercase string vocabularies from
  `lib/esign/types.ts` (state machine is the source of truth, not a Prisma
  enum); `recipients`/`attachment`/`fields` are JSON; `appliedEventIds` bounds
  webhook replay-dedup; `payeeId` optionally links the paperwork to a `Payee`.
- `ReviewLink` / `ReviewSession` — bcrypt-hashed link password, scoped
  (`compliance-full | fincen-only | kyc-only`), TTL-bounded; sessions carry a
  sha-256 cookie hash + salted IP hash and a `pagesViewed` trail.

Applied to the DB via `prisma db push` on deploy (repo has no migrations dir).

## Integration with payee profiles

`loadPayeeProfile()` now also loads the payee's envelopes, surfaced as a "Signed
paperwork" section on `/admin/financials/payees/[id]`. This is the live
realization of the brief's "associate each DIESEL transfer to a person/identity
and see the legal paperwork they've signed" — the payee profile already linked
user + KYC identity + contract; it now links real e-sign envelopes too.

## Security notes

- Document PDFs are **private** GCS objects (signatures + PII) served only
  through `app/api/admin/documents/[id]/attachment` after the `documents.read`
  gate — never a public URL (unlike invoice/avatar uploads).
- The Documenso webhook (`app/api/webhooks/documenso`) is public; security is the
  constant-time `X-Documenso-Secret` compare + body-size cap + replay-dedup.
- Reviewer links live under the public `/compliance/*` path (outside the `/admin`
  middleware gate); the review-session cookie is the only gate and is scoped to
  `path=/compliance`. Revoking a link immediately kills its live sessions.

## Follow-ups (intentionally out of scope here)

- Drag-drop PDF field placement (`PdfFieldEditor`) — envelopes send without
  pre-placed fields for now (schema already supports `fields[]`).
- Template management UI (templates are read from Documenso; creation is done in
  Documenso itself).
- Documenso credential + webhook-secret wiring in k8s/Secret Manager (mock mode
  until then).
