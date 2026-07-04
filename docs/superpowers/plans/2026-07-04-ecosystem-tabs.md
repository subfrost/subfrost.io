# Ecosystem Apps | Contracts Tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the public /ecosystem directory into Apps | Contracts tabs (kind), give contracts an on-chain identity (alkaneId badge → Ordiscan), and seed 8 canonical contracts.

**Architecture:** Additive `kind`/`alkaneId` columns on EcosystemProject flow through the existing three layers untouched in shape: constants validate → server action persists → public mapper exposes → client directory filters. The public grid card converts from a whole-card `<a>` to the stretched-link overlay pattern (already used by the featured card) so the badge can be a real sibling anchor.

**Tech Stack:** Next.js 16 (App Router), Prisma (Postgres), vitest + @testing-library/react (happy-dom), Tailwind with `--ed-*` theme tokens.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-04-ecosystem-tabs-design.md` (design approved by Vitor 2026-07-04).
- Schema changes ADDITIVE only (`kind String @default("App")`, `alkaneId String?`) — deploy runs `prisma db push` in an init container; existing 20 rows must backfill to kind="App" via the default.
- Kind values: exactly `"App" | "Contract"`. alkaneId format: `/^\d+:\d+$/`, optional (null/empty OK, including for Contracts).
- Explorer URL (verified 2026-07-04 via curl): `https://ordiscan.com/alkane/<name>/<block:tx>` — the name segment is vanity (`/alkane/X/2:0` → 200; bare `/alkane/2:0` → 404). Always `encodeURIComponent` the name segment.
- Theme: card/chip/tab backgrounds ALWAYS `var(--ed-*)` tokens — NEVER literal `bg-white` with token text (dark-mode gotcha from PR #179).
- /ecosystem stays OUT of nav + sitemap (soft launch). Do NOT touch `tests/ecosystem/integration.test.ts` assertions.
- After any `prisma/schema.prisma` edit, run `npx prisma generate` before tsc/tests.
- Commits: `git add` NOMINAL paths only (never `-A`).
- All new UI copy exists in BOTH locales (EN + ZH) in `app/ecosystem/page.tsx`'s `copy` object.

---

### Task 1: Data layer — schema, constants, action validation, public mapping

**Files:**
- Modify: `prisma/schema.prisma` (model EcosystemProject, ~line 1792)
- Modify: `lib/ecosystem/constants.ts`
- Modify: `actions/ecosystem/projects.ts`
- Modify: `lib/ecosystem/public.ts`
- Test: `tests/ecosystem/constants.test.ts`, `tests/ecosystem/actions.test.ts`, `tests/ecosystem/public.test.ts`

**Interfaces:**
- Consumes: existing `isValidCategory`/`isValidStatus` pattern.
- Produces: `ECOSYSTEM_KINDS = ["App","Contract"] as const`, `type EcosystemKind`, `isValidKind(v: string): v is EcosystemKind`, `isValidOptionalAlkaneId(v: string | null | undefined): boolean`; `EcosystemProjectInput` gains `kind: string` and `alkaneId?: string | null`; `PublicEcosystemProject` gains `kind: string` and `alkaneId: string | null`.

- [ ] **Step 1: Write failing tests for the new validators** — append to `tests/ecosystem/constants.test.ts`:

```ts
import { isValidKind, isValidOptionalAlkaneId, ECOSYSTEM_KINDS } from "@/lib/ecosystem/constants"

describe("kind & alkaneId validators", () => {
  it("accepts exactly App and Contract", () => {
    expect(ECOSYSTEM_KINDS).toEqual(["App", "Contract"])
    expect(isValidKind("App")).toBe(true)
    expect(isValidKind("Contract")).toBe(true)
    expect(isValidKind("Token")).toBe(false)
    expect(isValidKind("")).toBe(false)
  })
  it("accepts block:tx alkane ids and empty values", () => {
    expect(isValidOptionalAlkaneId("2:0")).toBe(true)
    expect(isValidOptionalAlkaneId("4:65522")).toBe(true)
    expect(isValidOptionalAlkaneId(null)).toBe(true)
    expect(isValidOptionalAlkaneId(undefined)).toBe(true)
    expect(isValidOptionalAlkaneId("")).toBe(true)
    expect(isValidOptionalAlkaneId("2:0x")).toBe(false)
    expect(isValidOptionalAlkaneId("2-0")).toBe(false)
    expect(isValidOptionalAlkaneId("abc")).toBe(false)
    expect(isValidOptionalAlkaneId(" 2:0")).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tests/ecosystem/constants.test.ts`
Expected: FAIL — `isValidKind` is not exported.

- [ ] **Step 3: Implement validators** — append to `lib/ecosystem/constants.ts`:

```ts
export const ECOSYSTEM_KINDS = ["App", "Contract"] as const
export type EcosystemKind = (typeof ECOSYSTEM_KINDS)[number]

export function isValidKind(v: string): v is EcosystemKind {
  return (ECOSYSTEM_KINDS as readonly string[]).includes(v)
}

/** Alkane id in canonical `block:tx` form (e.g. "2:0"). Empty/null = not set. */
export function isValidOptionalAlkaneId(v: string | null | undefined): boolean {
  if (v == null || v === "") return true
  return /^\d+:\d+$/.test(v)
}
```

- [ ] **Step 4: Verify GREEN** — `npx vitest run tests/ecosystem/constants.test.ts` → PASS.

- [ ] **Step 5: Schema fields** — in `prisma/schema.prisma`, model `EcosystemProject`, add after `status`:

```prisma
  kind          String   @default("App")
  alkaneId      String?
```

Run: `npx prisma generate` (regenerates the client; required before tsc).

- [ ] **Step 6: Write failing action tests** — append to `tests/ecosystem/actions.test.ts` (follow the file's existing mock idiom — `validInput` const is already there; extend cases):

```ts
it("persists kind and alkaneId", async () => {
  vi.mocked(currentUser).mockResolvedValue(editor as never)
  vi.mocked(prisma.ecosystemProject.create).mockResolvedValue({ id: "e1" } as never)
  const res = await saveEcosystemProject({ ...validInput, kind: "Contract", alkaneId: " 2:0 " } as never)
  expect(res.ok).toBe(true)
  const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
  expect(data.kind).toBe("Contract")
  expect(data.alkaneId).toBe("2:0") // trimmed
})
it("rejects an unknown kind", async () => {
  vi.mocked(currentUser).mockResolvedValue(editor as never)
  const res = await saveEcosystemProject({ ...validInput, kind: "Token" } as never)
  expect(res).toEqual({ ok: false, error: "Unknown kind" })
})
it("rejects a malformed alkaneId", async () => {
  vi.mocked(currentUser).mockResolvedValue(editor as never)
  const res = await saveEcosystemProject({ ...validInput, kind: "Contract", alkaneId: "2-0" } as never)
  expect(res).toEqual({ ok: false, error: "Alkane ID must look like block:tx (e.g. 2:0)" })
})
```

Note: existing tests pass `validInput` without `kind` — to keep them green, `validate()` must treat a missing kind as `"App"` (see Step 8). If any existing test asserts the exact `data` object, update it to include `kind: "App", alkaneId: null`.

- [ ] **Step 7: Run to verify RED** — `npx vitest run tests/ecosystem/actions.test.ts` → new cases FAIL.

- [ ] **Step 8: Implement action support** — in `actions/ecosystem/projects.ts`:

```ts
// import additions
import { isValidKind, isValidOptionalAlkaneId /* …existing */ } from "@/lib/ecosystem/constants"

// EcosystemProjectInput additions
  kind?: string
  alkaneId?: string | null

// validate() additions (after the status check)
  const kind = input.kind ?? "App"
  if (!isValidKind(kind)) return "Unknown kind"
  if (!isValidOptionalAlkaneId(input.alkaneId?.trim())) {
    return "Alkane ID must look like block:tx (e.g. 2:0)"
  }

// data object additions (inside saveEcosystemProject)
    kind: input.kind ?? "App",
    alkaneId: input.alkaneId?.trim() || null,
```

- [ ] **Step 9: Public mapping** — in `lib/ecosystem/public.ts` add `kind: string` and `alkaneId: string | null` to `PublicEcosystemProject` and `kind: r.kind, alkaneId: r.alkaneId,` to the row mapper. Extend `tests/ecosystem/public.test.ts` following its existing prisma-mock pattern: a row with `kind: "Contract", alkaneId: "2:0"` comes back mapped verbatim.

- [ ] **Step 10: Full task gate** — Run: `npx vitest run tests/ecosystem/ && npx tsc --noEmit`
Expected: all ecosystem tests PASS (integration.test.ts untouched), tsc clean. NOTE: other files (EcosystemAdmin/Directory) don't reference the new fields yet, so tsc stays clean.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma lib/ecosystem/constants.ts actions/ecosystem/projects.ts lib/ecosystem/public.ts tests/ecosystem/constants.test.ts tests/ecosystem/actions.test.ts tests/ecosystem/public.test.ts
git commit -m "feat(ecosystem): kind (App|Contract) + alkaneId data layer"
```

---

### Task 2: Admin form — Kind select + Alkane ID field

**Files:**
- Modify: `components/cms/ecosystem/EcosystemAdmin.tsx`
- Test: `tests/ecosystem/admin-form.test.tsx` (new)

**Interfaces:**
- Consumes: `saveEcosystemProject` accepting `kind`/`alkaneId` (Task 1); `ECOSYSTEM_KINDS` from constants.
- Produces: `AdminProject` interface gains `kind: string` and `alkaneId: string | null` (the admin page at `app/admin/ecosystem/page.tsx` spreads prisma rows — `{...p}` — so it passes the new columns through with NO page change).

- [ ] **Step 1: Write failing RTL test** — create `tests/ecosystem/admin-form.test.tsx` (mirror the mock setup of `tests/ecosystem/admin-upload.test.tsx`; next/navigation is mocked globally in tests/setup.ts):

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { EcosystemAdmin } from "@/components/cms/ecosystem/EcosystemAdmin"
import { saveEcosystemProject } from "@/actions/ecosystem/projects"

vi.mock("@/actions/ecosystem/projects", () => ({
  saveEcosystemProject: vi.fn(),
  deleteEcosystemProject: vi.fn(),
  setFeaturedBandEnabled: vi.fn(),
  translateEcosystemDescription: vi.fn(),
}))

beforeEach(() => cleanup())

describe("EcosystemAdmin — kind & alkaneId", () => {
  it("submits the selected kind and alkaneId on save", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "DIESEL" } })
    fireEvent.change(getByLabelText("Website"), { target: { value: "https://ordiscan.com/alkane/DIESEL/2:0" } })
    fireEvent.change(getByLabelText("Kind"), { target: { value: "Contract" } })
    fireEvent.change(getByLabelText("Alkane ID"), { target: { value: "2:0" } })
    fireEvent.click(getByText("Save"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ kind: "Contract", alkaneId: "2:0" })
  })
})
```

NOTE: check the actual `<label>` texts in the form ("Name", "Website", "Save") and adjust `getByLabelText`/`getByText` queries to the real ones; labels are associated via `htmlFor`/`id`, follow that pattern for the two new controls.

- [ ] **Step 2: Verify RED** — `npx vitest run tests/ecosystem/admin-form.test.tsx` → FAIL (no "Kind" control).

- [ ] **Step 3: Implement** — in `components/cms/ecosystem/EcosystemAdmin.tsx`:
  1. `import { ECOSYSTEM_CATEGORIES, ECOSYSTEM_STATUSES, ECOSYSTEM_KINDS } from "@/lib/ecosystem/constants"`.
  2. `AdminProject` interface: add `kind: string` and `alkaneId: string | null`; `blankProject()`: `kind: "App", alkaneId: null`.
  3. `ProjectForm` state: `const [kind, setKind] = useState(initial.kind)` and `const [alkaneId, setAlkaneId] = useState(initial.alkaneId ?? "")`.
  4. Controls (in the grid, next to the Category/Status selects, same `label`/`selectCls`/`inputCls` classes and `htmlFor`/`id` wiring, ids `ep-kind` / `ep-alkane-id`):

```tsx
<div className="flex flex-col gap-1">
  <label className={label} htmlFor="ep-kind">Kind</label>
  <select id="ep-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectCls}>
    {ECOSYSTEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
  </select>
</div>
<div className="flex flex-col gap-1">
  <label className={label} htmlFor="ep-alkane-id">Alkane ID</label>
  <input id="ep-alkane-id" value={alkaneId} onChange={(e) => setAlkaneId(e.target.value)}
    placeholder="block:tx — e.g. 2:0" className={inputCls + " font-mono"} />
</div>
```

  5. `save()` payload: add `kind,` and `alkaneId: alkaneId.trim() || null,`.
  6. `toInput()` (used by the list toggles): add `kind: p.kind, alkaneId: p.alkaneId,`.

- [ ] **Step 4: Verify GREEN + no regressions** — `npx vitest run tests/ecosystem/ && npx tsc --noEmit` → PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add components/cms/ecosystem/EcosystemAdmin.tsx tests/ecosystem/admin-form.test.tsx
git commit -m "feat(ecosystem): admin kind select + alkane id field"
```

---

### Task 3: Public directory — Apps | Contracts tabs + alkaneId badge

**Files:**
- Modify: `components/ecosystem/EcosystemDirectory.tsx`
- Modify: `app/ecosystem/page.tsx` (copy object only)
- Test: `tests/ecosystem/directory.test.tsx`

**Interfaces:**
- Consumes: `PublicEcosystemProject.kind` / `.alkaneId` (Task 1).
- Produces: `DirectoryCopy` gains `tabApps: string` and `tabContracts: string`.

- [ ] **Step 1: Write failing tests** — in `tests/ecosystem/directory.test.tsx`, extend the local `copy` const with `tabApps: "Apps", tabContracts: "Contracts"` and the `p()` factory with `kind: "App", alkaneId: null`. Add:

```tsx
const withContracts = [
  ...projects,
  p({ slug: "diesel", name: "DIESEL", kind: "Contract", alkaneId: "2:0", category: "DeFi" }),
  p({ slug: "wunsch", name: "wunsch vault", kind: "Contract", alkaneId: "4:777", category: "DeFi" }),
]

describe("EcosystemDirectory — kind tabs", () => {
  it("defaults to the Apps tab and hides contracts", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    expect(screen.getByRole("tab", { name: /Apps/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText("DIESEL")).toBeNull()
  })
  it("switches to Contracts and shows the alkaneId badge linking to Ordiscan", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    expect(screen.getByText("DIESEL")).toBeInTheDocument()
    expect(screen.queryByText("SUBFROST")).toBeNull()
    const badge = screen.getByRole("link", { name: /DIESEL on Ordiscan/ })
    expect(badge).toHaveAttribute("href", "https://ordiscan.com/alkane/DIESEL/2:0")
  })
  it("scopes category chips to the active tab and resets selection on switch", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("button", { name: /Tooling/ })) // Apps-only category
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    expect(screen.queryByRole("button", { name: /Tooling/ })).toBeNull() // no Tooling contracts
    expect(screen.getByText("DIESEL")).toBeInTheDocument() // selection reset to All
  })
  it("shows no badge for a contract without an alkaneId", () => {
    render(<EcosystemDirectory projects={[p({ slug: "fm", name: "Free Mint Factory", kind: "Contract" })]} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    expect(screen.getByText("Free Mint Factory")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /on Ordiscan/ })).toBeNull()
  })
})
```

- [ ] **Step 2: Verify RED** — `npx vitest run tests/ecosystem/directory.test.tsx` → new cases FAIL (also: existing cases may fail on the extended copy type until Step 3 — fine, they must be GREEN after).

- [ ] **Step 3: Implement** — in `components/ecosystem/EcosystemDirectory.tsx`:
  1. `DirectoryCopy`: add `tabApps: string; tabContracts: string`.
  2. State: `const [kind, setKind] = useState<"App" | "Contract">("App")` next to `cat`.
  3. Derivations — filter by kind FIRST, everything downstream unchanged:

```tsx
const ofKind = useMemo(() => projects.filter((p) => (p.kind ?? "App") === kind), [projects, kind])
const counts = useMemo(() => ({
  App: projects.filter((p) => (p.kind ?? "App") === "App").length,
  Contract: projects.filter((p) => p.kind === "Contract").length,
}), [projects])
// replace every downstream use of `projects` (cats, visible, chip count) with `ofKind`
```

  4. Tabs row ABOVE the chips row (theme tokens only):

```tsx
<div role="tablist" aria-label="Project kind" className="flex gap-6 border-b border-[color:var(--ed-hair)] px-6 pt-5 sm:px-10">
  {(["App", "Contract"] as const).map((k) => (
    <button key={k} role="tab" type="button" aria-selected={kind === k}
      onClick={() => { setKind(k); setCat("__all__") }}
      className={"-mb-px border-b-2 pb-3 font-mono text-[12.5px] font-medium tracking-[0.04em] transition-colors " +
        (kind === k
          ? "border-[color:var(--ed-ink)] text-[color:var(--ed-ink)]"
          : "border-transparent text-[color:var(--ed-muted)] hover:text-[color:var(--ed-accent)]")}>
      {k === "App" ? copy.tabApps : copy.tabContracts}
      <span className="ml-1.5 opacity-60" style={{ fontVariantNumeric: "tabular-nums" }}>{counts[k]}</span>
    </button>
  ))}
