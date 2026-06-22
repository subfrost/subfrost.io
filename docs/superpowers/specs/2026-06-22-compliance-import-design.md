# Compliance import (MTL + FinCEN) subfrost-admin → subfrost.io — design

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branch: `feat/compliance-import`

## Goal

Import the compliance data from the legacy **subfrost-admin** JSON file store into
subfrost.io's Postgres, **idempotently**, mirroring the FUEL import (2026-06-21).
This is the FinCEN/AML half of flex's **Frente 2** data imports. It is a **data
migration**: the target tables (`MtlEntry`, `FincenDraft`, `FincenSubmission`)
already exist in prod, so there is **no schema change**. Web-admin/data only — not
on-chain.

## Scope

**In scope:**
- **MTL** — `mtl-state` collection → `MtlEntry`.
- **FinCEN** — `fincen-form-107-draft` + `fincen-sar-drafts` + `fincen-ctr-drafts`
  → `FincenDraft`; `fincen-submissions` → `FincenSubmission`.

**Explicitly OUT of scope (decided during brainstorming — recorded here):**
- **KYC.** The subfrost-admin JSON store has **no KYC collection** (no `kyc.ts`; KYC
  only appears in audit/reviews scope strings). subfrost.io's `KycIntake` is
  populated **exclusively by the SP-2 Stripe Identity sync** — importing legacy KYC
  would duplicate/pollute the Stripe-owned table. Left out deliberately.
- **Reviews / review-links / review-sessions** (`reviews.ts`). These are the
  delegated-reviewer-link feature; there is **no target table** in subfrost.io.
- **Audit log** (`audit.ts`). Operational audit trail, a separate system from the
  compliance records; not a compliance import target.

If any of these is wanted later, it is a separate spec.

## Acquisition (the one new piece vs FUEL)

The source is **JSON files in the admin-web PVC** (`admin-web-data`, mounted at
`/var/lib/admin-web/data/<collection>.json`) in the **`subfrost-admin` GKE cluster**
(project `night-wolves-jogging`, us-central1-a). Confirmed during exploration:

- The io service account **reaches the `subfrost-admin` cluster's API server**
  (`kubectl get pods -n admin` works — pod `admin-web-…` is Running with the PVC).
- **`kubectl exec` / `logs` / `cp` are blocked** — every node-proxied call returns
  `Internal error … 10250 … "No agent available"` (GKE Konnectivity has no agent
  path from this external client). Only API-server object ops (get/apply/create/
  delete) work.

**Approach A1 (recommended): ephemeral in-cluster Job + ConfigMap roundtrip.**
1. `kubectl auth can-i` preflight (create job/configmap/role/rolebinding in `admin`).
   If denied → fall back to A2/A3.
2. Apply a short-lived Job (a `kubectl`-capable image, e.g. `bitnami/kubectl`) with a
   dedicated ServiceAccount + Role (create/get configmaps) + RoleBinding, **pinned to
   admin-web's node** (`nodeName` from `kubectl get pod admin-web-… -o wide`, since
   the PVC is RWO = single-node; multiple pods on the same node may mount it),
   mounting `admin-web-data` **read-only** at `/data`. The Job runs
   `kubectl create configmap compliance-dump -n admin --from-file=/data` (the
   compliance JSON is small — well under the 1 MB ConfigMap limit).
