# Compliance import (MTL + FinCEN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the legacy subfrost-admin compliance data (MTL + FinCEN drafts/submissions) from its JSON file store into subfrost.io's Postgres, idempotently, mirroring the FUEL import.

**Architecture:** Pure parse/map functions (`lib/{mtl,fincen}/migrate.ts`) with the DB effect injected for testability (exactly like `lib/fuel/migrate.ts`). A bash acquisition script (`scripts/dump-admin-compliance.sh`) extracts the JSON from the admin-web PVC via an in-cluster Job + ConfigMap roundtrip (exec/logs are blocked). A tsx orchestrator (`scripts/migrate-compliance-data.ts`) does `--dry-run` (parse+map+validate) and the real load (proxy to the public io Postgres). No schema change.

**Tech Stack:** TypeScript, Prisma/Postgres, Vitest, `npx tsx`, kubectl (against the `subfrost-admin` GKE cluster via the io token).

## Global Constraints

- **Branch:** `feat/compliance-import` (already created off main; the spec is committed there). All CODE ships via this branch → PR → merge.
- **No schema change** — `MtlEntry`, `FincenDraft`, `FincenSubmission` already exist in prod.
- **Idempotent:** MTL by `state` (PK); FinCEN drafts + submissions by **source `id`** (preserves the draft→submission FK). Re-running the load is a no-op.
- **Status/type maps (exact):** MTL kebab→ENUM = uppercase + `-`→`_` (`agent-of-stripe→AGENT_OF_STRIPE`, etc.). FinCEN type `form-107→FORM107`, `sar→SAR`, `ctr→CTR`. Submission status `queued→QUEUED`, `accepted→ACCEPTED`, `rejected→REJECTED`.
- **Load drafts BEFORE submissions** (FK).
- **PII:** FinCEN `data` is opaque Json — never log its contents (log ids/types/counts only).
- **Validation = warn, not fail:** validate draft `data` against the io zod schemas in dry-run; still store the raw Json on load.
- **Verification gates (per code task):** `npx tsc --noEmit` 0 · `CI=true npx vitest run` green.
- **Data-only — NO Flux/deploy.** The live `/admin/mtl` & `/admin/fincen` read the tables directly.
- **Windows:** Bash tool for heredoc/POSIX; `npx tsx` works; `MSYS_NO_PATHCONV=1` when passing container paths (`/var/lib/...`, `/data`) through Git-Bash to kubectl. NEVER `git add` `.npmrc` / `.claude/`.
- **io import conventions:** `import prisma from "@/lib/prisma"` (default). `@` = repo root. Tests live in `tests/`.

---

## Task 1: MTL migrate library

**Files:**
- Create: `lib/mtl/migrate.ts`
- Test: `tests/mtl/migrate.test.ts`

**Interfaces:**
- Consumes: `MtlStatusValue` from `@/lib/mtl/schema`.
- Produces: `parseMtlDump(jsonText): MtlLoadRow[]`, `mapMtlStatus(kebab): MtlStatusValue`, `migrateMtl(rows, opts?): Promise<{total:number}>` (DB effect injected via `opts.upsertRow`). `MtlLoadRow = { state, name, status, nextFilingDue, portalUrl, notes }`.

- [ ] **Step 1: Write the failing test**