</div>
```

  5. Badge component (renders only when alkaneId set; `relative z-10` so it sits above the stretched link):

```tsx
function AlkaneBadge({ p }: { p: PublicEcosystemProject }) {
  if (!p.alkaneId) return null
  return (
    <a
      href={`https://ordiscan.com/alkane/${encodeURIComponent(p.name)}/${p.alkaneId}`}
      target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on Ordiscan`}
      className="relative z-10 inline-flex w-fit items-center gap-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 py-0.5 font-mono text-[11px] text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)]"
    >
      {p.alkaneId} ↗
    </a>
  )
}
```

  6. Grid card: convert the whole-card `<a>` wrapper to the stretched-link pattern the FEATURED card already uses (nested anchors are invalid HTML): outer `<div className="relative flex flex-col …">` keeping the existing classes minus link semantics, add `<a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} — ${copy.website}`} className="absolute inset-0 z-0 rounded-[11px]" />` as first child, and wrap the existing content rows in `relative z-10` containers (copy the featured card's exact approach). Add `<AlkaneBadge p={p} />` after the description row in BOTH the grid card and the featured card.

  7. `app/ecosystem/page.tsx`: in the `copy` object add to `directory`: EN `tabApps: "Apps", tabContracts: "Contracts"`; ZH `tabApps: "应用", tabContracts: "合约"`.

- [ ] **Step 4: Verify GREEN + hover check** — `npx vitest run tests/ecosystem/ && npx tsc --noEmit` → PASS/clean. Confirm the grid card kept its hover translate/border classes (visual parity).

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/EcosystemDirectory.tsx app/ecosystem/page.tsx tests/ecosystem/directory.test.tsx
git commit -m "feat(ecosystem): public Apps|Contracts tabs + alkane id badge"
```

---

### Task 4: Contracts seed data + gates

**Files:**
- Create: `scripts/data/ecosystem-contracts-seed.json`
- Test: `tests/ecosystem/seed-data.test.ts` (extend)
- (No change to `scripts/seed-ecosystem.cjs` — it already takes `--file` and upserts by slug.)

**Interfaces:**
- Consumes: seed script contract: array of rows matching prisma columns (now incl. `kind`, `alkaneId`).
- Produces: the JSON below, seeded in-pod at deploy time by the orchestrator (NOT part of CI).

- [ ] **Step 1: Write failing test** — append to `tests/ecosystem/seed-data.test.ts`:

```ts
import contracts from "../../scripts/data/ecosystem-contracts-seed.json"
import { isValidKind, isValidOptionalAlkaneId } from "@/lib/ecosystem/constants"

describe("ecosystem contracts seed", () => {
  it("has 8 unique published Contract entries with valid fields", () => {
    expect(contracts.length).toBe(8)
    expect(new Set(contracts.map((p) => p.slug)).size).toBe(8)
    const appSlugs = new Set(seed.map((p) => p.slug))
    for (const p of contracts) {
      expect(appSlugs.has(p.slug), `${p.slug} collides with apps seed`).toBe(false)
      expect(p.kind).toBe("Contract")
      expect(isValidKind(p.kind)).toBe(true)
      expect(isValidOptionalAlkaneId(p.alkaneId), `${p.slug} alkaneId`).toBe(true)
      expect(p.published).toBe(true)
      expect(isValidCategory(p.category), `${p.slug} category`).toBe(true)
      expect(isValidStatus(p.status), `${p.slug} status`).toBe(true)
      expect(isValidHttpUrl(p.url), `${p.slug} url`).toBe(true)
      expect(p.descriptionEn.length, `${p.slug} en`).toBeGreaterThan(20)
      expect(p.descriptionZh.length, `${p.slug} zh`).toBeGreaterThan(5)
    }
  })
  it("pins the canonical alkane ids", () => {
    const ids = Object.fromEntries(contracts.map((p) => [p.slug, p.alkaneId]))
    expect(ids["diesel"]).toBe("2:0")
    expect(ids["frbtc"]).toBe("32:0")
    expect(ids["fire"]).toBe("2:77623")
    expect(ids["busd"]).toBe("2:56801")
    expect(ids["amm-factory"]).toBe("4:65522")
    expect(ids["wunsch-vault"]).toBe("4:777")
    expect(ids["arbuz"]).toBe("2:25349")
    expect(ids["free-mint-factory"]).toBeNull() // id pending research — fill via admin later
  })
})
```

- [ ] **Step 2: Verify RED** — `npx vitest run tests/ecosystem/seed-data.test.ts` → FAIL (missing JSON file).

- [ ] **Step 3: Create `scripts/data/ecosystem-contracts-seed.json`** (kind/alkaneId per the pinned ids; `featured: false`, `published: true`, statuses `Live`):

```json
[
  { "slug": "diesel", "name": "DIESEL", "kind": "Contract", "alkaneId": "2:0", "category": "DeFi", "status": "Live", "url": "https://ordiscan.com/alkane/DIESEL/2:0", "xUrl": null, "docsUrl": "https://alkanes.build/docs/learn/diesel", "descriptionEn": "The genesis alkane. DIESEL mints in parity with each block's miner fee (capped at 50% of the block reward), so its supply schedule mirrors Bitcoin's own.", "descriptionZh": "创世 alkane。DIESEL 的铸造与每个区块的矿工费挂钩（上限为区块奖励的 50%），供应曲线与比特币本身一致。", "featured": false, "sortOrder": 0, "published": true },
  { "slug": "frbtc", "name": "frBTC", "kind": "Contract", "alkaneId": "32:0", "category": "DeFi", "status": "Live", "url": "https://subfrost.io", "xUrl": "https://x.com/SUBFROSTio", "docsUrl": "https://docs.subfrost.io", "descriptionEn": "SUBFROST's wrapped BTC on Alkanes — minted and redeemed 1:1 against a FROST/ROAST threshold-signed custody, fully on Bitcoin L1.", "descriptionZh": "SUBFROST 在 Alkanes 上的包装 BTC——由 FROST/ROAST 门限签名托管 1:1 铸造与赎回，完全运行在比特币主链上。", "featured": false, "sortOrder": 1, "published": true },
  { "slug": "fire", "name": "FIRE", "kind": "Contract", "alkaneId": "2:77623", "category": "DeFi", "status": "Live", "url": "https://subfrost.io", "xUrl": "https://x.com/SUBFROSTio", "docsUrl": "https://docs.subfrost.io", "descriptionEn": "The FIRE token contract from the SUBFROST ecosystem, traded on-chain against BTC on Alkanes.", "descriptionZh": "SUBFROST 生态的 FIRE 代币合约，在 Alkanes 上与 BTC 进行链上交易。", "featured": false, "sortOrder": 2, "published": true },
  { "slug": "busd", "name": "bUSD", "kind": "Contract", "alkaneId": "2:56801", "category": "DeFi", "status": "Live", "url": "https://bound.exchange", "xUrl": "https://x.com/Bound_Exchange", "docsUrl": "https://docs.bound.exchange/bound-docs", "descriptionEn": "Bound's BTC-backed stablecoin contract on Alkanes (8 decimals) — the quote asset of the DIESEL/bUSD pool.", "descriptionZh": "Bound 在 Alkanes 上的 BTC 抵押稳定币合约（8 位小数）——DIESEL/bUSD 资金池的计价资产。", "featured": false, "sortOrder": 3, "published": true },
  { "slug": "amm-factory", "name": "AMM Factory", "kind": "Contract", "alkaneId": "4:65522", "category": "DeFi", "status": "Live", "url": "https://ordiscan.com/alkane/factory/4:65522", "xUrl": null, "docsUrl": "https://alkanes.build/docs", "descriptionEn": "The factory contract that deploys and tracks Alkanes AMM pools — every pool pair on the DEX layer traces back to it.", "descriptionZh": "部署并管理 Alkanes AMM 资金池的工厂合约——DEX 层的每个交易对都源自它。", "featured": false, "sortOrder": 4, "published": true },
  { "slug": "free-mint-factory", "name": "Free Mint Factory", "kind": "Contract", "alkaneId": null, "category": "Tooling", "status": "Live", "url": "https://alkanes.build/docs/developers/quickstart", "xUrl": null, "docsUrl": "https://alkanes.build/docs", "descriptionEn": "The standard factory contract cloned to launch free-mint Alkanes tokens — the template behind most token launches on the protocol.", "descriptionZh": "用于发行 free-mint Alkanes 代币的标准工厂合约——协议上大多数代币发行背后的模板。", "featured": false, "sortOrder": 5, "published": true },
  { "slug": "wunsch-vault", "name": "wunsch vault", "kind": "Contract", "alkaneId": "4:777", "category": "DeFi", "status": "Live", "url": "https://ordiscan.com/alkane/wunsch/4:777", "xUrl": null, "docsUrl": null, "descriptionEn": "A community vault contract on Alkanes by wunsch — on-chain deposit experiments around the ARBUZ token.", "descriptionZh": "wunsch 在 Alkanes 上的社区金库合约——围绕 ARBUZ 代币的链上存款实验。", "featured": false, "sortOrder": 6, "published": true },
  { "slug": "arbuz", "name": "ARBUZ", "kind": "Contract", "alkaneId": "2:25349", "category": "Other", "status": "Live", "url": "https://arbuzino.com", "xUrl": null, "docsUrl": null, "descriptionEn": "The Magic Arbuz token contract on Alkanes — the community memecoin at the center of the Arbuzino project.", "descriptionZh": "Alkanes 上的 Magic Arbuz 代币合约——Arbuzino 项目核心的社区 meme 币。", "featured": false, "sortOrder": 7, "published": true }
]
```

- [ ] **Step 4: Verify GREEN** — `npx vitest run tests/ecosystem/seed-data.test.ts` → PASS.

- [ ] **Step 5: Full gates**

Run: `npx vitest run tests/ecosystem/ && npx tsc --noEmit && npx next build 2>&1 | grep -E "Compiled|error"`
Expected: ecosystem suite green, tsc clean, "Compiled successfully" (standalone-copy EINVAL/EPERM afterwards is known local-Windows noise).

- [ ] **Step 6: Commit (spec + plan ride along)**

```bash
git add scripts/data/ecosystem-contracts-seed.json tests/ecosystem/seed-data.test.ts docs/superpowers/specs/2026-07-04-ecosystem-tabs-design.md docs/superpowers/plans/2026-07-04-ecosystem-tabs.md
git commit -m "feat(ecosystem): contracts seed data (8 canonical alkanes)"
```

---

## Post-merge deployment (orchestrator only — NOT a subagent task)

1. PR → CI parity (Test job: only the 4 allow-listed failures) → squash-merge.
2. Wait "Deploy to GCP" image build for the merge SHA (fallback: cb.py).
3. Bump `k8s/kustomization.yaml` `newTag` with the QUOTED full merge SHA, commit `deploy(io): …` direct to main (pull --rebase if rejected).
4. Flux reconciles ~1min; `prisma db push` init container applies the additive columns; verify pods on the new image.
5. Seed in-pod: base64 the seed script + JSON into the `app` container, `NODE_PATH=/app/node_modules node /tmp/seed-ecosystem.cjs --file /tmp/ecosystem-contracts-seed.json` (dry-run first).
6. Verify prod: /ecosystem shows tabs EN+ZH, contracts with badges; /admin/ecosystem shows Kind/Alkane ID fields.
