# Ecosystem Profile: Honest Stats and a Single Description — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/ecosystem/<slug>` profiles from showing meaningless token metrics on contract pages, and stop printing the same paragraph twice.

**Architecture:** Three independent changes. A pure visibility guard filters generic stat cards whose value carries no information (fixes a real `$0.0000` bug). A new curated `showMarketStats` boolean decides which projects are markets at all. And the profile header stops rendering the short description when the profile markdown already opens with an Overview.

**Tech Stack:** Next.js 16 (App Router, server components), Prisma/Postgres, React 19, Vitest + Testing Library, Tailwind, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-22-ecosystem-profile-stats-and-overview-design.md`

## Global Constraints

- Package manager is **pnpm**. `npm ci` fails in a worktree. Use `pnpm install --frozen-lockfile`.
- There is **no `typecheck` script**. Run `node_modules/.bin/tsc --noEmit`.
- Tests run with `node_modules/.bin/vitest run tests/ecosystem/`.
- All user-facing copy ships **EN and ZH**. This change adds no new copy strings.
- Prisma changes must be **additive with a default**, never a required column, so the running image (which does not select the column) and the new image (which does) are both valid against the same database.
- Do not touch `lib/ecosystem/adapters/` — custom stats are curated and exact by construction, and a legitimate `0` there is real information.
- Do not rewrite any project's copy. This is a rendering change only.

---

### Task 1: `isMeaningfulStat` visibility guard

**Files:**
- Create: `lib/ecosystem/stat-visibility.ts`
- Test: `tests/ecosystem/stat-visibility.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isMeaningfulStat(value: number | string | null | undefined): boolean` — true only when the value parses to a finite number strictly greater than zero. Task 2 imports it.

- [ ] **Step 1: Write the failing test**

Create `tests/ecosystem/stat-visibility.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { isMeaningfulStat } from "@/lib/ecosystem/stat-visibility"

