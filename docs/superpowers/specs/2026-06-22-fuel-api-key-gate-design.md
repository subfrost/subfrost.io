# FUEL API key gate (design)

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branch: `feat/fuel-api-key-gate`

## Goal

Gate the currently-public `GET /api/fuel?address=X` endpoint behind a **static shared
secret** so only authorized services (subfrost-app) can read FUEL allocations. flex asked
for "a static secret API key of some kind to query subfrost.io for that data". subfrost.io
owns the allocations table; the app reads them server-to-server. After this change the
endpoint requires the secret in an `x-api-key` header — missing/wrong → `401`, unconfigured
→ `503`.

This is a web-admin / data surface, **not** on-chain.

## Decisions (locked during brainstorming)

1. **Dedicated `FUEL_API_KEY`** (not reusing `REFERRAL_API_KEY`). Least-privilege:
   independent rotation, smaller blast radius, the FUEL and referral lanes stay decoupled.
2. **`x-api-key` header** — mirrors exactly how the referral endpoints already authenticate
   (`requireServiceKey` reads `x-api-key`). One cross-service convention in the codebase.
3. **Generalize, don't duplicate.** The constant-time compare (`timingSafeEqual`) is a
   security primitive; it must live in one place. Extract a shared
   `requireApiKey(request, expected, envName)` and have both referral and fuel call it.

## Non-goals (explicitly out of scope)

- **No per-user / DB-backed keys.** This is a single shared service secret, not the CMS
  `ApiKey` table (`lib/cms/apikey-auth.ts`, `Authorization: Bearer`). Different purpose.
- **No scopes / privileges.** The key is all-or-nothing for this one read endpoint.
- **No change to the response shape or cache.** Still `{ amount: number }`, still Redis 60s,
  still exact-match address. Only an auth check is added in front.
- **No rotation tooling / key-rotation UI.** Rotation = regenerate the Secret Manager value
  + bump the app's secret; out of scope here.
- **No rate limiting / IP allowlist.** The shared key is the access control for v1.

## Architecture

The only real security primitive is the constant-time key comparison. Today it is embedded
in `lib/referral/auth.ts` as `requireServiceKey`, hardcoded to `REFERRAL_API_KEY`. We lift
the core into a shared helper so it is not duplicated:

### `lib/api/service-key.ts` (new — shared)

```ts
export function requireApiKey(
  request: NextRequest,
  expected: string | undefined,
  envName: string,
): NextResponse | null
```

- `expected` falsy → `503` `{ error: "<envName> not configured" }`
- reads `x-api-key` header, constant-time compares (length-guarded `timingSafeEqual`)
- mismatch → `401` `{ error: "Unauthorized" }`
- match → `null` (caller proceeds)

The `safeEqual` helper (length check + `timingSafeEqual`) moves here too — single home for
the compare.

### `lib/referral/auth.ts` (refactor — behavior unchanged)

`requireServiceKey(request)` keeps its **public signature** and delegates:

```ts
return requireApiKey(request, process.env.REFERRAL_API_KEY, "REFERRAL_API_KEY")
```

The 3 invite-codes routes and `tests/api/invite-codes.test.ts` are untouched and still pass.

### `app/api/fuel/route.ts` (gate)

- Change handler to `(request: NextRequest)` to match the invite-codes routes.
- **First thing** inside the `try`:
  ```ts
  const denied = requireApiKey(request, process.env.FUEL_API_KEY, "FUEL_API_KEY")
  if (denied) return denied
  ```
- Everything else unchanged: `400` if no `address`, Redis 60s cache, `{ amount }` shape,
  `500` on catch. Update the file's top comment (no longer "Public (no auth)").

## Data flow

```
subfrost-app (server)                 subfrost.io
  GET /api/fuel?address=X
  header x-api-key: <FUEL_API_KEY> ──▶ requireApiKey(req, env.FUEL_API_KEY, "FUEL_API_KEY")
                                         ├─ env unset      → 503
                                         ├─ header missing → 401
                                         ├─ header wrong   → 401
                                         └─ ok → cache/db lookup → { amount }
```

