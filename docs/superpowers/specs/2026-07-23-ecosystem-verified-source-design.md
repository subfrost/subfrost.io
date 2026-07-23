# Ecosystem: "Verified source" tab, and every alkane link points at the explorer

**Date:** 2026-07-23
**Origin:** flex (Matrix), after shipping the explorer's source-browser API.

> "We just need to update /ecosystem so it points to explorer.subfrost.io.
> 1. Also check explorer.subfrost.io/docs and subvh.
> 2. Now theres an API to serve source code browser"

Closing the loop on the Gabe x flex conversation of 2026-07-22, where the two of them agreed:
rendering a verified-source attestation on `subfrost.io` is fine, running the verification stays
in the explorer. Gabe's close: *"render the info underneath 'Verified source', that will be
enough"* + *"we can link out for anything additional"*.

One deliverable, one PR, plus one data step that cannot go through a PR.

---

## Goal

1. Every alkane link under `/ecosystem` points at `explorer.subfrost.io`. Today three still point
   at `espo.sh`.
2. Each project profile with a verified contract gains a **Source** tab carrying the attestation:
   verdict, byte match, the source it was reproduced from, the commit, and a link out to the
   explorer's own source browser.

## Non-goals

- **No source browser on subfrost.io.** No file tree, no file viewer, no `/tree` or `/blob` calls.
  flex's standing rule is *"On subfrost.io I don't want user interactive features"*, and a
  clickable file tree is exactly that. The explorer already ships that browser at
  `/alkane/{id}/source`; we link to it. This is a deliberate reversal of a larger scope considered
  earlier in the session and rejected.
- **No verification triggering.** Submitting an alkane for verification stays in the explorer and
  in `alkanes-cli`.
- **No "not verified" state.** A project with no verified source simply has no Source tab.
- **No change to the directory-level Contracts tab.** It stays "Coming soon". Separate problem.
- **No new dependency.**

---

## What is actually on the page today (measured 2026-07-23, production)

Worth writing down, because two assumptions from the previous session turned out to be wrong.

| profile | contract rows | tabs today | `url` field |
|---|---|---|---|
| arbuzino | **6** (renders `ContractsTable`) | Overview, Products, Reading on-chain data, Contracts | ok |
| diesel | 0 | none | **`espo.sh/alkane/2:0`** |
| fire | 0 | Overview, Supply & Halving, Staking & Locks, Bonding & Floor, Risks | **`espo.sh/alkane/2:77623`** |
| frbtc, arbuz, acai, goji, alkane-pandas, wunsch-vault | 0 | acai and goji have markdown tabs; the rest have none | ok |

Two corrections to earlier notes:

- `ContractsTable` is **not** dead code, but it renders for exactly **one** project (arbuzino).
- The `espo.sh` links on the diesel and fire profiles are **not** contract rows. They are the
  **"Website" button**, driven by the project's `url` column in the database. Same shape as the
  WUNSCH fix of 2026-07-22 (`url` was ordiscan). So "point it at the explorer" is partly a code
  change and partly a data change.

## The API this is built on

`explorer.subfrost.io/docs/source-browser`, shipped by flex on 2026-07-23. Three GETs; we consume
**only the first**.

```
GET /api/v1/{key}/source/{block}/{tx}
```

Returns `{ ok, source: { alkane, block, tx, verified, verdict, match_pct, origin, repo, owner,
name, commit, subdir, package, entrypoint, private, fileCount } }`.

Measured facts that shape the design:

- **The key `subfrost` works.** Same store as `mainnet.subfrost.io/v4/{key}`, which this repo
  already hardcodes as the default of `SUBFROST_RPC_URL` in `lib/ecosystem/simulate.ts`.
- **Auth is real here:** an invalid key returns **401** (unlike the bookie read endpoints, which
  return 200 with a bogus key).
- Latency **0.4s to 0.85s** per call.
- The key travels as a **path segment**, so it must never be called from the browser. Server-side
  only.

### Verdict census (2026-07-23)