Create `tests/mtl/migrate.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { parseMtlDump, mapMtlStatus, migrateMtl, type MtlLoadRow } from "@/lib/mtl/migrate"

describe("mapMtlStatus", () => {
  it("maps every kebab status to the SCREAMING_SNAKE enum", () => {
    expect(mapMtlStatus("agent-of-stripe")).toBe("AGENT_OF_STRIPE")
    expect(mapMtlStatus("registered")).toBe("REGISTERED")
    expect(mapMtlStatus("filed-pending")).toBe("FILED_PENDING")
    expect(mapMtlStatus("exempt")).toBe("EXEMPT")
    expect(mapMtlStatus("not-yet-needed")).toBe("NOT_YET_NEEDED")
    expect(mapMtlStatus("needs-filing")).toBe("NEEDS_FILING")
  })
  it("throws on an unknown status", () => {
    expect(() => mapMtlStatus("bogus")).toThrow(/unknown MTL status/)
  })
})

describe("parseMtlDump", () => {
  it("reads the singleton array-of-one {entries:[]} and maps each entry", () => {
    const json = JSON.stringify([
      {
        entries: [
          { state: "TX", name: "Texas", status: "registered", nextFilingDue: "2026-12-31", portalUrl: "https://x.test", notes: "n" },
          { state: "CA", name: "California", status: "agent-of-stripe" },
        ],
      },
    ])
    expect(parseMtlDump(json)).toEqual([
      { state: "TX", name: "Texas", status: "REGISTERED", nextFilingDue: "2026-12-31", portalUrl: "https://x.test", notes: "n" },
      { state: "CA", name: "California", status: "AGENT_OF_STRIPE", nextFilingDue: null, portalUrl: null, notes: null },
    ])
  })
  it("also accepts the bare {entries:[]} object form", () => {
    const json = JSON.stringify({ entries: [{ state: "NY", name: "New York", status: "exempt" }] })
    expect(parseMtlDump(json)[0]).toMatchObject({ state: "NY", status: "EXEMPT" })
  })
  it("throws when there is no entries array", () => {
    expect(() => parseMtlDump(JSON.stringify({ foo: 1 }))).toThrow(/entries/)
  })
})

describe("migrateMtl", () => {
  it("upserts each row and returns the total (idempotent effect injected)", async () => {
    const rows: MtlLoadRow[] = [
      { state: "TX", name: "Texas", status: "REGISTERED", nextFilingDue: null, portalUrl: null, notes: null },
      { state: "CA", name: "California", status: "AGENT_OF_STRIPE", nextFilingDue: null, portalUrl: null, notes: null },
    ]
    const upsertRow = vi.fn(async (_r: MtlLoadRow) => {})
    const res = await migrateMtl(rows, { upsertRow })
    expect(upsertRow).toHaveBeenCalledTimes(2)
    expect(res).toEqual({ total: 2 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/mtl/migrate.test.ts`
Expected: FAIL — cannot resolve `@/lib/mtl/migrate`.

- [ ] **Step 3: Write the implementation**

Create `lib/mtl/migrate.ts`:

```ts
/**
 * Migration of subfrost-admin's `mtl-state` JSON (singleton {entries:[]}) into
 * subfrost.io's MtlEntry. Pure parse/map here; the DB effect is injected for
 * tests (mirrors lib/fuel/migrate.ts). Idempotent by `state` (PK).
 * Runnable entrypoint: scripts/migrate-compliance-data.ts.
 */
import type { MtlStatusValue } from "./schema"

interface SourceMtlEntry {
  state: string
  name: string
  status: string
  nextFilingDue?: string
  portalUrl?: string
  notes?: string
}

export interface MtlLoadRow {
  state: string
  name: string
  status: MtlStatusValue
  nextFilingDue: string | null
  portalUrl: string | null
  notes: string | null
}

const STATUS_MAP: Record<string, MtlStatusValue> = {
  "agent-of-stripe": "AGENT_OF_STRIPE",
  registered: "REGISTERED",
  "filed-pending": "FILED_PENDING",
  exempt: "EXEMPT",
  "not-yet-needed": "NOT_YET_NEEDED",
  "needs-filing": "NEEDS_FILING",
}

export function mapMtlStatus(kebab: string): MtlStatusValue {
  const v = STATUS_MAP[kebab]
  if (!v) throw new Error(`unknown MTL status: ${kebab}`)
  return v
}

/** Parse the `mtl-state` snapshot. The store writes a singleton as an array-of-one
 *  ([{entries:[]}]); accept that or the bare {entries:[]} object. */
export function parseMtlDump(jsonText: string): MtlLoadRow[] {
  const parsed = JSON.parse(jsonText)
  const state = (Array.isArray(parsed) ? parsed[0] : parsed) as { entries?: SourceMtlEntry[] } | undefined
  if (!state || !Array.isArray(state.entries)) {
    throw new Error("mtl dump must contain an entries array ([{entries:[]}] or {entries:[]})")
  }
  return state.entries.map((e) => ({
    state: e.state,
    name: e.name,
    status: mapMtlStatus(e.status),
    nextFilingDue: e.nextFilingDue ?? null,
    portalUrl: e.portalUrl ?? null,
    notes: e.notes ?? null,
  }))
}

export interface MtlMigrateResult {
  total: number
}

export async function migrateMtl(
  rows: MtlLoadRow[],
  opts: { upsertRow?: (r: MtlLoadRow) => Promise<void> } = {},
): Promise<MtlMigrateResult> {
  const upsertRow = opts.upsertRow ?? (await defaultUpsertRow())
  for (const r of rows) await upsertRow(r)
  return { total: rows.length }
}

async function defaultUpsertRow(): Promise<(r: MtlLoadRow) => Promise<void>> {
  const prisma = (await import("@/lib/prisma")).default
  return async (r: MtlLoadRow) => {
    await prisma.mtlEntry.upsert({
      where: { state: r.state },
      create: { state: r.state, name: r.name, status: r.status, nextFilingDue: r.nextFilingDue, portalUrl: r.portalUrl, notes: r.notes },
      update: { name: r.name, status: r.status, nextFilingDue: r.nextFilingDue, portalUrl: r.portalUrl, notes: r.notes },
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/mtl/migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/mtl/migrate.ts tests/mtl/migrate.test.ts
git commit -m "$(cat <<'EOF'
feat(mtl): idempotent migrate lib for admin mtl-state import

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: FinCEN migrate library

**Files:**
- Create: `lib/fincen/migrate.ts`
- Test: `tests/fincen/migrate.test.ts`

**Interfaces:**
- Consumes: `Form107Schema`, `SarSchema`, `CtrSchema` from `@/lib/fincen/schemas`.
- Produces: `parseFincenDumps({form107?,sar?,ctr?,submissions?}): {drafts, submissions}`, `mapFincenType(t)`, `validateFincenDrafts(drafts): string[]`, `migrateFincen(drafts, submissions, opts?): Promise<{drafts:number;submissions:number}>` (effects injected). Types `DraftLoadRow = {id,type,data,updatedBy}`, `SubmissionLoadRow = {id,draftId,type,trackingId,status,message,submittedBy,submittedAt}`.

- [ ] **Step 1: Write the failing test**

Create `tests/fincen/migrate.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import {
  parseFincenDumps, mapFincenType, validateFincenDrafts, migrateFincen,
  type DraftLoadRow, type SubmissionLoadRow,
} from "@/lib/fincen/migrate"

