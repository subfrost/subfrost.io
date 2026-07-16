# Ecosystem: Curated Hero Mosaic + First-Party Disclaimer Suppression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin curate exactly which projects appear in the `/ecosystem` hero mosaic, and hide the third-party disclaimer on SUBFROST's own product profiles.

**Architecture:** One additive schema column (`EcosystemProject.inMosaic`) surfaced through the public read type, an admin checkbox + per-row toggle mirroring `featured`, and a `HeroMosaic` that filters to the curated set. Disclaimer suppression is a code-only slug set checked in `EcosystemProfile`. No change to the directory grid, the featured band, or ordering.

**Tech Stack:** Next.js 16 (App Router, standalone), Prisma/Postgres, React client components, Vitest + @testing-library/react. Deploy: GKE via Flux (bump `newTag`); content seed via in-pod Prisma.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-16-ecosystem-mosaic-curation-design.md`.
- **First-party slugs (exact):** `diesel`, `frbtc`, `fire`, `subfrost`.
- **Mosaic initial set (exact 16 slugs):** `diesel, frbtc, subfrost, arbuzino, fire, espo, alkanex, alka-trade, aries, cheekyb, dohm-finance, fairmints, fartane, sablital, surtur, pizza-fun`.
- **Migration is additive only** — `inMosaic Boolean @default(false)`. No data migration, no destructive change.
- **Do not change** the directory-level notice, the featured band, the grid, or project ordering.
- **Admin UI copy is English** (matches the existing admin). No em-dash needed in these short labels.
- **Gates (run from the worktree before the PR):** `CI=true npx vitest run` (ecosystem suite green), `npx tsc --noEmit`, `npx eslint .` (0-delta vs base), `pnpm build`. The build gate in a worktree needs the node_modules dance from the memory (`rmdir node_modules` + `pnpm install --prefer-offline` + `npx prisma generate`) because Turbopack rejects the junction.
- **Deploy:** merge to `origin/main` → poll Artifact Registry for the merge SHA image → bump `k8s/kustomization.yaml` `newTag` to the **quoted full SHA** → push → Flux rollout (the `migrate` initContainer runs `prisma db push`, landing the column).

---

## Task 1: Add `inMosaic` to the model and the public read type

**Files:**
- Modify: `prisma/schema.prisma` (model `EcosystemProject`, ~line 1945)
- Modify: `lib/ecosystem/public.ts` (interface + both mappers)
- Test: `tests/ecosystem/public.test.ts`
- Test factory updates: `tests/ecosystem/directory.test.tsx`, `tests/ecosystem/profile-page.test.tsx`

**Interfaces:**
- Produces: `PublicEcosystemProject.inMosaic: boolean` (also inherited by `PublicEcosystemProfile`). Consumed by Tasks 2 and 5.

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, model `EcosystemProject`, add `inMosaic` right after `featured`:

```prisma
  featured      Boolean  @default(false)
  inMosaic      Boolean  @default(false)
  sortOrder     Int      @default(0)
```

- [ ] **Step 2: Regenerate the Prisma client** (so TS knows the new field)

Run: `cd "C:/Alkanes Geral Dev/.worktrees/ecosystem-mosaic-curation" && npx prisma generate`
Expected: `Generated Prisma Client` success line.

- [ ] **Step 3: Add `inMosaic` to the public type and both mappers**

In `lib/ecosystem/public.ts`:

Interface (after `featured: boolean`):
```ts
  featured: boolean
  inMosaic: boolean
```

In `getEcosystemDirectory`'s `.map(...)` (after `featured: r.featured,`):
```ts
    featured: r.featured,
    inMosaic: r.inMosaic,
```

In `getEcosystemProfile`'s return object (after `featured: r.featured,`):
```ts
    featured: r.featured,
    inMosaic: r.inMosaic,
```

- [ ] **Step 4: Keep the existing test factories compiling**

The type change breaks three fixtures. Add `inMosaic: false` to each default:

`tests/ecosystem/public.test.ts` — in `row(...)` defaults, after `featured: false,`:
```ts
  featured: false, inMosaic: false, sortOrder: 0, published: true, ...over,
```

`tests/ecosystem/directory.test.tsx` — in `p(...)` defaults, after `featured: false,`:
```ts
  url: "https://x.io", xUrl: null, docsUrl: null, description: "d", featured: false, inMosaic: false, ...over,
```

`tests/ecosystem/profile-page.test.tsx` — in `profile(...)` defaults, after `featured: false,`:
```ts
  docsUrl: null, description: "Casino-themed on-chain games.", featured: false, inMosaic: false,
