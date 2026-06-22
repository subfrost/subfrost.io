# FUEL API key gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a static `FUEL_API_KEY` (sent as `x-api-key`) on `GET /api/fuel`, mirroring the referral endpoints' auth, by extracting one shared constant-time key-check helper.

**Architecture:** Lift the constant-time compare out of `lib/referral/auth.ts` into a shared `lib/api/service-key.ts#requireApiKey(request, expected, envName)`. Referral's `requireServiceKey` becomes a thin delegating wrapper (signature unchanged). The fuel route calls the same helper with `FUEL_API_KEY`. Then deploy the secret/env (io) and update the app to send the header (cross-repo).

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript, Vitest, Node `crypto.timingSafeEqual`, Prisma, Redis cache. Deploy: GCP Secret Manager + External Secrets Operator + Flux on GKE.

## Global Constraints

- Header is **`x-api-key`** (lowercase read via `request.headers.get("x-api-key")`). Copied from referral.
- Auth status semantics: env unset → **503** `{ error: "<envName> not configured" }`; header missing/wrong → **401** `{ error: "Unauthorized" }`. Match `requireServiceKey` exactly.
- Constant-time compare only (length-guarded `timingSafeEqual`) — never `===` on the secret.
- `GET /api/fuel` keeps its response shape `{ amount: number }`, the Redis 60s cache, and exact-match address. Auth check runs **first**, before reading the address or cache.
- `requireServiceKey(request)`'s public signature must NOT change — the 3 invite-codes routes and `tests/api/invite-codes.test.ts` stay untouched and green.
- Branch → PR → merge. **Never push to `main`.** `.claude/` and `.npmrc` are untracked — never `git add` them.
- Verification gates per task: `tsc --noEmit` 0, `CI=true npx vitest run` green, `next build` 0 (build only at the end).

---

### Task 1: Extract shared `requireApiKey` helper; refactor referral to delegate

Behavior-preserving refactor. The existing referral test suite is the regression guard (no new behavior, so no new failing test — the discipline is "existing tests stay green").

**Files:**
- Create: `lib/api/service-key.ts`
- Modify: `lib/referral/auth.ts`
- Test (regression): `tests/api/invite-codes.test.ts` (unchanged)

**Interfaces:**
- Produces: `requireApiKey(request: NextRequest, expected: string | undefined, envName: string): NextResponse | null` — returns a `NextResponse` to short-circuit (503 when `expected` is falsy, 401 when the `x-api-key` header is missing or mismatched), or `null` when authorized.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Create the shared helper**

Create `lib/api/service-key.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

/**
 * Guards a cross-service API with a shared static secret sent as `X-API-Key`.
 * `expected` is the configured secret (e.g. process.env.FUEL_API_KEY); `envName`
 * is its variable name, used only in the "not configured" message.
 *
 * Returns a NextResponse to short-circuit on failure, or null when authorized:
 *  - 503 when `expected` is unset/empty (misconfiguration, not the caller's fault)
 *  - 401 when the `x-api-key` header is missing or does not match
 */
export function requireApiKey(
  request: NextRequest,
  expected: string | undefined,
  envName: string,
): NextResponse | null {
  if (!expected) {
    return NextResponse.json({ error: `${envName} not configured` }, { status: 503 })
  }
  const provided = request.headers.get("x-api-key") ?? ""
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

// Constant-time comparison; bails on length mismatch (timingSafeEqual throws otherwise).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
```

- [ ] **Step 2: Refactor referral to delegate**

Replace the body of `lib/referral/auth.ts` with a thin wrapper that keeps the public signature:

```ts
import { NextRequest, NextResponse } from "next/server"
import { requireApiKey } from "@/lib/api/service-key"

/**
 * Guards the cross-service referral API with a shared `X-API-Key`. subfrost.io
 * owns the referral graph; subfrost-app (and other internal services) call these
 * endpoints server-to-server with the shared `REFERRAL_API_KEY` secret.
 *
 * Delegates to the shared `requireApiKey` helper so the constant-time compare
 * lives in one place. Returns a NextResponse to short-circuit, or null when authorized.
 */
export function requireServiceKey(request: NextRequest): NextResponse | null {
  return requireApiKey(request, process.env.REFERRAL_API_KEY, "REFERRAL_API_KEY")
}
```

- [ ] **Step 3: Run the referral regression suite — must stay green**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/api/invite-codes.test.ts`
Expected: PASS (all invite-codes cases, incl. the 401-without-key cases). The 503 message format is identical (`"REFERRAL_API_KEY not configured"`), so any test asserting it still passes.

- [ ] **Step 4: Typecheck**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/api/service-key.ts lib/referral/auth.ts
git commit -m "refactor: extract shared requireApiKey; referral delegates to it"
```

---

### Task 2: Gate `GET /api/fuel` + tests

TDD: write the failing fuel route test first, then add the gate.

**Files:**
- Modify: `app/api/fuel/route.ts`
- Test: `tests/api/fuel.test.ts` (create)