describe("mapFincenType", () => {
  it("maps source kebab types to the enum", () => {
    expect(mapFincenType("form-107")).toBe("FORM107")
    expect(mapFincenType("sar")).toBe("SAR")
    expect(mapFincenType("ctr")).toBe("CTR")
  })
  it("throws on an unknown type", () => {
    expect(() => mapFincenType("xxx" as never)).toThrow(/unknown fincen type/)
  })
})

describe("parseFincenDumps", () => {
  it("merges form107 (singleton array) + sar + ctr into drafts and maps submissions, preserving ids", () => {
    const form107 = JSON.stringify([{ id: "f107_1", type: "form-107", data: { legalName: "X" }, updatedAt: "t", updatedBy: "a" }])
    const sar = JSON.stringify([{ id: "sar_1", type: "sar", data: { n: 1 }, updatedAt: "t", updatedBy: "a" }])
    const ctr = JSON.stringify([])
    const submissions = JSON.stringify([
      { id: "sub_1", draftId: "f107_1", type: "form-107", submittedAt: "t2", submittedBy: "b", trackingId: "LOCAL-AAA", status: "queued" },
    ])
    const { drafts, submissions: subs } = parseFincenDumps({ form107, sar, ctr, submissions })
    expect(drafts).toEqual([
      { id: "f107_1", type: "FORM107", data: { legalName: "X" }, updatedBy: "a" },
      { id: "sar_1", type: "SAR", data: { n: 1 }, updatedBy: "a" },
    ])
    expect(subs).toEqual([
      { id: "sub_1", draftId: "f107_1", type: "FORM107", trackingId: "LOCAL-AAA", status: "QUEUED", message: null, submittedBy: "b", submittedAt: "t2" },
    ])
  })
  it("treats missing/empty collection text as empty", () => {
    const { drafts, submissions } = parseFincenDumps({})
    expect(drafts).toEqual([])
    expect(submissions).toEqual([])
  })
})

describe("validateFincenDrafts", () => {
  it("warns on a draft whose data fails its schema, by id", () => {
    const drafts: DraftLoadRow[] = [{ id: "sar_bad", type: "SAR", data: { nope: true }, updatedBy: "a" }]
    const warnings = validateFincenDrafts(drafts)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("sar_bad")
  })
})

