# FUEL display fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `app.subfrost.io` read FUEL allocations from the same database `subfrost.io/admin` writes to, by having subfrost.io own a public read endpoint and the app fetch it server-side via an env-gated flip.

**Architecture:** subfrost.io exposes `GET /api/fuel?address=` (public, reads `subfrost-postgres`). subfrost-app gains `lib/fuel-remote.ts` (keyless mirror of `lib/referral-remote.ts`) and its existing `app/api/fuel/route.ts` flips to the remote read when `SUBFROST_IO_FUEL_URL` is set, else keeps the legacy local-DB read. No schema change, no migration — the `FuelAllocation` table already exists in both repos.

**Tech Stack:** Next.js 16 App Router (route handlers), Prisma/Postgres, Redis (io `cacheGet/cacheSet`, app `cache`), Vitest.

## Global Constraints

- **Two repos, two branches, two PRs.** subfrost.io → branch `feat/fuel-public-read` (already created, has the spec commit). subfrost-app → branch `feat/fuel-remote-read` off `main` (do NOT use the in-flight `feat/referral-remote-flip`).
- **branch → PR → merge, never push to `main` directly** (`gh pr merge <n> --merge`).
- **Never `git add` `.npmrc` or `.claude/`** (untracked in both repos — leave them).
- **Response shape is exactly `{ amount: number }`** end-to-end (the app consumer `parseFuelAmount` + `useFuelAllocation.ts` depend on it). Do not add fields.
- **Public, no auth** on the io endpoint. **Exact-match address** (no case normalization — matches admin `upsertAllocations`, which only `trim()`s).
- **Verification gates before each PR (per repo):** `npx tsc --noEmit` → 0 errors · `CI=true npx vitest run` → green · `npx next build` → 0 errors.
- **Windows:** use the Bash tool for heredocs/multi-line commit messages. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **io import conventions:** `import prisma from "@/lib/prisma"` (default export), `import { cacheGet, cacheSet } from "@/lib/redis"`. The `@` alias = repo root. Tests live in `tests/`.
- **app import conventions:** `import { prisma } from "@/lib/db/prisma"`, `import { cache } from "@/lib/db/redis"`. Tests live next to source in `__tests__/` or `lib/__tests__/`.

---

## Task 1: subfrost.io — public `GET /api/fuel?address=` endpoint

**Repo:** `C:\Alkanes Geral Dev\subfrost.io` · **Branch:** `feat/fuel-public-read`

**Files:**
- Create: `app/api/fuel/route.ts`
- Test: `tests/fuel/public-route.test.ts`

**Interfaces:**
- Consumes: `prisma.fuelAllocation.findUnique` (`@/lib/prisma`), `cacheGet`/`cacheSet` (`@/lib/redis`).
- Produces: HTTP `GET /api/fuel?address=<addr>` → `200 { amount: number }` (0 when no allocation), `400 { error }` when address missing, `500 { error }` on failure. This is the endpoint subfrost-app Task 2 fetches.

- [ ] **Step 1: Write the failing test**

Create `tests/fuel/public-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const fuelAllocation = { findUnique: vi.fn() };
  const client = { fuelAllocation };
  return { prisma: client, default: client };
});

vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { GET } from '@/app/api/fuel/route';
import prisma from '@/lib/prisma';
import { cacheGet, cacheSet } from '@/lib/redis';

const fa = (prisma as unknown as { fuelAllocation: { findUnique: ReturnType<typeof vi.fn> } }).fuelAllocation;
const get = cacheGet as unknown as ReturnType<typeof vi.fn>;
const set = cacheSet as unknown as ReturnType<typeof vi.fn>;

const req = (url: string) => new Request(url) as never;

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(null);
});

describe('GET /api/fuel', () => {
  it('returns the allocation amount for a known address', async () => {
    fa.findUnique.mockResolvedValueOnce({ amount: 12.5 });
    const res = await GET(req('http://localhost/api/fuel?address=bc1pa'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 12.5 });
    expect(fa.findUnique).toHaveBeenCalledWith({ where: { address: 'bc1pa' }, select: { amount: true } });
    expect(set).toHaveBeenCalledWith('fuel:public:bc1pa', { amount: 12.5 }, 60);
  });

  it('returns amount 0 for an address with no allocation', async () => {
    fa.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req('http://localhost/api/fuel?address=bc1pz'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 0 });
  });

  it('returns 400 when address is missing', async () => {
    const res = await GET(req('http://localhost/api/fuel'));
    expect(res.status).toBe(400);
    expect(fa.findUnique).not.toHaveBeenCalled();
  });

  it('serves a cache hit without touching the DB', async () => {
    get.mockResolvedValueOnce({ amount: 7 });
    const res = await GET(req('http://localhost/api/fuel?address=bc1pa'));
    expect(await res.json()).toEqual({ amount: 7 });
    expect(fa.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/fuel/public-route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/fuel/route` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `app/api/fuel/route.ts`:

```ts
/**
 * GET /api/fuel?address=X — public FUEL allocation lookup for wallets.
 * subfrost.io owns the allocations table (admin writes via lib/fuel/admin.ts);
 * app.subfrost.io reads them here server-side. Public (no auth), exact-match
 * address, light 60s cache. Shape is { amount: number } to match the app
 * consumer.
 */
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cacheGet, cacheSet } from "@/lib/redis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CACHE_TTL = 60

export async function GET(request: Request) {
  try {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/fuel/public-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full verification gates**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0 errors · full vitest suite green · next build 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add app/api/fuel/route.ts tests/fuel/public-route.test.ts docs/superpowers/plans/2026-06-22-fuel-display-fix.md
git commit -m "$(cat <<'EOF'
feat(fuel): public GET /api/fuel?address= read endpoint

subfrost.io owns the FuelAllocation table; expose a public, cached,
exact-match read so app.subfrost.io can stop reading the stale legacy DB.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Open the PR**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git push -u origin feat/fuel-public-read
gh pr create --title "feat(fuel): public read endpoint for FUEL allocations" \
  --body "Adds public GET /api/fuel?address= reading subfrost-postgres so the app can read FUEL from the DB the admin writes to. Part of the FUEL display fix (spec + plan in docs/superpowers). No schema change. Shape { amount }.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Task 2: subfrost-app — `lib/fuel-remote.ts` client

**Repo:** `C:\Alkanes Geral Dev\subfrost-app` · **Branch:** `feat/fuel-remote-read` (create off `main`)

**Pre-step (run once before Step 1):**
```bash
cd "C:/Alkanes Geral Dev/subfrost-app" && git checkout main && git pull --ff-only && git checkout -b feat/fuel-remote-read
```

**Files:**
- Create: `lib/fuel-remote.ts`
- Test: `lib/__tests__/fuel-remote.test.ts`

**Interfaces:**
- Consumes: `process.env.SUBFROST_IO_FUEL_URL`, global `fetch`.
- Produces:
  - `isRemoteFuelEnabled(): boolean` — true iff `SUBFROST_IO_FUEL_URL` is set.
  - `remoteFuelLookup(address: string): Promise<{ amount: number }>` — GETs `${base}/api/fuel?address=`; returns `{ amount: 0 }` on non-OK or malformed body; throws only on network/timeout. Used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/fuel-remote.test.ts`:

```ts
/**
 * Tests for lib/fuel-remote — the client subfrost-app uses to read FUEL
 * allocations from subfrost.io (public, keyless). Mirrors referral-remote.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isRemoteFuelEnabled, remoteFuelLookup } from '../fuel-remote';

const origUrl = process.env.SUBFROST_IO_FUEL_URL;

function mockFetch(json: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, json: async () => json });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  process.env.SUBFROST_IO_FUEL_URL = 'https://io.test';
});
afterEach(() => {
  process.env.SUBFROST_IO_FUEL_URL = origUrl;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isRemoteFuelEnabled', () => {
  it('is true only when the base URL is set', () => {
    expect(isRemoteFuelEnabled()).toBe(true);
    delete process.env.SUBFROST_IO_FUEL_URL;
    expect(isRemoteFuelEnabled()).toBe(false);
  });
});

describe('remoteFuelLookup', () => {
  it('GETs the public io endpoint with the address query and returns the amount', async () => {
    const fn = mockFetch({ amount: 42.5 });
    const res = await remoteFuelLookup('bc1ptap');
    expect(res).toEqual({ amount: 42.5 });
    const [url] = fn.mock.calls[0];
    expect(url).toBe('https://io.test/api/fuel?address=bc1ptap');
  });

  it('returns amount 0 on a non-OK response', async () => {
    mockFetch({ error: 'boom' }, false);
    expect(await remoteFuelLookup('bc1ptap')).toEqual({ amount: 0 });
  });

  it('returns amount 0 on a malformed amount', async () => {
    mockFetch({ amount: 'not-a-number' });
    expect(await remoteFuelLookup('bc1ptap')).toEqual({ amount: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost-app" && CI=true npx vitest run lib/__tests__/fuel-remote.test.ts`