## Error handling

| Condition                         | Status | Body                                   |
|-----------------------------------|--------|----------------------------------------|
| `FUEL_API_KEY` env unset          | 503    | `{ error: "FUEL_API_KEY not configured" }` |
| `x-api-key` missing or wrong      | 401    | `{ error: "Unauthorized" }`            |
| valid key, no `address` param     | 400    | `{ error: "address query param required" }` |
| valid key, ok                     | 200    | `{ amount: number }`                   |
| unexpected error                  | 500    | `{ error: "Failed to read fuel allocation" }` |

Auth is checked **before** reading the address or hitting the cache (same order as referral).

## Testing

New `tests/api/fuel.test.ts`, mirroring `tests/api/invite-codes.test.ts` (mock `@/lib/prisma`
+ `@/lib/redis`, build requests with `NextRequest`, set `process.env.FUEL_API_KEY` in
`beforeEach`):

- `401` when no `x-api-key` header
- `401` when `x-api-key` is wrong
- `503` when `FUEL_API_KEY` is unset
- `200` + `{ amount: N }` for a known address with the correct key
- `200` + `{ amount: 0 }` for an unknown address with the correct key
- `400` when address is missing but key is correct (auth passes, validation fails)

Existing `tests/api/invite-codes.test.ts` must stay green (proves the refactor is inert).

## Deployment (parts 2 & 3 — same pattern as SP-4)

### Part 2 — secret / ESO / env (subfrost.io)

1. Generate a random key (e.g. `openssl rand -hex 32`).
2. Create secret `fuel-api-key` in GCP Secret Manager via io-sa (full cloud-platform scope),
   add the version. (Same mechanics used for `stripe-webhook-secret` in SP-4.)
3. **Only after the secret exists**, add an entry to `k8s/external-secrets.yaml` (ESO syncs
   `data` atomically) mapping `fuel-api-key` → `FUEL_API_KEY`.
4. Add `FUEL_API_KEY` (`optional: true`) to the env block in `k8s/deployment.yaml`, like the
   `STRIPE_*` entries.
5. Code PR merges to main → Cloud Build → bump `newTag` in `k8s/kustomization.yaml` (deploy
   PR) → Flux rolls GKE.

Validate live: `curl https://subfrost.io/api/fuel?address=<addr>` without a key → 401; with
the correct `x-api-key` → `{ amount }`.

### Part 3 — subfrost-app

The local `feat/fuel-remote-read` branch (in `C:\Alkanes Geral Dev\subfrost-app`) currently
calls `SUBFROST_IO_FUEL_URL/api/fuel` keyless. It must send `x-api-key: <FUEL_API_KEY>` (read
from an app env var). PR to `subfrost/subfrost-app` → flex merges.

⚠️ **Write access:** Vdto88 was read-only + fork disabled on subfrost-app. flex said "you can
make a PR", so confirm write is unlocked first (test push to a throwaway branch, or
`gh api repos/subfrost/subfrost-app -q .permissions`). If still blocked, package the change
for flex to apply (handoff dir already exists at `C:\Alkanes Geral Dev\fuel-fix-handoff\`).

## Sequencing / activation note

Order matters to avoid breaking the live app's FUEL read:

1. Ship the io gate **with the env optional**. Until `FUEL_API_KEY` is set in prod, the
   endpoint returns `503` — so the app's call (still keyless at that point) breaks anyway.
   To avoid a window where the app gets `503`/`401`, coordinate: set the secret/env in prod
   **before or together with** the app PR landing.
2. Activation is a **silent-failure risk**: if flex sets `SUBFROST_IO_FUEL_URL` but forgets
   the app-side key env (or sets the secret in io but not the env), the wallet shows FUEL 0
   with no error. Call this out explicitly in the app PR description and the flex handoff.

## Verification

- `tsc --noEmit` → 0 errors
- `CI=true npx vitest run` → green (new fuel tests + existing referral tests)
- `next build` → 0 errors
- Live (post-deploy): `curl .../api/fuel?address=X` no key → 401; correct `x-api-key` →
  `{ amount }` 200.