describe("migrateFincen", () => {
  it("upserts drafts BEFORE submissions and returns counts", async () => {
    const order: string[] = []
    const drafts: DraftLoadRow[] = [{ id: "f107_1", type: "FORM107", data: {}, updatedBy: "a" }]
    const submissions: SubmissionLoadRow[] = [
      { id: "sub_1", draftId: "f107_1", type: "FORM107", trackingId: "LOCAL-AAA", status: "QUEUED", message: null, submittedBy: "b", submittedAt: "t" },
    ]
    const upsertDraft = vi.fn(async (_d: DraftLoadRow) => { order.push("draft") })
    const upsertSubmission = vi.fn(async (_s: SubmissionLoadRow) => { order.push("sub") })
    const res = await migrateFincen(drafts, submissions, { upsertDraft, upsertSubmission })
    expect(order).toEqual(["draft", "sub"])
    expect(res).toEqual({ drafts: 1, submissions: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/fincen/migrate.test.ts`
Expected: FAIL — cannot resolve `@/lib/fincen/migrate`.

- [ ] **Step 3: Write the implementation**

Create `lib/fincen/migrate.ts`:

```ts
/**
 * Migration of subfrost-admin's FinCEN JSON collections (form-107 / sar / ctr
 * drafts + submissions) into subfrost.io's FincenDraft / FincenSubmission. Pure
 * parse/map/validate here; the DB effects are injected for tests (mirrors
 * lib/fuel/migrate.ts). Idempotent by SOURCE id — preserving ids keeps the
 * draft→submission FK and makes re-runs no-ops. data is opaque Json (never log it).
 */
import { Form107Schema, SarSchema, CtrSchema } from "@/lib/fincen/schemas"

type SourceType = "form-107" | "sar" | "ctr"
type TargetType = "FORM107" | "SAR" | "CTR"

interface SourceDraft { id: string; type: SourceType; data: unknown; updatedAt: string; updatedBy: string }
interface SourceSubmission {
  id: string; draftId: string; type: SourceType; submittedAt: string; submittedBy: string
  trackingId: string; status: "queued" | "accepted" | "rejected"; message?: string
}

export interface DraftLoadRow { id: string; type: TargetType; data: unknown; updatedBy: string }
export interface SubmissionLoadRow {
  id: string; draftId: string; type: TargetType; trackingId: string
  status: "QUEUED" | "ACCEPTED" | "REJECTED"; message: string | null; submittedBy: string; submittedAt: string
}

const TYPE_MAP: Record<string, TargetType> = { "form-107": "FORM107", sar: "SAR", ctr: "CTR" }
const SUB_STATUS_MAP: Record<string, SubmissionLoadRow["status"]> = { queued: "QUEUED", accepted: "ACCEPTED", rejected: "REJECTED" }

export function mapFincenType(t: SourceType): TargetType {
  const v = TYPE_MAP[t]
  if (!v) throw new Error(`unknown fincen type: ${t}`)
  return v
}

function readArr(text?: string): unknown[] {
  if (!text || !text.trim()) return []
  const p = JSON.parse(text)
  return Array.isArray(p) ? p : [p]
}

function mapDraft(d: SourceDraft): DraftLoadRow {
  return { id: d.id, type: mapFincenType(d.type), data: d.data, updatedBy: d.updatedBy }
}

function mapSubmission(s: SourceSubmission): SubmissionLoadRow {
  const status = SUB_STATUS_MAP[s.status]
  if (!status) throw new Error(`unknown submission status: ${s.status}`)
  return {
    id: s.id, draftId: s.draftId, type: mapFincenType(s.type), trackingId: s.trackingId,
    status, message: s.message ?? null, submittedBy: s.submittedBy, submittedAt: s.submittedAt,
  }
}

/** Parse the 4 source collection files (each as raw JSON text). form-107 is a
 *  singleton (array-of-one); sar/ctr/submissions are arrays. Missing/empty → []. */
export function parseFincenDumps(input: {
  form107?: string; sar?: string; ctr?: string; submissions?: string
}): { drafts: DraftLoadRow[]; submissions: SubmissionLoadRow[] } {
  const drafts: DraftLoadRow[] = [
    ...(readArr(input.form107) as SourceDraft[]).map(mapDraft),
    ...(readArr(input.sar) as SourceDraft[]).map(mapDraft),
    ...(readArr(input.ctr) as SourceDraft[]).map(mapDraft),
  ]
  const submissions = (readArr(input.submissions) as SourceSubmission[]).map(mapSubmission)
  return { drafts, submissions }
}

/** Validate each draft's data against the io zod schema; return warnings (never throws). */
export function validateFincenDrafts(drafts: DraftLoadRow[]): string[] {
  const schemaFor = { FORM107: Form107Schema, SAR: SarSchema, CTR: CtrSchema }
  const warnings: string[] = []
  for (const d of drafts) {
    const res = schemaFor[d.type].safeParse(d.data)
    if (!res.success) warnings.push(`draft ${d.id} (${d.type}) failed validation`)
  }
  return warnings
}

export interface FincenMigrateResult { drafts: number; submissions: number }

export async function migrateFincen(
  drafts: DraftLoadRow[],
  submissions: SubmissionLoadRow[],
  opts: {
    upsertDraft?: (d: DraftLoadRow) => Promise<void>
    upsertSubmission?: (s: SubmissionLoadRow) => Promise<void>
  } = {},
): Promise<FincenMigrateResult> {
  const def = (!opts.upsertDraft || !opts.upsertSubmission) ? await defaultEffects() : null
  const upsertDraft = opts.upsertDraft ?? def!.upsertDraft
  const upsertSubmission = opts.upsertSubmission ?? def!.upsertSubmission
  for (const d of drafts) await upsertDraft(d) // drafts before submissions (FK)
  for (const s of submissions) await upsertSubmission(s)
  return { drafts: drafts.length, submissions: submissions.length }
}

async function defaultEffects() {
  const prisma = (await import("@/lib/prisma")).default
  const asJson = (v: unknown) => v as never // Prisma.InputJsonValue at the call site
  return {
    upsertDraft: async (d: DraftLoadRow) => {
      await prisma.fincenDraft.upsert({
        where: { id: d.id },
        create: { id: d.id, type: d.type, data: asJson(d.data), updatedBy: d.updatedBy },
        update: { type: d.type, data: asJson(d.data), updatedBy: d.updatedBy },
      })
    },
    upsertSubmission: async (s: SubmissionLoadRow) => {
      await prisma.fincenSubmission.upsert({
        where: { id: s.id },
        create: {
          id: s.id, draftId: s.draftId, type: s.type, trackingId: s.trackingId,
          status: s.status, message: s.message, submittedBy: s.submittedBy, submittedAt: new Date(s.submittedAt),
        },
        update: {
          draftId: s.draftId, type: s.type, trackingId: s.trackingId,
          status: s.status, message: s.message, submittedBy: s.submittedBy, submittedAt: new Date(s.submittedAt),
        },
      })
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/fincen/migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/fincen/migrate.ts tests/fincen/migrate.test.ts
git commit -m "$(cat <<'EOF'
feat(fincen): idempotent migrate lib for admin FinCEN import

Drafts + submissions upserted by source id (preserves draft->submission
FK); type/status maps; validation warnings; data kept as opaque Json.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Acquisition — pull the JSON out of the admin PVC

**Files:**
- Create: `scripts/dump-admin-compliance.sh` (committed artifact, the acquisition method)
- Produces (untracked): snapshot files in `C:\Alkanes Geral Dev\.adminenv-extracted\dump\<collection>.json`

**Why a Job + ConfigMap roundtrip:** the io token reaches the `subfrost-admin` cluster API (get/apply work), but `exec`/`logs`/`cp` fail with Konnectivity "No agent available". So a short-lived in-cluster Job mounts the PVC and surfaces the files through a ConfigMap, which we read over the API.

- [ ] **Step 1: Verify cluster reach + RBAC (preflight)**

```bash
cd "C:/Alkanes Geral Dev/.ioenv-extracted"
export SA_KEY="C:/Alkanes Geral Dev/.ioenv-extracted/.config/gcloud-io/io-sa.json"
export SCOPE="https://www.googleapis.com/auth/cloud-platform"
export TOKEN=$(python gcp_token.py 2>/dev/null)
# admin cluster endpoint + CA (regenerate if missing)
if [ ! -s admin-endpoint.txt ]; then
  TOKEN="$TOKEN" python -c "import os,json,base64,urllib.request as u; t=os.environ['TOKEN']; d=json.load(u.urlopen(u.Request('https://container.googleapis.com/v1/projects/night-wolves-jogging/locations/us-central1-a/clusters/subfrost-admin',headers={'Authorization':'Bearer '+t}))); open('admin-endpoint.txt','w').write(d['endpoint']); open('admin-ca.crt','wb').write(base64.b64decode(d['masterAuth']['clusterCaCertificate']))"
fi
ENDPOINT=$(cat admin-endpoint.txt)
KA() { /tmp/kubectl.exe --server="https://$ENDPOINT" --certificate-authority="C:/Alkanes Geral Dev/.ioenv-extracted/admin-ca.crt" --token="$TOKEN" "$@"; }
KA auth can-i create jobs -n admin
KA auth can-i create configmaps -n admin
KA auth can-i create rolebindings -n admin
```
Expected: three `yes`. If any is `no`, STOP and use the fallback (Task 3 note below).

- [ ] **Step 2: Write the acquisition script**

Create `scripts/dump-admin-compliance.sh`:

```bash
#!/usr/bin/env bash
# Extract subfrost-admin compliance JSON (mtl-state + fincen-*) from the admin-web
# PVC into C:/Alkanes Geral Dev/.adminenv-extracted/dump/. exec/logs/cp are blocked
# on the subfrost-admin cluster (Konnectivity), so we use an in-cluster Job that
# mounts the PVC and copies the files into a ConfigMap, which we read over the API.
set -euo pipefail
export MSYS_NO_PATHCONV=1

IOENV="C:/Alkanes Geral Dev/.ioenv-extracted"
OUT="C:/Alkanes Geral Dev/.adminenv-extracted/dump"
mkdir -p "$OUT"

cd "$IOENV"
export SA_KEY="$IOENV/.config/gcloud-io/io-sa.json"
export SCOPE="https://www.googleapis.com/auth/cloud-platform"
TOKEN=$(python gcp_token.py 2>/dev/null)
if [ ! -s admin-endpoint.txt ]; then
  TOKEN="$TOKEN" python -c "import os,json,base64,urllib.request as u; t=os.environ['TOKEN']; d=json.load(u.urlopen(u.Request('https://container.googleapis.com/v1/projects/night-wolves-jogging/locations/us-central1-a/clusters/subfrost-admin',headers={'Authorization':'Bearer '+t}))); open('admin-endpoint.txt','w').write(d['endpoint']); open('admin-ca.crt','wb').write(base64.b64decode(d['masterAuth']['clusterCaCertificate']))"
fi
ENDPOINT=$(cat admin-endpoint.txt)
KA() { /tmp/kubectl.exe --server="https://$ENDPOINT" --certificate-authority="$IOENV/admin-ca.crt" --token="$TOKEN" "$@"; }

# Find admin-web's node (RWO PVC → the dumper Job must co-schedule on it).
POD=$(KA get pods -n admin -l app=admin-web -o jsonpath='{.items[0].metadata.name}')
NODE=$(KA get pod -n admin "$POD" -o jsonpath='{.spec.nodeName}')
echo "admin-web pod=$POD node=$NODE"

KA delete configmap compliance-dump -n admin --ignore-not-found
KA delete job compliance-dumper -n admin --ignore-not-found

# RBAC (SA + Role allowing configmap create/get) + the Job. The dumper image has
# kubectl; it selectively adds only the compliance files that exist (so a large
# audit.json never blows the 1MB ConfigMap limit).
cat <<YAML | KA apply -f -
apiVersion: v1
kind: ServiceAccount
metadata: { name: compliance-dumper, namespace: admin }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: compliance-dumper, namespace: admin }
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["create","get","delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: compliance-dumper, namespace: admin }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: compliance-dumper }
subjects: [{ kind: ServiceAccount, name: compliance-dumper, namespace: admin }]
---
apiVersion: batch/v1
kind: Job
metadata: { name: compliance-dumper, namespace: admin }
spec:
  backoffLimit: 1
  template:
    spec:
      serviceAccountName: compliance-dumper
      nodeName: ${NODE}
      restartPolicy: Never
      containers:
        - name: dump
          image: bitnami/kubectl:latest
          command: ["sh","-c"]
          args:
            - |
              cd /data
              args=""
              for f in mtl-state fincen-form-107-draft fincen-sar-drafts fincen-ctr-drafts fincen-submissions; do
                [ -f "\$f.json" ] && args="\$args --from-file=\$f.json=\$f.json"
              done
              echo "files: \$args"
              kubectl create configmap compliance-dump -n admin \$args
              echo DONE
          volumeMounts:
            - { name: data, mountPath: /data, readOnly: true }
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: admin-web-data }
YAML

echo "waiting for the dumper Job to complete..."
KA wait --for=condition=complete job/compliance-dumper -n admin --timeout=120s

# Read the ConfigMap over the API and split it back into snapshot files.
KA get configmap compliance-dump -n admin -o json > "$OUT/.configmap.json"
python - "$OUT" <<'PY'
import json,sys,os
out=sys.argv[1]
cm=json.load(open(os.path.join(out,".configmap.json"),encoding="utf-8"))
data=cm.get("data",{})
for fname,content in data.items():
    open(os.path.join(out,fname),"w",encoding="utf-8").write(content)
    print("wrote",fname,len(content),"bytes")
PY

# Cleanup in-cluster objects.
KA delete job compliance-dumper -n admin --ignore-not-found
KA delete configmap compliance-dump -n admin --ignore-not-found
KA delete rolebinding compliance-dumper -n admin --ignore-not-found
KA delete role compliance-dumper -n admin --ignore-not-found
KA delete serviceaccount compliance-dumper -n admin --ignore-not-found
echo "Snapshots in $OUT"
```

- [ ] **Step 3: Run the acquisition**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && bash scripts/dump-admin-compliance.sh`
Expected: `DONE`, then `wrote <collection>.json …` lines, then `Snapshots in …`. Confirm the snapshot files exist:
`ls -la "C:/Alkanes Geral Dev/.adminenv-extracted/dump/"` → at least `mtl-state.json`; `fincen-*.json` for whichever collections the admin has.

> **Fallback if preflight RBAC was `no`, or the Job can't co-schedule (RWO), or a file > 1 MB:** switch to **A2 (GCS)** — same Job but image `google/cloud-sdk:slim` running with `serviceAccountName: admin-web` (workload identity → `subfrost-admin-app@` GSA), `gcloud storage cp /data/<files> gs://<bucket>/compliance-export/`, then download with the io token via the storage API (see the FUEL runbook §1 download step). If neither works, **A3:** ask Vitor to export the files from admin.subfrost.io into the dump dir.

- [ ] **Step 4: Commit the script** (no snapshot — `.adminenv-extracted/` is untracked)

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add scripts/dump-admin-compliance.sh
git commit -m "$(cat <<'EOF'
feat(compliance): admin PVC acquisition via in-cluster Job + ConfigMap

exec/logs/cp are blocked on the subfrost-admin cluster (Konnectivity), so
a co-scheduled Job copies the compliance JSON into a ConfigMap we read
over the API. Selective file list keeps under the 1MB CM limit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Orchestrator + dry-run against the real snapshots

**Files:**
- Create: `scripts/migrate-compliance-data.ts`

**Interfaces:**
- Consumes: `parseMtlDump`/`migrateMtl` (Task 1), `parseFincenDumps`/`validateFincenDrafts`/`migrateFincen` (Task 2). Reads snapshots from `.adminenv-extracted/dump/`.

- [ ] **Step 1: Write the orchestrator**

Create `scripts/migrate-compliance-data.ts`:

```ts
/**
 * Orchestrates the compliance import. `--dry-run` parses + maps + validates the
 * snapshots (no DB). Without it, loads into subfrost.io's Postgres (DATABASE_URL +
 * cloud-sql-proxy to the public io instance). Idempotent. Mirrors
 * scripts/migrate-fuel-data.ts.
 */
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { parseMtlDump, migrateMtl } from "@/lib/mtl/migrate"
import { parseFincenDumps, validateFincenDrafts, migrateFincen } from "@/lib/fincen/migrate"

const DUMP = "C:/Alkanes Geral Dev/.adminenv-extracted/dump"
const read = (name: string): string | undefined => {
  const p = path.join(DUMP, name)
  return existsSync(p) ? readFileSync(p, "utf8") : undefined
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  const mtlText = read("mtl-state.json")
  const mtlRows = mtlText ? parseMtlDump(mtlText) : []

  const { drafts, submissions } = parseFincenDumps({
    form107: read("fincen-form-107-draft.json"),
    sar: read("fincen-sar-drafts.json"),
    ctr: read("fincen-ctr-drafts.json"),
    submissions: read("fincen-submissions.json"),
  })
  const warnings = validateFincenDrafts(drafts)

  console.log(`[compliance] parsed: mtl=${mtlRows.length} drafts=${drafts.length} submissions=${submissions.length}`)
  for (const w of warnings) console.warn(`[compliance][warn] ${w}`)

  if (dryRun) {
    console.log("[compliance] --dry-run: no DB writes")
    return
  }

  const mtlRes = await migrateMtl(mtlRows)
  const finRes = await migrateFincen(drafts, submissions)
  console.log(`[compliance] loaded: mtl=${mtlRes.total} drafts=${finRes.drafts} submissions=${finRes.submissions}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Dry-run against the real snapshots**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx tsx scripts/migrate-compliance-data.ts --dry-run`
Expected: a `[compliance] parsed: mtl=… drafts=… submissions=…` line with no thrown error. Investigate any `[warn]` (a draft whose shape drifted from the schema) before loading — decide per-draft whether to fix the snapshot or accept storing it raw. Mapping errors (unknown status/type) THROW here — fix the map or the source value.

- [ ] **Step 3: tsc + commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx tsc --noEmit
git add scripts/migrate-compliance-data.ts
git commit -m "$(cat <<'EOF'
feat(compliance): dry-run/load orchestrator for MTL + FinCEN import

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Real load + verify + PR

**Files:** none (ops). Uses the public io `subfrost-postgres` via proxy.

- [ ] **Step 1: Full gates**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx tsc --noEmit && CI=true npx vitest run`
Expected: tsc 0; vitest green.

- [ ] **Step 2: Start the io proxy + get DATABASE_URL**

```bash
"C:/Alkanes Geral Dev/.ioenv-check/cloud-sql-proxy.exe" \
  --credentials-file "C:/Alkanes Geral Dev/.ioenv-extracted/.config/gcloud-io/io-sa.json" \
  --port 5432 night-wolves-jogging:us-central1:subfrost-postgres   # run in background
cd "C:/Alkanes Geral Dev/subfrost.io"
DBURL=$(bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" \
  get secret subfrost-io-secrets -n subfrost -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
```

- [ ] **Step 3: Real load (idempotent)**

```bash
DATABASE_URL="$DBURL" npx tsx scripts/migrate-compliance-data.ts
```
Expected: `[compliance] loaded: mtl=… drafts=… submissions=…`.

- [ ] **Step 4: Verify counts + spot-check**

Create `.git/sdd/verify-compliance.mts`:
```ts
import { PrismaClient } from "@prisma/client"
const p = new PrismaClient()
const mtl = await p.mtlEntry.count()
const drafts = await p.fincenDraft.count()
const subs = await p.fincenSubmission.count()
const f107 = await p.fincenDraft.findFirst({ where: { type: "FORM107" }, select: { id: true, updatedBy: true } })
console.log({ mtl, drafts, subs, f107 })
await p.$disconnect()
```
Run: `DATABASE_URL="$DBURL" npx tsx .git/sdd/verify-compliance.mts`
Expected: `mtl` = 51 (or however many the source had), `drafts`/`subs` matching the dry-run parsed counts, and a non-null `f107`. **Re-run Task 5 Step 3 once** and re-verify — counts MUST be identical (idempotency proof).

- [ ] **Step 5: Live UI check + stop proxy**

- Hit `/admin/mtl` and `/admin/fincen` (logged in) — the imported rows show (no redeploy needed).
- `taskkill //IM cloud-sql-proxy.exe //F`

- [ ] **Step 6: Open the PR**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git push -u origin feat/compliance-import
gh pr create --head feat/compliance-import --base main \
  --title "feat(compliance): import MTL + FinCEN from subfrost-admin" \
  --body "Imports the legacy subfrost-admin compliance data (mtl-state → MtlEntry; fincen-* drafts/submissions → FincenDraft/FincenSubmission) idempotently. Acquisition via in-cluster Job + ConfigMap roundtrip (exec/logs blocked on the admin cluster). No schema change. KYC/Reviews/audit out of scope (see spec). Data already loaded to prod via the script; this PR is the code.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review notes

- **Spec coverage:** MTL map+load (Task 1) · FinCEN drafts/submissions map+load by source id + validation warnings (Task 2) · acquisition Job+ConfigMap roundtrip + RBAC preflight + fallbacks (Task 3) · dry-run orchestrator (Task 4) · real load + idempotency re-run + verify + live UI + PR (Task 5). Out-of-scope (KYC/Reviews/audit) carried from the spec — no tasks, intentionally. No schema change — none planned.
- **Placeholder scan:** all code + commands are concrete. The only deferred decision is per-`[warn]` draft handling in Task 4 Step 2, which is a genuine judgment call on real data, not a placeholder.
- **Type consistency:** `MtlLoadRow`, `DraftLoadRow`, `SubmissionLoadRow`, `parseMtlDump`/`migrateMtl`, `parseFincenDumps`/`migrateFincen` are defined in Tasks 1-2 and consumed verbatim in Task 4. Status/type maps match the spec's Global Constraints exactly.