```

- [ ] **Step 5: Write the failing mapping test**

Add to `tests/ecosystem/public.test.ts`, inside `describe("getEcosystemDirectory", ...)`:

```ts
  it("maps inMosaic verbatim", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "d", inMosaic: true }),
      row({ slug: "e", inMosaic: false }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.find((p) => p.slug === "d")?.inMosaic).toBe(true)
    expect(projects.find((p) => p.slug === "e")?.inMosaic).toBe(false)
  })
```

- [ ] **Step 6: Run the test to verify it passes** (implementation from Steps 1-3 already satisfies it)

Run: `cd "C:/Alkanes Geral Dev/.worktrees/ecosystem-mosaic-curation" && CI=true npx vitest run tests/ecosystem/public.test.ts`
Expected: PASS (including the new `maps inMosaic verbatim`).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/ecosystem/public.ts tests/ecosystem/public.test.ts tests/ecosystem/directory.test.tsx tests/ecosystem/profile-page.test.tsx
git commit -m "feat(ecosystem): add inMosaic column and expose it on the public read"
```

---

## Task 2: `HeroMosaic` renders only the curated set

**Files:**
- Modify: `components/ecosystem/HeroMosaic.tsx`
- Test: `tests/ecosystem/hero-mosaic.test.tsx` (create)

**Interfaces:**
- Consumes: `PublicEcosystemProject.inMosaic` (Task 1).
- Note: `app/ecosystem/page.tsx` already passes the full `projects` list to `HeroMosaic`; filtering moves *into* the component, so `page.tsx` needs **no change**.

- [ ] **Step 1: Write the failing test**

Create `tests/ecosystem/hero-mosaic.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { HeroMosaic } from "@/components/ecosystem/HeroMosaic"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

const p = (over: Partial<PublicEcosystemProject>): PublicEcosystemProject => ({
  slug: "x", name: "X", logoUrl: null, bannerUrl: null, category: "DeFi", status: "Live",
  kind: "App", alkaneId: null, url: "https://x.io", xUrl: null, docsUrl: null,
  description: "d", featured: false, inMosaic: false, ...over,
})

describe("HeroMosaic", () => {
  it("renders only projects marked inMosaic", () => {
    const { container } = render(
      <HeroMosaic projects={[
        p({ slug: "a", inMosaic: true }),
        p({ slug: "b", inMosaic: false }),
        p({ slug: "c", inMosaic: true }),
      ]} />,
    )
    expect(container.querySelectorAll(".ec-hero-tile").length).toBe(2)
  })

  it("returns null when nothing is marked (no minimum-count fallback)", () => {
    const { container } = render(
      <HeroMosaic projects={[p({ slug: "a" }), p({ slug: "b" })]} />,
    )
    expect(container.querySelector(".ec-hero-mosaic")).toBeNull()
  })

  it("caps the mosaic at 16 marks", () => {
    const many = Array.from({ length: 20 }, (_, i) => p({ slug: `s${i}`, inMosaic: true }))
    const { container } = render(<HeroMosaic projects={many} />)
    expect(container.querySelectorAll(".ec-hero-tile").length).toBe(16)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/ecosystem/hero-mosaic.test.tsx`
Expected: FAIL — the first test renders tiles for `inMosaic:false` projects (old code shows the first 16 unconditionally), and the "returns null" test fails because 2 < 8 already returns null for the wrong reason / a type error on `inMosaic`.

- [ ] **Step 3: Filter by `inMosaic` in the component**

Replace the body of `components/ecosystem/HeroMosaic.tsx` (the prop type and the first two lines of the function):

```tsx
export function HeroMosaic({ projects }: { projects: Pick<PublicEcosystemProject, "slug" | "name" | "logoUrl" | "inMosaic">[] }) {
  // Curated: only the projects the admin marked for the mosaic. Cap at 16 to keep the 4-wide
  // grid tidy; hide entirely when none are marked (curation replaces the old minimum-count guard).
  const marks = projects.filter((p) => p.inMosaic).slice(0, 16)
  if (marks.length === 0) return null
```

Leave the rest of the component (the JSX with `.ec-hero-mosaic` / `.ec-hero-tile`) unchanged. Also update the doc comment's "first 16" wording if present.

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/ecosystem/hero-mosaic.test.tsx`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/HeroMosaic.tsx tests/ecosystem/hero-mosaic.test.tsx
git commit -m "feat(ecosystem): hero mosaic shows only inMosaic-curated projects"
```

---

## Task 3: Hide the disclaimer on first-party profiles