3. Read it back via the API server: `kubectl get configmap compliance-dump -n admin
   -o json`, parse `.data`, write each `<collection>.json` to
   `C:\Alkanes Geral Dev\.adminenv-extracted\dump\`.
4. **Cleanup:** delete the Job, ConfigMap, RoleBinding, Role, ServiceAccount.

Reaching the cluster reuses the io token + a per-cluster endpoint/CA (the
`subfrost-admin` endpoint `34.132.22.220` + its CA were already fetched to
`.ioenv-extracted/admin-endpoint.txt` / `admin-ca.crt`). The dump script wraps this
as an `kubectl-admin` invocation analogous to `kubectl-io.sh`.

**Fallbacks:**
- **A2 — Job → GCS.** Job (cloud-sdk image, admin workload-identity GSA) uploads
  `/data/*.json` to a GCS bucket; download with the io token. Use if data > 1 MB or
  ConfigMap RBAC is denied.
- **A3 — Vitor exports manually** (he has admin access). Last resort.

The snapshot files in `.adminenv-extracted/dump/` are the durable, inspectable
record (and decouple acquisition from the loader — the loader only ever reads
snapshots, exactly like FUEL).

## Source → target mapping

### MTL (`mtl-state` — singleton `{ entries: MtlEntry[] }`)

Source entry: `{ state(2), name, status(kebab), nextFilingDue?, portalUrl?, notes? }`.
Target `MtlEntry`: `state @id`, `name`, `status` (enum), `nextFilingDue?`,
`portalUrl?`, `notes?`.

- **Status map** (kebab → SCREAMING_SNAKE, deterministic = uppercase + `-`→`_`):
  `agent-of-stripe→AGENT_OF_STRIPE`, `registered→REGISTERED`,
  `filed-pending→FILED_PENDING`, `exempt→EXEMPT`, `not-yet-needed→NOT_YET_NEEDED`,
  `needs-filing→NEEDS_FILING`.
- **Idempotent by `state` (PK).** Seed the 51 jurisdictions (reuse the io
  `STATE_SEED` / `seedStates` shape), then upsert each source entry's
  `name/status/nextFilingDue/portalUrl/notes`. `prisma.mtlEntry.upsert({ where:{state} })`.

### FinCEN drafts (3 collections → `FincenDraft`)

Source `DraftRecord<T>`: `{ id, type("form-107"|"sar"|"ctr"), data, updatedAt, updatedBy }`.
Target `FincenDraft`: `id`, `type` (enum FORM107|SAR|CTR), `data` (Json), `updatedBy`,
`createdAt`, `updatedAt`.

- **Type map:** `form-107→FORM107`, `sar→SAR`, `ctr→CTR`.
- **Idempotent by source `id`** — `prisma.fincenDraft.upsert({ where:{id: sourceId},
  create:{ id: sourceId, type, data, updatedBy }, update:{ data, updatedBy } })`.
  Preserving the source id keeps re-runs stable AND preserves the draft→submission FK.
- Collections: `fincen-form-107-draft` (singleton), `fincen-sar-drafts`,
  `fincen-ctr-drafts` (arrays).

### FinCEN submissions (`fincen-submissions` → `FincenSubmission`)

Source `SubmissionRecord`: `{ id, draftId, type, submittedAt, submittedBy,
trackingId, status("queued"|"accepted"|"rejected"), message? }`.
Target `FincenSubmission`: `id`, `draftId` (FK), `type` (enum), `trackingId`,
`status` (enum QUEUED|ACCEPTED|REJECTED), `message?`, `submittedBy`, `submittedAt`.

- **Status map:** `queued→QUEUED`, `accepted→ACCEPTED`, `rejected→REJECTED`.
- **Idempotent by source `id`**, preserving `draftId` (FK to the draft inserted with
  its source id above). Load drafts **before** submissions so the FK resolves.

### Validation

In `--dry-run`, validate each draft's `data` against the io zod schemas
(`Form107Schema` / `SarSchema` / `CtrSchema` in `lib/fincen/schemas.ts`) and **warn**
on mismatch — but the load stores the raw Json regardless (the target column is Json;
the admin already validated on write; the UI re-validates on read/edit). A hard-fail
on validation would block importing a slightly-drifted-but-real draft; warn instead.

## Components (mirror the FUEL import)

- `scripts/dump-admin-compliance.ts` — acquisition (A1 Job→ConfigMap roundtrip),
  writes snapshots to `.adminenv-extracted/dump/<collection>.json`.
- `lib/mtl/migrate.ts` — pure `parseMtlState(json)` + `loadMtl(entries)` (idempotent
  prisma upsert by state). Unit-testable without a DB for the parse/map half.
- `lib/fincen/migrate.ts` — pure `parseFincen(snapshots)` + `loadFincen(drafts,
  submissions)` (idempotent upsert by id; drafts before submissions). Unit-testable.
- `scripts/migrate-compliance-data.ts` — orchestrator: `--dry-run` (parse + map +
  validate, no DB) and real load (local `cloud-sql-proxy` to the PUBLIC io
  `subfrost-postgres` + `DATABASE_URL` from the `subfrost-io-secrets` k8s secret).
- Tests: `tests/mtl/migrate.test.ts` + `tests/fincen/migrate.test.ts`, mirroring
  `tests/fuel/migrate.test.ts` — cover status/type maps, idempotency (re-run = no-op),
  draft→submission ordering, validation warnings.
- Verify: a `.git/sdd/verify-compliance.mts` (counts per table + spot-check a Form 107)
  + the live admin surfaces (`/admin/mtl`, `/admin/fincen` — read the tables directly,
  no redeploy).

## Data flow

```
admin PVC (subfrost-admin cluster)
  → [A1 Job mounts PVC → ConfigMap → kubectl get cm]  (dump-admin-compliance.ts)
  → snapshot JSON in .adminenv-extracted/dump/
  → --dry-run: parse + map + validate (no DB)
  → load: prisma upsert into subfrost-postgres (proxy + DATABASE_URL)  [drafts before submissions]
  → verify: counts + live /admin/mtl + /admin/fincen
```

## Deploy & gotchas

- **Data-only — no Flux/deploy** needed (like FUEL); the import just writes rows and
  the live `/admin/*` surfaces read the tables directly. But the **CODE** (migrate
  libs + scripts + tests) ships via **PR** (branch `feat/compliance-import` → PR →
  merge).
- **Load target** is the PUBLIC io `subfrost-postgres` → local `cloud-sql-proxy`
  connects on :5432; `DATABASE_URL` from k8s secret `subfrost-io-secrets`.
- `npx tsx` works here. Scripts importing `@prisma/client` run from inside the repo.
  Windows: Bash tool for heredoc/POSIX; `MSYS_NO_PATHCONV=1` when passing container
  paths like `/var/lib/...` through Git-Bash to kubectl (it otherwise rewrites the
  leading `/…` to a Windows path).
- NEVER `git add` `.npmrc` / `.claude/`.

## PII note

FinCEN drafts contain PII (SSN-last4, DOB, officer/owner names + addresses). The
target `FincenDraft.data` is a Json column designed for exactly this. The loader
treats `data` as opaque Json and must **not** log its contents (log ids/types/counts
only).

## Verification gates

Per task: `npx tsc --noEmit` 0 · `CI=true npx vitest run` green (pure parse/map/
idempotency unit-tested). Import run: `--dry-run` clean → real load → verify counts +
spot-check + live `/admin/mtl` & `/admin/fincen`.