describe("isMeaningfulStat", () => {
  it("accepts positive numbers and positive numeric strings", () => {
    expect(isMeaningfulStat(1)).toBe(true)
    expect(isMeaningfulStat(0.0001)).toBe(true)
    expect(isMeaningfulStat(8383)).toBe(true)
    expect(isMeaningfulStat("66916515276188")).toBe(true)
  })

  it("rejects zero — zero means 'no market' or 'unknown', never 'worth nothing'", () => {
    // The bug this guard exists for: priceUsd was 0 (not null) on 5 of 8 projects,
    // slipped past a `!= null` check, and rendered as "$0.0000".
    expect(isMeaningfulStat(0)).toBe(false)
    expect(isMeaningfulStat("0")).toBe(false)
  })

  it("rejects absent values", () => {
    expect(isMeaningfulStat(null)).toBe(false)
    expect(isMeaningfulStat(undefined)).toBe(false)
    expect(isMeaningfulStat("")).toBe(false)
  })

  it("rejects negatives and non-numeric strings", () => {
    expect(isMeaningfulStat(-1)).toBe(false)
    expect(isMeaningfulStat("n/a")).toBe(false)
    expect(isMeaningfulStat(Number.NaN)).toBe(false)
    expect(isMeaningfulStat(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vitest run tests/ecosystem/stat-visibility.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/ecosystem/stat-visibility"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/ecosystem/stat-visibility.ts`:

```ts
/**
 * Whether a generic token stat carries information worth a card.
 *
 * Generic stats come from an upstream that reports "no market" and "unknown" as 0, not null.
 * `StatHero` used to gate the price card on `!= null`, so a 0 rendered as "$0.0000" — a claim the
 * token is worthless rather than untraded. Same for a vault reading "HOLDERS 0 / SUPPLY 0".
 *
 * One rule covers holders, supply and price: a stat earns a card only when it parses to a finite
 * number strictly greater than zero. Supply arrives as a string, so parse rather than compare.
 *
 * Custom adapter stats deliberately do NOT pass through here — those are hand-written per slug and
 * a jackpot that is genuinely empty right now is real information.
 */
export function isMeaningfulStat(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) && n > 0
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node_modules/.bin/vitest run tests/ecosystem/stat-visibility.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ecosystem/stat-visibility.ts tests/ecosystem/stat-visibility.test.ts
git commit -m "feat(ecosystem): isMeaningfulStat guard for generic stat cards"
```

---

### Task 2: Apply the guard in `StatHero`

**Files:**
- Modify: `components/ecosystem/StatHero.tsx:64-69`
- Test: `tests/ecosystem/stat-hero.test.tsx` (add cases)

**Interfaces:**
- Consumes: `isMeaningfulStat` from Task 1.
- Produces: no signature change yet. `StatHero`'s props are unchanged in this task; Task 3 adds `showMarketStats`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ecosystem/stat-hero.test.tsx`, inside the existing `describe("StatHero", ...)` block:

```tsx
  it("drops generic cards whose value is zero or absent", () => {
    // Real production data: wunsch-vault 4:777 reported holders 0 / supply "0" / priceUsd 0,
    // and rendered "HOLDERS 0 / SUPPLY 0 / PRICE $0.0000".
    const { container } = render(
      <StatHero
        stats={{
          generic: { "4:777": { name: null, symbol: null, holders: 0, supply: "0", priceUsd: 0, marketcapUsd: null, volume24hUsd: null } },
          custom: [],
        }}
        mainAlkaneId="4:777"
        copy={copy}
        locale="en"
      />
    )
    expect(container.innerHTML).toBe("")
  })

  it("never renders $0.0000 — a zero price means untraded, not worthless", () => {
    render(
      <StatHero
        stats={{
          generic: { "2:614": { name: null, symbol: null, holders: 12, supply: "10", priceUsd: 0, marketcapUsd: null, volume24hUsd: null } },
          custom: [],
        }}
        mainAlkaneId="2:614"
        copy={copy}
        locale="en"
      />
    )
    const labels = screen.getAllByTestId("stat-label").map((n) => n.textContent)
    expect(labels).toEqual(["Holders", "Supply"])
    expect(screen.queryByText("$0.0000")).not.toBeInTheDocument()
  })

  it("keeps custom cards with a legitimate zero — the guard must not leak into curated stats", () => {
    render(
      <StatHero
        stats={{ generic: {}, custom: [{ key: "jackpot", label: "Tier-5 jackpot", value: "0", unit: "DIESEL" }] }}
        mainAlkaneId={null}
        copy={copy}
        locale="en"
      />
    )
    expect(screen.getByText("0 DIESEL")).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vitest run tests/ecosystem/stat-hero.test.tsx
```

Expected: FAIL — the first two cases fail because `holders: 0` and `priceUsd: 0` currently pass the `!= null` gate and render cards.

- [ ] **Step 3: Write minimal implementation**

In `components/ecosystem/StatHero.tsx`, add the import next to the existing ones at the top:

```tsx
import { isMeaningfulStat } from "@/lib/ecosystem/stat-visibility"
```

Replace lines 64-69 (the `const g = ...` block) with:

```tsx
  const g = mainAlkaneId ? stats.generic[mainAlkaneId] : undefined
  if (g) {
    if (cards.length < 4 && isMeaningfulStat(g.holders)) {
      cards.push({ k: "generic-holders", label: copy.holders, value: formatCompact(String(g.holders)) })
    }
    if (cards.length < 4 && isMeaningfulStat(g.supply)) {
      cards.push({ k: "generic-supply", label: copy.supply, value: formatCompact(g.supply as string) })
    }
    if (cards.length < 4 && isMeaningfulStat(g.priceUsd)) {
      const price = g.priceUsd as number
      cards.push({ k: "generic-price", label: copy.price, value: `$${price < 1 ? price.toFixed(4) : price.toFixed(2)}` })
    }
  }
```

- [ ] **Step 4: Run the whole ecosystem suite**

```bash
node_modules/.bin/vitest run tests/ecosystem/
```

Expected: PASS. The pre-existing `StatHero` cases still pass — their fixture uses `holders: 1234`, `supply: "100000"`, `priceUsd: 0.0102`, all positive.

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/StatHero.tsx tests/ecosystem/stat-hero.test.tsx
git commit -m "fix(ecosystem): stop rendering \$0.0000 and zero-valued stat cards"
```

---

### Task 3: `showMarketStats` — schema, read path, and profile page

**Files:**
- Modify: `prisma/schema.prisma:1953-1980` (model `EcosystemProject`)
- Modify: `lib/ecosystem/public.ts:6-21` (interface) and the two mappers at `:40-51` and `:84-96`
- Modify: `components/ecosystem/StatHero.tsx` (new required prop)
- Modify: `app/ecosystem/[slug]/page.tsx:74`
- Test: `tests/ecosystem/stat-hero.test.tsx`, `tests/ecosystem/public.test.ts`

**Interfaces:**
- Consumes: `isMeaningfulStat` (Task 1), the guard wiring (Task 2).
- Produces:
  - `EcosystemProject.showMarketStats: Boolean @default(false)` in Prisma.
  - `PublicEcosystemProject.showMarketStats: boolean` — Task 4's admin mapper reads the same column.
  - `StatHero` prop `showMarketStats: boolean` (**required**, no default — every call site must state its intent).

- [ ] **Step 1: Write the failing test**

Append to `tests/ecosystem/stat-hero.test.tsx`:

```tsx
  it("renders no generic cards when showMarketStats is false, even with perfect data", () => {
    render(
      <StatHero stats={stats({})} mainAlkaneId="2:25349" showMarketStats={false} copy={copy} locale="en" />
    )
    const labels = screen.getAllByTestId("stat-label").map((n) => n.textContent)
    expect(labels).toEqual(["Tier-5 jackpot", "Tickets (round / all-time)"]) // custom only
    expect(screen.queryByText("Holders")).not.toBeInTheDocument()
  })

  it("renders generic cards when showMarketStats is true", () => {
    render(
      <StatHero stats={stats({})} mainAlkaneId="2:25349" showMarketStats copy={copy} locale="en" />
    )
    expect(screen.getByText("Holders")).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vitest run tests/ecosystem/stat-hero.test.tsx
```

Expected: FAIL — `showMarketStats` is not a prop, so it is ignored and the first case still renders "Holders".

- [ ] **Step 3: Add the prop to `StatHero`**

In `components/ecosystem/StatHero.tsx`, change the component signature and the `g` line:

```tsx
export function StatHero({ stats, baseline, mainAlkaneId, showMarketStats, copy, locale, periodLabel }: {
  stats: ProjectStats | null
  baseline?: ProjectStats | null
  mainAlkaneId: string | null
  /**
   * Whether this project is a market — a fungible, traded token — and so whether holders/supply/
   * price mean anything. Curated per project, never derived: `arbuz` is unambiguously a token
   * (257 holders, 2.5e13 supply, a working price chart via its derived pool) yet its snapshot
   * priceUsd is 0, so any price-derived heuristic would hide it. Custom stats ignore this flag.
   */
  showMarketStats: boolean
  copy: StatHeroCopy
  locale: "en" | "zh"
  periodLabel?: string | null
}) {
```

and:

```tsx
  const g = showMarketStats && mainAlkaneId ? stats.generic[mainAlkaneId] : undefined
```

- [ ] **Step 4: Fix the pre-existing tests that now miss a required prop**

Every existing `<StatHero .../>` in `tests/ecosystem/stat-hero.test.tsx` that expects generic cards needs `showMarketStats`. Add `showMarketStats` (bare, i.e. `true`) to:
- "renders custom cards first, then generic fill up to 4 cards"
- "uses zh labels when locale=zh and labelZh exists"
- "renders nothing when stats null or no cards derivable" (both renders)
- "caps at 4 cards even with >4 custom stats and keeps keys stable"
- the three cases added in Task 2

Then run and confirm green:

```bash
node_modules/.bin/vitest run tests/ecosystem/stat-hero.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add the column to Prisma**

In `prisma/schema.prisma`, inside `model EcosystemProject`, add after the `alkaneId` line:

```prisma
  // Whether holders/supply/price mean anything for this project. Curated, default off: a new
  // project shows no market stats until someone deliberately says it is a market.
  showMarketStats Boolean @default(false)
```

Regenerate the client:

```bash
node_modules/.bin/prisma generate
```

- [ ] **Step 6: Expose it on the public read path**

In `lib/ecosystem/public.ts`, add to `interface PublicEcosystemProject` (after `alkaneId`):

```ts
  showMarketStats: boolean
```

Add `showMarketStats: r.showMarketStats,` to **both** mappers — the directory mapper (around line 43, after `alkaneId: r.alkaneId,`) and the `getEcosystemProfile` return (around line 83, same position).

- [ ] **Step 7: Pass it from the profile page**

In `app/ecosystem/[slug]/page.tsx`, line 74, add the prop to the `StatHero` element:

```tsx
statHero={<StatHero stats={s?.current ?? null} baseline={s?.baseline ?? null} periodLabel={s?.periodLabel ?? null} mainAlkaneId={p.alkaneId} showMarketStats={p.showMarketStats} copy={copy[locale].stats} locale={locale} />}
```

- [ ] **Step 8: Run the suite and typecheck**

```bash
node_modules/.bin/vitest run tests/ecosystem/
node_modules/.bin/tsc --noEmit
```

Expected: all ecosystem tests PASS; `tsc` silent. If `tests/ecosystem/public.test.ts` builds project fixtures by object literal, add `showMarketStats: false` to them — `tsc` will point at each one.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma lib/ecosystem/public.ts components/ecosystem/StatHero.tsx "app/ecosystem/[slug]/page.tsx" tests/ecosystem/
git commit -m "feat(ecosystem): showMarketStats gates generic holders/supply/price"
```

---

### Task 4: Admin — persist and toggle `showMarketStats`

**Files:**
- Modify: `actions/ecosystem/projects.ts:30-47` (input type) and the write payload around `:106-107`
- Modify: `components/cms/ecosystem/EcosystemAdmin.tsx` (admin type, `toInput`, form state, checkbox)
- Test: `tests/ecosystem/actions.test.ts`, `tests/ecosystem/admin-form.test.tsx`

**Interfaces:**
- Consumes: the Prisma column from Task 3.
- Produces: `saveEcosystemProject` accepts `showMarketStats: boolean` and persists it.

- [ ] **Step 1: Write the failing test**

First add the field to the shared fixture. In `tests/ecosystem/actions.test.ts`, inside `const validInput = { ... }` (around line 33), add next to `inMosaic: false,`:

```ts
  showMarketStats: false,
```

This is required: Step 3 adds `showMarketStats` as a **required** field on the action's input type, and several existing tests call `saveEcosystemProject(validInput)` without a cast. Adding it to the fixture once fixes every spread.

Then append this test to the `describe("saveEcosystemProject", ...)` block. It mirrors the existing `inMosaic` test at line ~123 exactly:

```ts
  it("persists showMarketStats", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValue({ id: "s1" } as never)
    await saveEcosystemProject({ ...validInput, showMarketStats: true })
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.showMarketStats).toBe(true)
  })

  it("defaults showMarketStats to false — a new project is not a market until someone says so", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValue({ id: "s2" } as never)
    await saveEcosystemProject(validInput)
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.showMarketStats).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vitest run tests/ecosystem/actions.test.ts
```

Expected: FAIL — `showMarketStats` is not in the input type (tsc/vitest error) and is never written.

- [ ] **Step 3: Thread it through the action**

In `actions/ecosystem/projects.ts`, add to the input interface (around line 40) next to `inMosaic: boolean`:

```ts
  showMarketStats: boolean
```

Required, not optional — matching `featured` and `inMosaic`. An optional field written as `input.showMarketStats ?? false` would silently clear an enabled flag on any save that omitted it.

Add to the `data` object (around line 106) next to `inMosaic: input.inMosaic,`:

```ts
    showMarketStats: input.showMarketStats,
```

- [ ] **Step 4: Thread it through the admin UI**

In `components/cms/ecosystem/EcosystemAdmin.tsx`:

1. Add `showMarketStats: boolean` to the admin project type (next to `featured: boolean`, around line 42).
2. Add `showMarketStats: false,` to the new-project defaults (around line 73).
3. Add `showMarketStats: p.showMarketStats,` to `toInput` (next to `featured: p.featured,`, around line 304).
4. Add form state next to the `featured` state (around line 344):

```tsx
  const [showMarketStats, setShowMarketStats] = useState(initial.showMarketStats)
```

5. Include `showMarketStats` in the object the form submits to `saveEcosystemProject`.
6. Render a checkbox in the form, following the existing checkbox markup in this file:

```tsx
  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
    <input
      type="checkbox"
      checked={showMarketStats}
      disabled={pending}
      onChange={(e) => setShowMarketStats(e.target.checked)}
      aria-label="Show market stats"
    />
    Show market stats (holders / supply / price)
  </label>
```

- [ ] **Step 5: Run tests and typecheck**

```bash
node_modules/.bin/vitest run tests/ecosystem/
node_modules/.bin/tsc --noEmit
```

Expected: PASS and silent. `tsc` will flag any admin fixture missing the new field; add `showMarketStats: false` to each.

- [ ] **Step 6: Commit**

```bash
git add actions/ecosystem/projects.ts components/cms/ecosystem/EcosystemAdmin.tsx tests/ecosystem/
git commit -m "feat(ecosystem): admin toggle for showMarketStats"
```

---

### Task 5: Description renders only when there is no Overview

**Files:**
- Modify: `components/ecosystem/EcosystemProfile.tsx:66` (header) and `:85-96` (`ProfileBody`)
- Test: `tests/ecosystem/profile-page.test.tsx`

**Interfaces:**
- Consumes: `splitProfileSections` (already imported in this file).
- Produces: no exported signature change. `ProfileBody` becomes a private function taking the already-split `intro`/`sections`, so the header and the body cannot disagree about whether an Overview exists.

- [ ] **Step 1: Write the failing test**

Append to `tests/ecosystem/profile-page.test.tsx` (reuse the file's existing profile fixture builder and `copy` object):

```tsx
it("omits the header description when the profile opens with an Overview", () => {
  // Inugami in production: the short description and the Overview intro say the same thing,
  // a few hundred pixels apart.
  render(
    <EcosystemProfile
      p={profile({
        description: "A coinbase message bounty: users escrow DIESEL against a message.",
        profile: "Inugami turns the Bitcoin coinbase into a message board with a price on it.\n\n## Functions\n\nDetails.",
      })}
      copy={copy}
      backHref="/ecosystem"
    />
  )
  expect(screen.queryByText(/users escrow DIESEL against a message/)).not.toBeInTheDocument()
  expect(screen.getByText(/message board with a price on it/)).toBeInTheDocument()
})

it("keeps the header description when there is no profile markdown", () => {
  render(
    <EcosystemProfile
      p={profile({ description: "Bitcoin NFT collection deployed on Alkanes.", profile: "" })}
      copy={copy}
      backHref="/ecosystem"
    />
  )
  expect(screen.getByText("Bitcoin NFT collection deployed on Alkanes.")).toBeInTheDocument()
})

it("keeps the header description when the profile starts straight at an H2", () => {
  // No intro means no Overview tab, so the description is the only prose on the page.
  render(
    <EcosystemProfile
      p={profile({ description: "Free mint factory.", profile: "## Functions\n\nDetails." })}
      copy={copy}
      backHref="/ecosystem"
    />
  )
  expect(screen.getByText("Free mint factory.")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vitest run tests/ecosystem/profile-page.test.tsx
```

Expected: FAIL on the first case — the description renders unconditionally today.

- [ ] **Step 3: Lift the split and gate the header**

In `components/ecosystem/EcosystemProfile.tsx`, inside `EcosystemProfile`, compute the split once before the returned JSX:

```tsx
  const { intro, sections } = splitProfileSections(p.profile)
  // The Overview tab is rendered from `intro`. When it exists it already carries the project's
  // pitch, so repeating `description` in the header prints the same paragraph twice on one page
  // (8 of 25 published projects did). `description` still owns every directory card.
  const showDescription = !intro
```

Change line 66 to:

```tsx
          {showDescription ? (
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ed-body)]">{p.description}</p>
          ) : null}
```

Change the body call at line 80 to pass the split down:

```tsx
      <ProfileBody intro={intro} sections={sections} contracts={p.contracts} copy={copy} />
```

And change `ProfileBody`'s signature and first line:

```tsx
function ProfileBody({ intro, sections, contracts, copy }: {
  intro: string
  sections: ReturnType<typeof splitProfileSections>["sections"]
  contracts: PublicEcosystemProfile["contracts"]
  copy: ProfileCopy
}) {
```

Delete the now-duplicated `const { intro, sections } = splitProfileSections(p.profile)` from inside `ProfileBody`, and replace the two remaining `p.contracts` references in it with `contracts`.

- [ ] **Step 4: Run the suite and typecheck**

```bash
node_modules/.bin/vitest run tests/ecosystem/
node_modules/.bin/tsc --noEmit
```

Expected: PASS and silent.

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/EcosystemProfile.tsx tests/ecosystem/profile-page.test.tsx
git commit -m "fix(ecosystem): don't print the description twice when an Overview exists"
```

---

### Task 6: Full gates, then ship

**Files:** none changed — this task verifies and deploys.

**Interfaces:**
- Consumes: everything above.
- Produces: the change live on `subfrost.io/ecosystem`.

- [ ] **Step 1: Run every gate**

```bash
node_modules/.bin/vitest run tests/
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint .
```

Expected: ecosystem suite fully green; `tsc` silent; lint no worse than the base (the repo has ~86 pre-existing findings, CI runs it with `|| true`). Note: a handful of `tests/marketing/` and admin tests are **chronically red on main** (`db down`, `ECONNREFUSED :3000`). Compare against main before treating a failure as yours.

- [ ] **Step 2: Open the PR**

```bash
git push origin feat/eco-profile-stats-overview
gh pr create --repo subfrost/subfrost.io --base main --head feat/eco-profile-stats-overview \
  --title "fix(ecosystem): honest profile stats + stop duplicating the description" \
  --body "See docs/superpowers/specs/2026-07-22-ecosystem-profile-stats-and-overview-design.md"
```

The real gate is the **Build / Docker Build Test / Lint & Type Check / Test** jobs. The four `netlify/subfrost-prod` checks fail on every recent PR — pre-existing, not a gate.

- [ ] **Step 3: Apply the DDL in production BEFORE the image rolls**

The new image `SELECT`s `showMarketStats`; the old one does not. Adding the column first is safe for both. Doing it after the rollout means every `/ecosystem` read throws until the DDL lands.

```bash
POD=$(bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" -n subfrost get pods -l app=subfrost-io -o name | head -1 | sed 's|pod/||')
```

Then exec this in the `app` container (base64-wrapped, per the established in-pod pattern):

```js
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.$executeRawUnsafe('ALTER TABLE "EcosystemProject" ADD COLUMN IF NOT EXISTS "showMarketStats" BOOLEAN NOT NULL DEFAULT false')
  .then(() => { console.log('column ok'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
```

Table and column names are the **model/field names, case-sensitive, quoted**.

- [ ] **Step 4: Merge and let the deploy run**

Merge the PR. `Deploy to GCP` builds and pushes the image, syncs the schema, and the `bump-flux-tag` job rewrites `k8s/kustomization.yaml` and commits it back to main — **no manual `newTag` bump**. The bump lands as the commit *after* the merge, so Flux may reconcile on the merge commit first; force a reconcile (source, wait for the revision, then kustomization) if you want it immediately.

- [ ] **Step 5: Turn the flag on for the four market tokens**

In-pod, after the rollout:

```js
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.ecosystemProject.updateMany({ where: { slug: { in: ['diesel','fire','frbtc','arbuz'] } }, data: { showMarketStats: true } })
  .then(r => { console.log('updated', r.count); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
```

Expected: `updated 4`.

- [ ] **Step 6: Verify the four page shapes in production**

```bash
curl -s "https://subfrost.io/ecosystem/alkane-pandas" | grep -c "stat-label"   # expect 0 — no hero at all
curl -s "https://subfrost.io/ecosystem/diesel"        | grep -c "stat-label"   # expect >0 — hero intact
curl -s "https://subfrost.io/ecosystem/wunsch-vault"  | grep -c "stat-label"   # expect 0
curl -s "https://subfrost.io/ecosystem/inugami"       | grep -c "escrow DIESEL against a message"  # expect 0 in the header
curl -s "https://subfrost.io/ecosystem/frbtc"         # description still present (frbtc has no Overview)
```

Also confirm no page anywhere renders `$0.0000`:

```bash
for s in alkane-pandas acai goji arbuz wunsch-vault diesel fire frbtc; do
  printf "%-14s %s\n" "$s" "$(curl -s "https://subfrost.io/ecosystem/$s" | grep -c '\$0\.0000')"
done
```

Expected: `0` for every slug.

---

## Self-Review

**Spec coverage.** Design A (plausibility guard) → Tasks 1-2. Design B (`showMarketStats`) → Tasks 3-4, enabled in Task 6 Step 5. Design C (description gate) → Task 5. Spec's migration ordering note → Task 6 Step 3. Spec's testing section: per-field guard tests (Task 1), empty hero (Task 2), custom-zero preserved (Task 2), flag-off with good data (Task 3), description split agreement (Task 5). Spec's verification section → Task 6 Step 6. Problem 3 (call counts) is explicitly out of scope and has no task, by design.

**Placeholder scan.** No TBD/TODO. Every code step carries real code. Task 4 Step 1 says "follow the file's existing mocking style" rather than inventing a mock shape — the surrounding tests in that file are the reference, and copying a wrong mock would be worse than pointing at the right one.

**Type consistency.** `isMeaningfulStat(value)` — one arg, used identically in Tasks 1 and 2 and matching the spec. `showMarketStats` is spelled the same in Prisma, `PublicEcosystemProject`, the `StatHero` prop, the action input, and the admin state. `ProfileBody` takes `intro`/`sections`/`contracts`/`copy` in Task 5 and every internal reference is updated in the same step.