Expected: FAIL — cannot resolve `../fuel-remote`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/fuel-remote.ts`:

```ts
/**
 * FUEL allocation client. subfrost.io now OWNS the fuel allocations table
 * (admin writes there); subfrost-app reads them server-side via a public
 * GET /api/fuel?address=. Mirrors lib/referral-remote.ts but KEYLESS — the io
 * fuel endpoint is public. Gated by env: when SUBFROST_IO_FUEL_URL is set the
 * /api/fuel route reads remote; otherwise it keeps reading the local DB. Env is
 * read per-call so the flip can be toggled without a rebuild.
 */
const TIMEOUT_MS = 5000

const baseUrl = () => process.env.SUBFROST_IO_FUEL_URL?.replace(/\/+$/, "")

/** True when FUEL should be served by subfrost.io, not the local DB. */
export function isRemoteFuelEnabled(): boolean {
  return Boolean(baseUrl())
}

/**
 * Look up one address's FUEL allocation from subfrost.io. Never throws on HTTP
 * errors or a malformed body — returns { amount: 0 } so the caller fails closed
 * (never the stale local DB). Network/timeout errors propagate to the caller.
 */
export async function remoteFuelLookup(address: string): Promise<{ amount: number }> {
  const res = await fetch(`${baseUrl()}/api/fuel?address=${encodeURIComponent(address)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return { amount: 0 }
  const data = (await res.json()) as { amount?: unknown }
  const amount = Number(data?.amount ?? 0)
  return { amount: Number.isFinite(amount) && amount >= 0 ? amount : 0 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost-app" && CI=true npx vitest run lib/__tests__/fuel-remote.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost-app"
git add lib/fuel-remote.ts lib/__tests__/fuel-remote.test.ts
git commit -m "$(cat <<'EOF'
feat(fuel): keyless remote client for subfrost.io fuel reads

Mirrors lib/referral-remote.ts. isRemoteFuelEnabled() gates on
SUBFROST_IO_FUEL_URL; remoteFuelLookup() GETs the public io endpoint and
fails closed to { amount: 0 }.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: subfrost-app — flip `app/api/fuel/route.ts` to remote

**Repo:** `C:\Alkanes Geral Dev\subfrost-app` · **Branch:** `feat/fuel-remote-read`

**Files:**
- Modify: `app/api/fuel/route.ts` (full new content below)
- Test: `app/api/fuel/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `isRemoteFuelEnabled`, `remoteFuelLookup` (`@/lib/fuel-remote`, Task 2); `prisma.fuelAllocation.findUnique` (`@/lib/db/prisma`); `cache` (`@/lib/db/redis`).
- Produces: unchanged HTTP contract `GET /api/fuel?address=` → `{ amount }`. `useFuelAllocation.ts` is untouched.

- [ ] **Step 1: Write the failing test**

Create `app/api/fuel/__tests__/route.test.ts`:

```ts
/**
 * /api/fuel flips between the remote io read (SUBFROST_IO_FUEL_URL set) and the
 * legacy local-DB read. On the remote path it must NEVER read the local DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/fuel-remote', () => ({
  isRemoteFuelEnabled: vi.fn(),
  remoteFuelLookup: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = { fuelAllocation: { findUnique: vi.fn() } };
  return { prisma, default: prisma };
});

vi.mock('@/lib/db/redis', () => ({
  cache: { get: vi.fn(), set: vi.fn() },
}));

import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';
import { isRemoteFuelEnabled, remoteFuelLookup } from '@/lib/fuel-remote';
import { GET } from '../route';

const req = (url: string) => new Request(url) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cache.get).mockResolvedValue(null);
});

describe('GET /api/fuel (remote mode)', () => {
  it('reads from subfrost.io and never touches the local DB', async () => {
    vi.mocked(isRemoteFuelEnabled).mockReturnValue(true);
    vi.mocked(remoteFuelLookup).mockResolvedValue({ amount: 9.5 });
    const res = await GET(req('http://localhost/api/fuel?address=bc1pa'));
    expect(await res.json()).toEqual({ amount: 9.5 });
    expect(remoteFuelLookup).toHaveBeenCalledWith('bc1pa');
    expect(prisma.fuelAllocation.findUnique).not.toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith('fuel:bc1pa', { amount: 9.5 }, 60);
  });

  it('returns amount 0 when the remote lookup throws (never the local DB)', async () => {
    vi.mocked(isRemoteFuelEnabled).mockReturnValue(true);
    vi.mocked(remoteFuelLookup).mockRejectedValue(new Error('io down'));
    const res = await GET(req('http://localhost/api/fuel?address=bc1pa'));
    expect(await res.json()).toEqual({ amount: 0 });
    expect(prisma.fuelAllocation.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/fuel (local mode)', () => {
  it('reads from the local DB when the remote flip is off', async () => {
    vi.mocked(isRemoteFuelEnabled).mockReturnValue(false);
    vi.mocked(prisma.fuelAllocation.findUnique).mockResolvedValue({ amount: 3 } as never);
    const res = await GET(req('http://localhost/api/fuel?address=bc1pb'));
    expect(await res.json()).toEqual({ amount: 3 });
    expect(remoteFuelLookup).not.toHaveBeenCalled();
  });
});

describe('GET /api/fuel (validation)', () => {
  it('returns 400 when address is missing', async () => {
    vi.mocked(isRemoteFuelEnabled).mockReturnValue(true);
    const res = await GET(req('http://localhost/api/fuel'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost-app" && CI=true npx vitest run app/api/fuel/__tests__/route.test.ts`
Expected: FAIL — route does not import `@/lib/fuel-remote` yet, so remote-mode assertions fail (it still calls `prisma.fuelAllocation.findUnique`).

- [ ] **Step 3: Write the implementation (full new file content)**

Replace `app/api/fuel/route.ts` with:

```ts
/**
 * GET /api/fuel?address=X — Public endpoint for wallet FUEL allocation lookup.
 * Cached 60s via Redis.
 *
 * When SUBFROST_IO_FUEL_URL is set, FUEL is read from subfrost.io (the owner of
 * the allocations table) via lib/fuel-remote; otherwise it reads the local DB
 * (legacy / local-dev). subfrost.io/admin writes the allocations, so the remote
 * path is the source of truth in prod. On the remote path a failed fetch returns
 * { amount: 0 } — never the stale local DB. See lib/fuel-remote.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';
import { isRemoteFuelEnabled, remoteFuelLookup } from '@/lib/fuel-remote';

const CACHE_TTL = 60;
const DEV_FUEL_ALLOCATIONS: Record<string, number> = {
  bc1p3692m0sd6nq5mv4uq0yz2laet3r0asw8kpkrdunkk8ddk045nxzsl2vdsq: 0.01,
  bc1prx42gsu83kxsg54nvw3edykuzdhh7vshm9hq4nkmkewmhtlv3stqhuqw3t: 0.01,
};

function parseFuelAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'object' && value !== null && 'amount' in value
    ? (value as { amount?: unknown }).amount
    : value;
  const amount = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function getDevFuelAllocation(address: string): number {
  if (process.env.NODE_ENV === 'production') return 0;
  return DEV_FUEL_ALLOCATIONS[address.toLowerCase()] ?? 0;
}

export async function GET(request: NextRequest) {
  let address = '';
  try {
    address = new URL(request.url).searchParams.get('address')?.trim() ?? '';
    if (!address) {
      return NextResponse.json({ error: 'address query param required' }, { status: 400 });
    }

    const cacheKey = `fuel:${address}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached !== null) {
      const cachedAmount = parseFuelAmount(cached);
      if (cachedAmount !== null) {
        return NextResponse.json({ amount: cachedAmount }, {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
      }
    }

    let result: { amount: number };
    if (isRemoteFuelEnabled()) {
      // Remote path: subfrost.io owns the data. Fail closed to 0 — never the
      // stale local DB (the source of this bug).
      try {
        result = await remoteFuelLookup(address);
      } catch (e) {
        console.error('[API /fuel] remote lookup failed:', e);
        result = { amount: 0 };
      }
    } else {
      // Legacy / local-dev path: read the local DB.
      const allocation = await prisma.fuelAllocation.findUnique({
        where: { address },
        select: { amount: true },
      });
      result = { amount: allocation?.amount ?? 0 };
      if (result.amount <= 0) {
        result.amount = getDevFuelAllocation(address);
      }
    }
    await cache.set(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[API /fuel] Error:', error);
    return NextResponse.json({ amount: getDevFuelAllocation(address) }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost-app" && CI=true npx vitest run app/api/fuel/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full verification gates**

Run: `cd "C:/Alkanes Geral Dev/subfrost-app" && npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0 errors · full vitest suite green · next build 0 errors.

> If `npx next build` is too heavy/slow in this environment, at minimum run `npx tsc --noEmit` + the full `CI=true npx vitest run` and note the build was deferred to CI in the PR.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost-app"
git add app/api/fuel/route.ts app/api/fuel/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(fuel): read FUEL from subfrost.io via env-gated flip

When SUBFROST_IO_FUEL_URL is set, /api/fuel reads allocations from
subfrost.io (the owner) instead of the stale local DB. Fails closed to
{ amount: 0 } on remote error; keeps the local-DB read as the unset-env
fallback. Fixes FUEL allocations not appearing in the wallet.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Open the PR**

```bash
cd "C:/Alkanes Geral Dev/subfrost-app"
git push -u origin feat/fuel-remote-read
gh pr create --title "feat(fuel): read FUEL from subfrost.io (env-gated flip)" \
  --body "Flips /api/fuel to read from subfrost.io's public endpoint when SUBFROST_IO_FUEL_URL is set, fixing FUEL allocations not showing in the wallet (admin writes subfrost-postgres, app read the stale subfrost-db). Keyless mirror of referral-remote. Local-DB read stays as the unset-env fallback. Requires SUBFROST_IO_FUEL_URL=https://subfrost.io in the app env to activate.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Task 4: Deploy, env wiring & live verification (ops — no code)

Do these only after BOTH PRs are reviewed and merged.

- [ ] **Step 1: Merge + deploy subfrost.io**
  - `gh pr merge <io-pr> --merge` (subfrost.io).
  - Watch the GitHub Actions "Deploy to GCP" run: `gh run watch <id>`. It builds + pushes a short-sha image to Artifact Registry. (The "Deploy to Cloud Run" step FAILS — legacy, ignore.)
  - Bump `newTag` in `k8s/kustomization.yaml` to the new short-sha → commit on a bump branch → PR → merge. Flux reconciles `k8s/@main` and rolls the GKE deployment (pods 2/2). Confirm: `curl https://subfrost.io/api/health` → 200.

- [ ] **Step 2: Confirm the io endpoint is live**
  - In `subfrost.io/admin/fuel`, allocate a FRESH test address with a known amount.
  - `curl "https://subfrost.io/api/fuel?address=<addr>"` → `{ "amount": <known> }`.
  - `curl "https://subfrost.io/api/fuel?address=bc1pdefinitelynotallocated"` → `{ "amount": 0 }`.

- [ ] **Step 3: Merge + deploy subfrost-app**
  - `gh pr merge <app-pr> --merge` (subfrost-app). Confirm the app's deploy pipeline (check `subfrost-app/.github/workflows/deploy.yml` — Cloud Run vs GKE) ships the new image.

- [ ] **Step 4: Set the env (flex lane) — REQUIRED to activate**
  - The fix is dark until `SUBFROST_IO_FUEL_URL=https://subfrost.io` is set in the subfrost-app runtime env (same mechanism as `SUBFROST_IO_REFERRAL_URL`). Coordinate with flex / whoever owns the app's env/secrets. Until set, the app keeps reading the local DB (safe — no regression, just unfixed).

- [ ] **Step 5: Live end-to-end verification**
  - With the env set + app deployed: `curl "https://app.subfrost.io/api/fuel?address=<addr>"` → same amount as the io endpoint (allow up to ~60s for the app's Redis TTL).
  - Connect a wallet whose address has a fresh allocation → confirm the FUEL amount now shows.
  - Spot-check a PRE-EXISTING (old) allocation still resolves correctly (it's in the io DB post-migration — see fuel-import work).
  - Roll back instantly if needed by unsetting `SUBFROST_IO_FUEL_URL` (app reverts to local DB) — no redeploy required.

---

## Self-Review notes

- **Spec coverage:** io public endpoint (Task 1) · keyless remote client mirroring referral-remote (Task 2) · env-gated flip + never-fall-back-to-stale-DB + preserved cache/dev-allocations (Task 3) · public/no-auth + exact-match + `{amount}` shape (Tasks 1+3) · light 60s io cache (Task 1) · deploy mechanics + `SUBFROST_IO_FUEL_URL` flex dependency + live verification (Task 4). No schema/migration (none planned — correct).
- **No placeholders:** all test + impl code is complete and runnable.
- **Type consistency:** `isRemoteFuelEnabled()`/`remoteFuelLookup()` signatures defined in Task 2 are consumed verbatim in Task 3; response shape `{ amount: number }` is identical across io route, remote client, and app route.