**Files:**
- Modify: `lib/ecosystem/constants.ts`
- Modify: `components/ecosystem/EcosystemProfile.tsx`
- Test: `tests/ecosystem/profile-page.test.tsx`

**Interfaces:**
- Produces: `isFirstParty(slug: string): boolean` and `FIRST_PARTY_SLUGS: Set<string>` in `lib/ecosystem/constants.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ecosystem/profile-page.test.tsx` (the fixture's `copy.disclaimer` is `"Discovery only; not endorsed by SUBFROST."`):

```tsx
describe("EcosystemProfile — first-party disclaimer suppression", () => {
  it("shows the disclaimer for a third-party project", () => {
    render(<EcosystemProfile p={profile({ slug: "arbuzino" })} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByText("Discovery only; not endorsed by SUBFROST.")).toBeInTheDocument()
  })
  it("hides the disclaimer for a first-party product (diesel)", () => {
    render(<EcosystemProfile p={profile({ slug: "diesel", name: "DIESEL" })} copy={copy} backHref="/ecosystem" />)
    expect(screen.queryByText("Discovery only; not endorsed by SUBFROST.")).toBeNull()
  })
  it("hides the disclaimer for the SUBFROST app itself", () => {
    render(<EcosystemProfile p={profile({ slug: "subfrost", name: "SUBFROST" })} copy={copy} backHref="/ecosystem" />)
    expect(screen.queryByText("Discovery only; not endorsed by SUBFROST.")).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `CI=true npx vitest run tests/ecosystem/profile-page.test.tsx`
Expected: FAIL — the two "hides" tests fail because the notice renders unconditionally today.

- [ ] **Step 3: Add the first-party slug set**

Append to `lib/ecosystem/constants.ts`:

```ts
/**
 * SUBFROST's own products (not third-party). The directory-wide "SUBFROST did not build / does
 * not control / has not audited these projects" notice is self-contradictory on their profiles,
 * so it is suppressed there. The directory-level notice still frames the directory as a whole.
 * Small and stable, so it lives in code rather than the DB.
 */
export const FIRST_PARTY_SLUGS = new Set(["diesel", "frbtc", "fire", "subfrost"])

export function isFirstParty(slug: string): boolean {
  return FIRST_PARTY_SLUGS.has(slug)
}
```

- [ ] **Step 4: Gate the notice in the profile**

In `components/ecosystem/EcosystemProfile.tsx`:

Add the import near the other `@/lib/ecosystem` / component imports:
```ts
import { isFirstParty } from "@/lib/ecosystem/constants"
```

Replace the header notice line (currently `<EcosystemNotice text={copy.disclaimer} className="mt-5" />`):
```tsx
          {isFirstParty(p.slug) ? null : <EcosystemNotice text={copy.disclaimer} className="mt-5" />}
```

- [ ] **Step 5: Run to verify it passes**

Run: `CI=true npx vitest run tests/ecosystem/profile-page.test.tsx`
Expected: PASS (existing tests + the three new ones).

- [ ] **Step 6: Commit**

```bash
git add lib/ecosystem/constants.ts components/ecosystem/EcosystemProfile.tsx tests/ecosystem/profile-page.test.tsx
git commit -m "feat(ecosystem): suppress third-party disclaimer on first-party profiles"
```

---

## Task 4: Persist `inMosaic` in the save action

**Files:**
- Modify: `actions/ecosystem/projects.ts`
- Test: `tests/ecosystem/actions.test.ts`

**Interfaces:**
- Produces: `EcosystemProjectInput.inMosaic: boolean` (required, mirrors `featured`). Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

In `tests/ecosystem/actions.test.ts`, add `inMosaic: false` to the shared `validInput` (after `featured: false,`):
```ts
  featured: false,
  inMosaic: false,
  sortOrder: 10,
```

Add a test inside `describe("saveEcosystemProject", ...)`:
```ts
  it("persists inMosaic", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValue({ id: "m1" } as never)
    await saveEcosystemProject({ ...validInput, inMosaic: true })
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.inMosaic).toBe(true)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `CI=true npx vitest run tests/ecosystem/actions.test.ts`
Expected: FAIL — `data.inMosaic` is `undefined` (action does not write it yet); TS also flags the unknown `inMosaic` on the input.

- [ ] **Step 3: Thread `inMosaic` through the action**

In `actions/ecosystem/projects.ts`:

`EcosystemProjectInput` interface (after `featured: boolean`):
```ts
  featured: boolean
  inMosaic: boolean
```

The `data` object inside `saveEcosystemProject` (after `featured: input.featured,`):
```ts
    featured: input.featured,
    inMosaic: input.inMosaic,
```

- [ ] **Step 4: Run to verify it passes**

Run: `CI=true npx vitest run tests/ecosystem/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/ecosystem/projects.ts tests/ecosystem/actions.test.ts
git commit -m "feat(ecosystem): persist inMosaic in saveEcosystemProject"
```

---

## Task 5: Admin — "Show in hero mosaic" checkbox + per-row toggle

**Files:**
- Modify: `components/cms/ecosystem/EcosystemAdmin.tsx`
- Test: `tests/ecosystem/admin-form.test.tsx`

**Interfaces:**
- Consumes: `EcosystemProjectInput.inMosaic` (Task 4).
- Note: `app/admin/ecosystem/page.tsx` spreads `...p` from the Prisma row into `AdminProject`, so `inMosaic` flows in automatically once the column exists — no change to that file.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ecosystem/admin-form.test.tsx`:

```tsx
describe("EcosystemAdmin — hero mosaic toggle", () => {
  it("submits inMosaic when the form checkbox is ticked", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "Pizza.fun" } })
    fireEvent.change(getByLabelText("Website URL"), { target: { value: "https://pizza.fun" } })
    fireEvent.click(getByLabelText("Show in hero mosaic"))
    fireEvent.click(getByText("Create project"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ inMosaic: true })
  })

  it("per-row toggle saves inMosaic for an existing project", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "p1" })
    const proj = {
      id: "p1", slug: "surtur", name: "Surtur", logoUrl: null, bannerUrl: null,
      category: "Social", status: "Live", kind: "App", alkaneId: null,
      url: "https://surtur.io", xUrl: null, docsUrl: null,
      descriptionEn: "d", descriptionZh: "", featured: false, inMosaic: false,
      sortOrder: 0, published: true, profileEn: "", profileZh: "",
      contracts: [], createdAt: "", updatedAt: "",
    }
    const { getByLabelText } = render(
      <EcosystemAdmin projects={[proj]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByLabelText("In mosaic: Surtur"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ inMosaic: true })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `CI=true npx vitest run tests/ecosystem/admin-form.test.tsx`
Expected: FAIL — no "Show in hero mosaic" control and no "In mosaic: Surtur" toggle exist yet (also TS errors on the `inMosaic` field of `AdminProject`).

- [ ] **Step 3: Add `inMosaic` to the admin project shape**

In `components/cms/ecosystem/EcosystemAdmin.tsx`:

`AdminProject` interface (after `featured: boolean`):
```ts
  featured: boolean
  inMosaic: boolean
```

`blankProject()` (after `featured: false,`):
```ts
    featured: false,
    inMosaic: false,
```

`toInput()` (after `featured: p.featured,`):
```ts
    featured: p.featured,
    inMosaic: p.inMosaic,
```

- [ ] **Step 4: Add the per-row toggle handler and column**

Add the handler next to `toggleFeatured`:
```tsx
  function toggleMosaic(p: AdminProject) {
    setError(null)
    startTransition(async () => {
      const res = await saveEcosystemProject(toInput({ ...p, inMosaic: !p.inMosaic }))
      if (res.ok) router.refresh()
      else setError(res.error ?? "Save failed")
    })
  }
```

In the table header row, add a `Mosaic` column after `Featured`:
```tsx
              <th className="px-3 py-2 font-medium">Featured</th>
              <th className="px-3 py-2 font-medium">Mosaic</th>
              <th className="px-3 py-2 font-medium">Published</th>
```

In the table body row, add the toggle `<td>` after the Featured `<td>` (which ends at its closing `</td>` before the Published `<td>`):
```tsx
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={p.inMosaic}
                    disabled={!canEdit || pending}
                    onChange={() => toggleMosaic(p)}
                    aria-label={`In mosaic: ${p.name}`}
                  />
                </td>
```

Bump the empty-state `colSpan` (one more column): `canEdit ? 6 : 5` becomes `canEdit ? 7 : 6`.

- [ ] **Step 5: Add the form checkbox and submit the value**

In `ProjectForm`, add state next to `featured` (after `const [featured, setFeatured] = useState(initial.featured)`):
```tsx
  const [inMosaic, setInMosaic] = useState(initial.inMosaic)
```

In the Featured/Published label row, add a third label:
```tsx
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={inMosaic} onChange={(e) => setInMosaic(e.target.checked)} /> Show in hero mosaic
        </label>
```

In `save()`, add `inMosaic` to the `saveEcosystemProject({...})` payload (after `featured,`):
```tsx
        featured,
        inMosaic,
        sortOrder,
```

- [ ] **Step 6: Run to verify it passes**

Run: `CI=true npx vitest run tests/ecosystem/admin-form.test.tsx`
Expected: PASS (existing tests + the two new ones).

- [ ] **Step 7: Full ecosystem suite + type check**

Run: `CI=true npx vitest run tests/ecosystem && npx tsc --noEmit`
Expected: all ecosystem tests PASS, `tsc` clean.

- [ ] **Step 8: Commit**

```bash
git add components/cms/ecosystem/EcosystemAdmin.tsx tests/ecosystem/admin-form.test.tsx
git commit -m "feat(ecosystem): admin control for the hero mosaic (checkbox + per-row toggle)"
```

---

## Task 6: Deploy + seed the initial mosaic (ops — requires human)

Not TDD. This lands the column in prod and seeds the initial curated set. Do it with Vitor (git push token + Flux + in-pod access).

- [ ] **Step 1: Gates green in the worktree**

Run (from the worktree): `CI=true npx vitest run` · `npx tsc --noEmit` · `npx eslint .` (compare finding count to base — must be 0-delta) · `pnpm build` (with the node_modules dance if the junction blocks Turbopack).

- [ ] **Step 2: Push, open PR, review**

```bash
git push -u origin feat/ecosystem-mosaic-curation
gh pr create --head feat/ecosystem-mosaic-curation --title "feat(ecosystem): curated hero mosaic + first-party disclaimer suppression" --body "<summary + link to spec>"
```
Request a Fable/Opus review per the project convention; resolve findings.

- [ ] **Step 3: Merge to main**

Merge the PR. Confirm `deploy.yml` builds the image for the merge SHA in Artifact Registry (poll the AR by full SHA before bumping — avoids ImagePullBackOff).

- [ ] **Step 4: Bump the image tag → Flux rollout (lands the column)**

In `k8s/kustomization.yaml`, set `newTag` to the **quoted** merge full SHA; commit + push to main. Flux reconciles; the deployment's `migrate` initContainer runs `prisma db push`, adding `inMosaic`. Verify rollout and `https://subfrost.io/api/health` = 200.

- [ ] **Step 5: Seed the initial 16 (in-pod, idempotent)**

Write this script and run it in the app pod (via `.ioenv-extracted/kubectl-io.sh` exec, piping through `sh -c 'cat >/tmp/seed.js && cd /app && NODE_PATH=/app/node_modules node /tmp/seed.js'`):

```js
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const MOSAIC = ["diesel","frbtc","subfrost","arbuzino","fire","espo","alkanex","alka-trade","aries","cheekyb","dohm-finance","fairmints","fartane","sablital","surtur","pizza-fun"];
(async () => {
  const on = await p.ecosystemProject.updateMany({ where: { slug: { in: MOSAIC } }, data: { inMosaic: true } });
  const off = await p.ecosystemProject.updateMany({ where: { slug: { notIn: MOSAIC } }, data: { inMosaic: false } });
  console.log("mosaic on:", on.count, "(expect 16)  off:", off.count);
})().catch(e => { console.error("ERR", e.message); process.exit(1); }).finally(() => p.$disconnect());
```

Expected: `mosaic on: 16  off: <rest>`.

- [ ] **Step 6: Verify live**

- `/ecosystem` hero mosaic shows the 16 (Surtur + Pizza.fun present; ClockIn + METHANE gone).
- `/ecosystem/diesel`, `/ecosystem/fire`, `/ecosystem/frbtc`, `/ecosystem/subfrost` have **no** disclaimer block in the header.
- A third-party profile (e.g. `/ecosystem/arbuzino`) still shows the disclaimer.
- `/ecosystem` top-of-directory disclaimer still present.

---

## Self-Review

- **Spec coverage:** Frente A (constants + conditional notice) → Task 3; directory notice unchanged → intentionally no task; Frente B (schema → Task 1, public → Task 1, HeroMosaic filter+guard → Task 2, admin toggle → Tasks 4+5); initial content + deploy → Task 6. All covered.
- **Deviation from spec (noted):** filtering lives in `HeroMosaic` (not `app/ecosystem/page.tsx`) for unit-testability and so `page.tsx` needs no change. Same behavior.
- **Type consistency:** `inMosaic: boolean` is added to `PublicEcosystemProject` (T1), `EcosystemProjectInput` (T4), and `AdminProject` (T5); the three test factories get `inMosaic: false` (T1). `isFirstParty` defined once in constants (T3), imported in the profile.
- **Placeholders:** none — every code step shows the exact code.