| alkane | project | verdict | match | origin | repo |
|---|---|---|---|---|---|
| `2:0` | DIESEL | reproducible | 100 | db | kungfuflex/alkanes-rs |
| `32:0` | frBTC | verified | 98.69 | db | subfrost/subfrost-alkanes |
| `2:77623` | FIRE | verified | 94.22 | db | kungfuflex/fire |
| `2:25349` | ARBUZ | verified | 98.84 | github | Misha-btc/**Acai** |
| `2:21219` | Acai | verified | 98.84 | github | Misha-btc/Acai |
| `2:10663` | Goji | reproducible | 100 | github | Misha-btc/Goji |
| `2:614` | Alkane Pandas | **404, no verified source** | | | |
| `4:777` | WUNSCH | **404, no verified source** | | | |

So the tab appears on **6 of 8** profiles that carry an `alkaneId`.

---

## Design

### 1. Data layer: `lib/ecosystem/verified-source.ts`

One exported function, modelled directly on `lib/ecosystem/simulate.ts`:

```ts
export interface VerifiedSource {
  alkaneId: string
  verdict: "reproducible" | "verified"
  matchPct: number
  origin: "db" | "github"
  repo: string
  commit: string
}

export async function fetchVerifiedSource(
  alkaneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedSource | null>
```

- Base URL: `process.env.EXPLORER_SOURCE_API || "https://explorer.subfrost.io/api/v1/subfrost/source"`.
  Same env-var-with-a-working-default shape as `SUBFROST_RPC_URL`, so no secret has to exist for
  this to work in CI or locally.
- Splits `block:tx` into `/{block}/{tx}`. Guards with the existing `isValidAlkaneId`.
- `AbortSignal.timeout(8000)`.
- `next: { revalidate: 3600 }` on the fetch. Verdicts change rarely, so the common case is a cache
  hit and the profile page pays nothing.
- **Never throws. Returns `null` on every unhappy path:** non-ok status (404 and 401 included),
  `ok !== true`, `verified !== true`, a verdict outside `reproducible | verified`, `match_pct` that
  is not a finite number in `[0, 100]`, a `repo` that fails the existing `isValidHttpUrl`, or any
  malformed or missing field.

Returning `null` rather than a partial object is what lets the caller treat "no attestation" and
"the explorer is down" identically, which is the correct behaviour for a decorative panel.

### 2. Component: `components/ecosystem/VerifiedSource.tsx`

A **server component**. No `"use client"`, no state, no handlers. Static rendered markup, which is
what keeps it on the right side of flex's "no interactive features" line.

Renders, under an h2 "Verified source":

- a verdict pill: **Reproducible** (byte-exact) or **Verified** (host-dependent residual);
- **Byte match**: `98.69%`;
- **Reproduced from**: `subfrost/subfrost-alkanes`;
- **Commit**: `0748786d` (first 8 chars);
- a link out, built from `v.alkaneId`: **"Browse the source on the explorer"** to `explorer.subfrost.io/alkane/{id}/source`.

Two deliberate choices:

**The repo becomes a GitHub link only when `origin === "github"`.** Measured: frBTC, FIRE and
DIESEL come back as `origin: "db"`, and `subfrost/subfrost-alkanes` and `kungfuflex/fire` return
404 on GitHub even with an authenticated token. Linking them would ship users to an error page.
The API's `private` flag cannot be used to decide this, because it comes back `true` even for
`kungfuflex/alkanes-rs`, which is public. `origin` can: `github` means the explorer reads that repo
live at request time, so it is publicly readable by definition. DIESEL loses a link that would
technically have worked; that is the acceptable side of a conservative rule.

**The label is "Reproduced from", not "Repository".** ARBUZ (`2:25349`) resolves to
`Misha-btc/Acai`, byte-identical to Acai's own record down to the fourteenth decimal of
`match_pct`. Most likely the same free-mint binary deployed twice, which makes the attestation
correct but makes "ARBUZ's repository: Acai" read like a bug. "Reproduced from" is true in both
readings and needs no special case in code. Flagged to flex; if he confirms a resolver collision,
the fix is data-side, not here.

### 3. Wiring: `app/ecosystem/[slug]/page.tsx`

`alkaneId` only exists after the profile resolves, so the call cannot join the existing
`Promise.all`. It runs after it:

```ts
const verified = p.alkaneId ? await fetchVerifiedSource(p.alkaneId).catch(() => null) : null
```

`.catch(() => null)` matches the treatment already given to `getEcosystemStatsWithDelta` and
`getEcosystemPriceSeries`: a decorative panel must never take down a profile. With the hourly
revalidate this is a cache hit in the common case.

### 4. Tab assembly: `components/ecosystem/EcosystemProfile.tsx`

`EcosystemProfile` gains an optional `verified` prop and hands it to `ProfileBody`, which appends
the tab last, after Overview, the markdown sections and Contracts:

```ts
if (verified) {
  tabs.push({ key: "source", label: copy.sourceTab })
  panels.push(<VerifiedSourcePanel v={verified} copy={copy.source} />)
}
```

`alkaneId` is **not** threaded separately: `VerifiedSource` already carries the `alkaneId` it was
resolved for, so the panel builds its own explorer link from `v.alkaneId`. One source of truth, and
no non-null assertion at the call site.

**No existing branch changes.** `ProfileBody` has a `tabs.length === 1` path that renders the lone
panel with no tablist and prints a heading only for `contracts`. frBTC, ARBUZ and Alkane Pandas
have **zero** tabs today, so Source becomes their only tab and would land in that path. Rather than
widening the condition, the panel **owns its own `<h2>`**, which renders correctly in both layouts
and leaves the existing `contracts` behaviour byte-identical. The component is named
`VerifiedSourcePanel` so it does not collide with the `VerifiedSource` type where both are imported.

### 5. Point the contract rows at the explorer

`ContractsTable` (`EcosystemProfile.tsx:152`) swaps the hardcoded
`` `https://espo.sh/alkane/${c.alkaneId}` `` for the existing `alkaneExplorerUrl(c.alkaneId)` from
`lib/ecosystem/constants.ts`, which is already the helper behind the profile-header and
directory-card badges. Affects arbuzino's 6 rows today and everything added later.

### 6. Copy, EN and ZH

Added to `ProfileCopy` in `app/ecosystem/[slug]/page.tsx`, where the rest of the profile copy
already lives:

| key | EN | ZH |
|---|---|---|
| `sourceTab` | Source | 源码 |
| `verifiedSourceTitle` | Verified source | 已验证源码 |
| `verdictReproducible` | Reproducible | 可复现 |
| `verdictVerified` | Verified | 已验证 |
| `verdictReproducibleNote` | The rebuilt wasm is byte-exact to the on-chain bytecode. | 重新构建的 wasm 与链上字节码逐字节一致。 |
| `verdictVerifiedNote` | Logic and structure match, with a small host-dependent residual in build metadata. | 逻辑与结构完全一致，仅构建元数据存在少量依赖构建主机的差异。 |
| `matchLabel` | Byte match | 字节匹配度 |
| `reproducedFrom` | Reproduced from | 复现自 |
| `commitLabel` | Commit | 提交 |
| `browseOnExplorer` | Browse the source on the explorer | 在浏览器中查看源码 |

**Zero em-dash**, EN and ZH (`——` included), per the content rule.

### 7. Tests

The governing lesson is the zombie test from 2026-07-22: a `/ecosystem` test kept passing after the
label it queried stopped existing, because it asserted on a name instead of a value. So every
assertion below is on a **value or an href**, and each guard is confirmed to fail in the opposite
direction before the PR goes up.

`tests/ecosystem/verified-source.test.ts` (new), against a stubbed `fetchImpl`:

- happy path maps every field, including `match_pct` to `matchPct`;
- 404, 401, 500, network throw, timeout, non-JSON body → `null`;
- `verified: false` → `null`;
- verdict `"pending"` → `null`;
- `match_pct` of `null`, `NaN`, `-1` and `101` → `null`;
- `repo` of `"not-a-url"` → `null`;
- the request URL contains `/32/0` for input `"32:0"`.

`tests/ecosystem/verified-source-panel.test.tsx` (new):

- renders `98.69%`, `subfrost/subfrost-alkanes` and `0748786d`;
- `origin: "github"` renders an anchor whose href is the GitHub repo;
- `origin: "db"` renders the repo as text with **no** anchor to github.com;
- the explorer link href is exactly `https://explorer.subfrost.io/alkane/32:0/source`;
- both verdicts render their own note.

`tests/ecosystem/profile-page.test.tsx` (existing, edited):

- the contracts-row assertion moves from `https://espo.sh/alkane/4:257` to
  `https://explorer.subfrost.io/alkane/4:257`, asserting on **href**;
- a Source tab appears when a `VerifiedSource` is passed and is absent when `null`;
- a profile whose only tab is Source renders the "Verified source" heading (the widened
  single-tab branch).

---

## Rollout

1. PR with everything in sections 1 to 7. No migration, no schema change, no new env var required
   (the default works).
2. Merge. `newTag` bumps automatically; Flux and Cloud Run pick it up.
3. **Data step, after the rollout, in `/admin/ecosystem`:** change `url` on **diesel** and **fire**
   from `espo.sh/alkane/...` to `explorer.subfrost.io/alkane/...`. This is a row edit on an existing
   column, so the `prisma db push --accept-data-loss` ordering trap does not apply. It cannot go
   through a PR because the directory data lives in the production database, not in
   `scripts/data/ecosystem-seed.json`, which is stale.
4. Verify in production, walking every published slug: `espo.sh` appears **zero** times anywhere
   under `/ecosystem`, and exactly the six alkanes from the verdict census render a Source tab
   (diesel, frbtc, fire, arbuz, acai, goji), while alkane-pandas and wunsch-vault do not.
   Check both locales, since the copy is duplicated per locale.

## Open questions for flex, none of them blocking

- **ARBUZ resolves to `Misha-btc/Acai`.** Same commit, same `match_pct` to fourteen decimals, same
  `fileCount`. Genuinely the same binary, or a resolver collision?
- **`/alkane/{id}/source` was returning "Backend temporarily unavailable, the indexer didn't
  respond" from 12:16 to at least 12:29 UTC on 2026-07-23**, while the source API answered 200 the
  whole time. That page is the link-out target Gabe agreed to, so it should be up.
- **`subvh`** does not resolve: no DNS on `subvh.subfrost.io`, 404 on `explorer.subfrost.io/subvh`,
  no mention across the six `/docs` pages, no repo under `subfrost` or `kungfuflex`. What is it?