**Interfaces:**
- Consumes: `requireApiKey` from Task 1 (`@/lib/api/service-key`).
- Produces: gated `GET /api/fuel` — `401`/`503`/`400`/`200 {amount}` per the table below.

- [ ] **Step 1: Write the failing test**

Create `tests/api/fuel.test.ts` (mirrors `tests/api/invite-codes.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma (named + default export, matching @/lib/prisma) and the cache.
vi.mock('@/lib/prisma', () => {
  const fuelAllocation = { findUnique: vi.fn() };
  const client = { fuelAllocation };
  return { prisma: client, default: client };
});
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET as fuelGET } from '@/app/api/fuel/route';
import prisma from '@/lib/prisma';
import { cacheGet, cacheSet } from '@/lib/redis';

const KEY = 'test-fuel-key';
const fa = (prisma as unknown as { fuelAllocation: { findUnique: ReturnType<typeof vi.fn> } })
  .fuelAllocation;

function getReq(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://subfrost.io${path}`, { method: 'GET', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FUEL_API_KEY = KEY;
  vi.mocked(cacheGet).mockResolvedValue(null);
  vi.mocked(cacheSet).mockResolvedValue(undefined);
});

describe('GET /api/fuel', () => {
  it('rejects requests without an x-api-key (401)', async () => {
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap'));
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong x-api-key (401)', async () => {
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap', { 'x-api-key': 'nope' }));
    expect(res.status).toBe(401);
  });

  it('returns 503 when FUEL_API_KEY is not configured', async () => {
    delete process.env.FUEL_API_KEY;
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap', { 'x-api-key': KEY }));
    expect(res.status).toBe(503);
  });

  it('returns the amount for a known address with a valid key', async () => {
    fa.findUnique.mockResolvedValueOnce({ amount: 42 });
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap', { 'x-api-key': KEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 42 });
    expect(fa.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { address: 'bc1ptap' } }),
    );
  });

  it('returns amount 0 for an unknown address with a valid key', async () => {
    fa.findUnique.mockResolvedValueOnce(null);
    const res = await fuelGET(getReq('/api/fuel?address=bc1pmissing', { 'x-api-key': KEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 0 });
  });

  it('returns 400 when address is missing but the key is valid', async () => {
    const res = await fuelGET(getReq('/api/fuel', { 'x-api-key': KEY }));
    expect(res.status).toBe(400);
    expect(fa.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/api/fuel.test.ts`
Expected: FAIL — the 401/503 cases currently return 200 (route is unauthenticated), so those assertions fail.

- [ ] **Step 3: Add the gate to the route**

Modify `app/api/fuel/route.ts`. Update the top comment, switch to `NextRequest`, and add the auth check as the first statement in the `try`:

```ts
/**
 * GET /api/fuel?address=X — FUEL allocation lookup for wallets.
 * subfrost.io owns the allocations table (admin writes via lib/fuel/admin.ts);
 * app.subfrost.io reads them here server-to-server. Auth: shared `x-api-key`
 * (FUEL_API_KEY), mirroring the referral endpoints. Exact-match address, light
 * 60s cache. Shape is { amount: number } to match the app consumer.
 */
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cacheGet, cacheSet } from "@/lib/redis"
import { requireApiKey } from "@/lib/api/service-key"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CACHE_TTL = 60

export async function GET(request: NextRequest) {
  try {
    const denied = requireApiKey(request, process.env.FUEL_API_KEY, "FUEL_API_KEY")
    if (denied) return denied

    const address = new URL(request.url).searchParams.get("address")?.trim() ?? ""
    if (!address) {
      return NextResponse.json({ error: "address query param required" }, { status: 400 })
    }

    const cacheKey = `fuel:public:${address}`
    const cached = await cacheGet<{ amount: number }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const allocation = await prisma.fuelAllocation.findUnique({
      where: { address },
      select: { amount: true },
    })
    const result = { amount: allocation?.amount ?? 0 }
    await cacheSet(cacheKey, result, CACHE_TTL)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[API /fuel] error:", error)
    return NextResponse.json({ error: "Failed to read fuel allocation" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/api/fuel.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Full verification**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0 errors; full vitest green (new fuel + existing suites); next build 0 errors.

Note: the CI "Test" job is known to flake on a forks-pool unhandled-rejection from pre-existing tests (`tests/api/frbtc-issued.test.ts`, `tests/billing/money.test.ts`) — not a regression here; `gh run rerun <id> --failed` if it trips.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add app/api/fuel/route.ts tests/api/fuel.test.ts
git commit -m "feat: gate GET /api/fuel behind FUEL_API_KEY (x-api-key)"
```

---

### Task 3 (operational — execute with the user's go, not a subagent): Open PR, deploy secret + ESO + env, Flux

Same pattern executed for SP-4's `stripe-webhook-secret`. Live prod credentials (io-sa, Secret Manager, kubectl) — run directly, carefully, with the user's go. **Order matters:** the secret/env must exist in prod before (or together with) the code rolling out, otherwise `/api/fuel` returns 503 to the still-keyless app.

**Files:**
- Modify: `k8s/external-secrets.yaml`, `k8s/deployment.yaml`, `k8s/kustomization.yaml`

- [ ] **Step 1: Open the code PR**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && git push -u origin feat/fuel-api-key-gate
gh pr create --title "Gate GET /api/fuel behind FUEL_API_KEY" --body "<spec link + summary>"
```
Get the user's go to merge (`gh pr merge <n> --merge`).

- [ ] **Step 2: Generate the key and create the Secret Manager secret**

Generate: `openssl rand -hex 32` (record it securely for the app side).
Mint a full-scope token and create `fuel-api-key` + add the version via io-sa, mirroring how `stripe-webhook-secret` was created in SP-4 (`SA_KEY=.../io-sa.json SCOPE=https://www.googleapis.com/auth/cloud-platform python .ioenv-extracted/gcp_token.py` → Secret Manager REST `create` then `addVersion`). ASCII-only output (cp1252 stdout). Verify the version is `ENABLED`.

- [ ] **Step 3: Wire ESO + deployment env (only after the secret exists)**

Add to `k8s/external-secrets.yaml` an entry mapping the GCP secret `fuel-api-key` → `FUEL_API_KEY` in the synced k8s Secret (ESO writes `data` atomically). Add `FUEL_API_KEY` with `optional: true` to the env block in `k8s/deployment.yaml`, mirroring the `STRIPE_*` entries. Commit on the branch (or a follow-up `deploy/*` PR) and merge.

- [ ] **Step 4: Build + roll**

After the merge to main: Cloud Build produces an image tagged with the merge commit's short-sha (Artifact Registry `us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/subfrost-io`; check with substring `tags/<sha>`, no leading quote). Bump `newTag` in `k8s/kustomization.yaml` via a `deploy/*-newtag` PR → Flux rolls GKE. Force reconcile if needed:
`kubectl-io.sh -n flux-system annotate --overwrite gitrepository/subfrost-io kustomization/subfrost-io reconcile.fluxcd.io/requestedAt=<ts>`

- [ ] **Step 5: Validate live**

```bash
curl -s "https://subfrost.io/api/fuel?address=<addr>"                                  # → 401
curl -s -H "x-api-key: <FUEL_API_KEY>" "https://subfrost.io/api/fuel?address=<addr>"   # → {"amount":N}
```
Also confirm rollout: `kubectl-io.sh -n subfrost get deploy subfrost-io -o jsonpath` (image + readyReplicas 2/2).

---

### Task 4 (operational — cross-repo): subfrost-app sends the key

The local `feat/fuel-remote-read` branch in `C:\Alkanes Geral Dev\subfrost-app` calls `SUBFROST_IO_FUEL_URL/api/fuel` keyless. It must send `x-api-key: <FUEL_API_KEY>` from an app env var.

- [ ] **Step 1: Confirm write access to `subfrost/subfrost-app`**

Run: `gh api repos/subfrost/subfrost-app -q .permissions` (expect `push: true`), or push a throwaway branch. Vdto88 was read-only + fork disabled; flex said "you can make a PR" — verify it's unlocked.

- [ ] **Step 2: Add the header to the fetch**

In the FUEL fetch on `feat/fuel-remote-read`, add `headers: { "x-api-key": process.env.SUBFROST_IO_FUEL_API_KEY ?? "" }` (or the app's chosen env name). Keep the request otherwise unchanged.

- [ ] **Step 3: PR (or package for flex)**

If write is unlocked: push the branch and `gh pr create` against `subfrost/subfrost-app`; flex merges. If still blocked: package the patch into `C:\Alkanes Geral Dev\fuel-fix-handoff\` (patches + push script + English message naming both required env vars) for flex to apply.

- [ ] **Step 4: Flag the silent-failure risk in the PR/handoff**

State explicitly: the wallet shows FUEL **0 with no error** if flex sets `SUBFROST_IO_FUEL_URL` but forgets the app-side key env (or sets the io secret but not the app env). End-to-end is only "done" when the app sends a key matching the io secret and the wallet shows real FUEL.

---

## Self-Review

**Spec coverage:** Decisions 1-3 → Task 1 (helper + delegate) + Task 2 (fuel gate, FUEL_API_KEY, x-api-key). Error table → Task 2 test + route. Testing section → Task 2 Step 1 (all 6 cases) + Task 1 Step 3 (referral regression). Deploy Part 2 → Task 3. App Part 3 → Task 4. Sequencing/silent-failure note → Task 3 preamble + Task 4 Step 4. No gaps.

**Placeholder scan:** `<addr>`, `<FUEL_API_KEY>`, `<n>`, `<sha>`, `<ts>`, `<spec link + summary>` are runtime values for live/ops steps, not code placeholders. All code steps contain complete code.

**Type consistency:** `requireApiKey(request, expected, envName)` defined in Task 1 is consumed verbatim in Task 1 (referral) and Task 2 (fuel). `safeEqual` is private to the helper. Mock shape `fuelAllocation.findUnique` matches the route's `prisma.fuelAllocation.findUnique`. Consistent.
