# Alkanes Ecosystem Portal (`/ecosystem`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public directory page `subfrost.io/ecosystem` (direção C — navy cover hero, featured band, card grid) listing Alkanes projects, backed by a Prisma model with an IAM-gated admin CRUD at `/admin/ecosystem`, plus a seed of 20 researched projects.

**Architecture:** Single `EcosystemProject` model with per-locale description columns + single-row `EcosystemSettings` for the featured-band toggle. Server actions do all mutations (privilege-checked, `revalidatePath`). Public page is a `force-dynamic` server component (locale via `?lang=zh` like `/data`) rendering a client `EcosystemDirectory` with category-chip filtering.

**Tech Stack:** Next.js App Router, Prisma/Postgres, Tailwind v3 (`--ed-*` CSS vars via arbitrary values), vitest + happy-dom, existing IAM (`lib/cms/authz`), existing translate (`lib/cms/translate`), existing GCS upload route.

**Spec:** `docs/superpowers/specs/2026-07-04-ecosystem-portal-design.md` (read it first). Mockup (direção C): https://claude.ai/code/artifact/609d3154-e21a-4173-8298-327bc41c2e96

## Global Constraints

- Work in worktree `C:\Alkanes Geral Dev\wt-ecosystem`, branch `feat/ecosystem-portal`. NEVER push to main.
- Package manager: `pnpm` (npm gives ERESOLVE react19×vaul). Install already done? If `node_modules` missing: copy `.npmrc` from main checkout exists already, run `pnpm install`.
- After ANY `prisma/schema.prisma` change run `pnpm prisma generate` before `pnpm tsc --noEmit` (stale client = phantom type errors).
- Tests: `pnpm vitest run <file>` per task; full suite gate at the end. 4 pre-existing failures in admin-nav/admin-landing tests are allow-listed — do not "fix" them, do not add to them.
- `next build` on Windows fails at the standalone step (EPERM symlink) — "Compiled successfully" is the local signal; CI Linux is the gate.
- Category/status are Strings validated in code (NOT Postgres enums). Categories: `DeFi, Wallet, Tooling, Launchpad, NFT, Gaming, Social, Other`. Statuses: `Live, Beta, Building`.
- Copy rules: public page copy lives in a `copy = { en, zh }` object in the page file (house pattern from `app/data/page.tsx`). ZH falls back to EN when `descriptionZh` is empty.
- All admin mutations return `{ ok: boolean, error?: string }` and call `revalidatePath("/ecosystem")` + `revalidatePath("/admin/ecosystem")`.
- Commit after every task (small commits, `feat(ecosystem): …` / `test(ecosystem): …`).

---

### Task 1: Prisma schema + domain constants

**Files:**
- Modify: `prisma/schema.prisma` (append at end)
- Create: `lib/ecosystem/constants.ts`
- Test: `tests/ecosystem/constants.test.ts`

**Interfaces:**
- Produces: prisma models `ecosystemProject`, `ecosystemSettings`; `ECOSYSTEM_CATEGORIES`, `ECOSYSTEM_STATUSES`, `type EcosystemCategory`, `type EcosystemStatus`, `isValidCategory(v: string): boolean`, `isValidStatus(v: string): boolean`, `isValidHttpUrl(v: string): boolean`, `isValidOptionalHttpUrl(v: string | null | undefined): boolean`, `slugify(name: string): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ecosystem/constants.test.ts
import { describe, it, expect } from "vitest"
import {
  ECOSYSTEM_CATEGORIES,
  ECOSYSTEM_STATUSES,
  isValidCategory,
  isValidStatus,
  isValidHttpUrl,
  isValidOptionalHttpUrl,
  slugify,
} from "@/lib/ecosystem/constants"

describe("ecosystem constants", () => {
  it("has the curated category list", () => {
    expect(ECOSYSTEM_CATEGORIES).toEqual([
      "DeFi", "Wallet", "Tooling", "Launchpad", "NFT", "Gaming", "Social", "Other",
    ])
  })

  it("validates categories and statuses", () => {
    expect(isValidCategory("DeFi")).toBe(true)
    expect(isValidCategory("defi")).toBe(false)
    expect(isValidStatus("Live")).toBe(true)
    expect(isValidStatus("Dead")).toBe(false)
    expect(ECOSYSTEM_STATUSES).toContain("Building")
  })

  it("validates http(s) URLs only", () => {
    expect(isValidHttpUrl("https://subfrost.io")).toBe(true)
    expect(isValidHttpUrl("http://example.com/a?b=1")).toBe(true)
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false)
    expect(isValidHttpUrl("ftp://x.com")).toBe(false)
    expect(isValidHttpUrl("not a url")).toBe(false)
  })

  it("treats empty optional URLs as valid, junk as invalid", () => {
    expect(isValidOptionalHttpUrl(null)).toBe(true)
    expect(isValidOptionalHttpUrl(undefined)).toBe(true)
    expect(isValidOptionalHttpUrl("")).toBe(true)
    expect(isValidOptionalHttpUrl("https://x.com/foo")).toBe(true)
    expect(isValidOptionalHttpUrl("javascript:x")).toBe(false)
  })

  it("slugifies names", () => {
    expect(slugify("Oyl Wallet")).toBe("oyl-wallet")
    expect(slugify("alkanes.build")).toBe("alkanes-build")
    expect(slugify("  Pizza.fun!! ")).toBe("pizza-fun")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ecosystem/constants.test.ts`
Expected: FAIL — cannot resolve `@/lib/ecosystem/constants`.

- [ ] **Step 3: Implement**

```typescript
// lib/ecosystem/constants.ts
/**
 * Curated lists for the Alkanes ecosystem directory. Plain strings (not DB
 * enums) so adding a category is a code-only change — server actions validate
 * against these before writing.
 */
export const ECOSYSTEM_CATEGORIES = [
  "DeFi", "Wallet", "Tooling", "Launchpad", "NFT", "Gaming", "Social", "Other",
] as const
export type EcosystemCategory = (typeof ECOSYSTEM_CATEGORIES)[number]

export const ECOSYSTEM_STATUSES = ["Live", "Beta", "Building"] as const
export type EcosystemStatus = (typeof ECOSYSTEM_STATUSES)[number]

export function isValidCategory(v: string): v is EcosystemCategory {
  return (ECOSYSTEM_CATEGORIES as readonly string[]).includes(v)
}

export function isValidStatus(v: string): v is EcosystemStatus {
  return (ECOSYSTEM_STATUSES as readonly string[]).includes(v)
}

export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

export function isValidOptionalHttpUrl(v: string | null | undefined): boolean {
  if (v == null || v === "") return true
  return isValidHttpUrl(v)
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
```

Append to `prisma/schema.prisma` (end of file):

```prisma
// ── Alkanes ecosystem directory (public /ecosystem + /admin/ecosystem) ──

model EcosystemProject {
  id            String   @id @default(cuid())
  slug          String   @unique
  name          String
  logoUrl       String?
  category      String
  status        String   @default("Live")
  url           String
  xUrl          String?
  docsUrl       String?
  descriptionEn String   @default("")
  descriptionZh String   @default("")
  featured      Boolean  @default(false)
  sortOrder     Int      @default(0)
  published     Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([published, featured, sortOrder])
}

model EcosystemSettings {
  id                  Int     @id @default(1)
  featuredBandEnabled Boolean @default(true)
}
```

- [ ] **Step 4: Generate client, run tests**

Run: `pnpm prisma generate && pnpm vitest run tests/ecosystem/constants.test.ts`
Expected: PASS (5 tests). Also run `pnpm tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma lib/ecosystem/constants.ts tests/ecosystem/constants.test.ts
git commit -m "feat(ecosystem): EcosystemProject/EcosystemSettings models + domain constants"
```

---

### Task 2: IAM privileges, view gates, admin nav

**Files:**
- Modify: `lib/cms/iam/registry.ts` (CategoryKey union, CATEGORIES, PRIVILEGES, VIEW_GATES)
- Modify: `lib/cms/iam/icons.tsx` (CATEGORY_ICON)
- Modify: `lib/cms/admin-nav.ts` (new NavGroup)
- Test: `tests/ecosystem/iam.test.ts`

**Interfaces:**
- Consumes: registry shapes (`PrivilegeDef`, `CategoryDef`, `VIEW_GATES`), `visibleNav(privileges: string[])` from `lib/cms/admin-nav`.
- Produces: privilege codes `"ecosystem.view"` and `"ecosystem.edit"` (edit implies view); route gate `"/admin/ecosystem"`; nav group `key: "ecosystem"`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ecosystem/iam.test.ts
import { describe, it, expect } from "vitest"
import { PRIVILEGES, CATEGORIES, VIEW_GATES, expand } from "@/lib/cms/iam/registry"
import { visibleNav } from "@/lib/cms/admin-nav"

describe("ecosystem IAM", () => {
  it("registers ecosystem.view and ecosystem.edit with implication", () => {
    const codes = PRIVILEGES.map((p) => p.code)
    expect(codes).toContain("ecosystem.view")
    expect(codes).toContain("ecosystem.edit")
    expect(expand(["ecosystem.edit"])).toContain("ecosystem.view")
  })

  it("has an Ecosystem category", () => {
    expect(CATEGORIES.some((c) => c.key === "ecosystem")).toBe(true)
  })

  it("gates /admin/ecosystem", () => {
    expect(VIEW_GATES["/admin/ecosystem"]).toEqual({ view: "ecosystem.view", edit: "ecosystem.edit" })
  })

  it("shows the Ecosystem nav group only with the privilege", () => {
    const without = visibleNav([])
    expect(without.some((g) => g.key === "ecosystem")).toBe(false)
    const withPriv = visibleNav(["ecosystem.view"])
    expect(withPriv.some((g) => g.key === "ecosystem")).toBe(true)
  })
})
```

Note: if `expand` is not exported with that exact name, check `lib/cms/iam/registry.ts` for the closure helper (the registry doc says "closure via expand()") and use its real name; adjust the test to the real API rather than changing the registry's API.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ecosystem/iam.test.ts`
Expected: FAIL — codes missing.

- [ ] **Step 3: Implement (4 small edits, follow existing style exactly)**

In `lib/cms/iam/registry.ts`:
1. `CategoryKey` union: add `| "ecosystem"`.
2. `CATEGORIES`: after `{ key: "marketing", label: "Marketing" }` add `{ key: "ecosystem", label: "Ecosystem" },`.
3. `PRIVILEGES` (new section after the marketing block):

```typescript
  // --- Ecosystem directory ---
  { code: "ecosystem.view", label: "Ecosystem — view", description: "View the Alkanes ecosystem project directory admin.", category: "ecosystem", implies: [] },
  { code: "ecosystem.edit", label: "Ecosystem — edit", description: "Create, edit, publish, and delete ecosystem projects; toggle the featured band.", category: "ecosystem", implies: ["ecosystem.view"] },
```

4. `VIEW_GATES`: add `"/admin/ecosystem": { view: "ecosystem.view", edit: "ecosystem.edit" },`.

In `lib/cms/iam/icons.tsx`: add to `CATEGORY_ICON`: `ecosystem: Boxes,` (import `Boxes` from `lucide-react`).

In `lib/cms/admin-nav.ts`: add a group after the marketing group (import `Boxes` from `lucide-react`):

```typescript
  {
    key: "ecosystem", label: "Ecosystem", icon: Boxes, items: [
      { label: "Projects", href: "/admin/ecosystem", icon: Boxes, privilege: "ecosystem.view" },
    ],
  },
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/ecosystem/iam.test.ts tests/cms/admin-nav.test.ts`
Expected: iam.test.ts PASS. admin-nav.test.ts: same result as on main (it is in the allow-listed failing group — compare failure count before/after your change; it must not get WORSE. `visibleNav([])` must still not include "ecosystem").

- [ ] **Step 5: Commit**

```bash
git add lib/cms/iam/registry.ts lib/cms/iam/icons.tsx lib/cms/admin-nav.ts tests/ecosystem/iam.test.ts
git commit -m "feat(ecosystem): IAM privileges, view gate and admin nav for the ecosystem directory"
```

---

### Task 3: Server actions (CRUD + featured-band toggle + translate)

**Files:**
- Create: `actions/ecosystem/projects.ts`
- Test: `tests/ecosystem/actions.test.ts`

**Interfaces:**
- Consumes: `currentUser` from `@/lib/cms/authz` (returns `{ privileges: string[] } | null`), `prisma` from `@/lib/prisma`, `translate` + `translationUnavailable` from `@/lib/cms/translate` (signature `translate(content: { title: string; excerpt: string; body: string; sources: string }, from: Locale, to: Locale)`), constants from Task 1.
- Produces:
  - `type EcosystemProjectInput = { id?: string; name: string; slug?: string; logoUrl?: string | null; category: string; status: string; url: string; xUrl?: string | null; docsUrl?: string | null; descriptionEn: string; descriptionZh: string; featured: boolean; sortOrder: number; published: boolean }`
  - `saveEcosystemProject(input: EcosystemProjectInput): Promise<{ ok: boolean; id?: string; error?: string }>`
  - `deleteEcosystemProject(id: string): Promise<{ ok: boolean; error?: string }>`
  - `setFeaturedBandEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }>`
  - `translateEcosystemDescription(descriptionEn: string): Promise<{ ok: boolean; zh?: string; error?: string }>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ecosystem/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cms/translate", () => ({
  translate: vi.fn(),
  translationUnavailable: vi.fn(() => false),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: {
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(),
    },
    ecosystemSettings: { upsert: vi.fn() },
  },
}))

import { currentUser } from "@/lib/cms/authz"
import { prisma } from "@/lib/prisma"
import { translate } from "@/lib/cms/translate"
import {
  saveEcosystemProject,
  deleteEcosystemProject,
  setFeaturedBandEnabled,
  translateEcosystemDescription,
} from "@/actions/ecosystem/projects"

const editor = { privileges: ["ecosystem.view", "ecosystem.edit"] }
const viewer = { privileges: ["ecosystem.view"] }

const validInput = {
  name: "Fairmints",
  category: "Launchpad",
  status: "Live",
  url: "https://fairmints.io",
  xUrl: "https://x.com/fairmints",
  docsUrl: null,
  descriptionEn: "Bitcoin minting made easy.",
  descriptionZh: "",
  featured: false,
  sortOrder: 10,
  published: true,
}

beforeEach(() => vi.clearAllMocks())

describe("saveEcosystemProject", () => {
  it("rejects unauthenticated", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null as never)
    const res = await saveEcosystemProject(validInput)
    expect(res.ok).toBe(false)
    expect(prisma.ecosystemProject.create).not.toHaveBeenCalled()
  })

  it("rejects viewer without edit privilege", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(viewer as never)
    const res = await saveEcosystemProject(validInput)
    expect(res.ok).toBe(false)
  })

  it("rejects bad category, status and url", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    expect((await saveEcosystemProject({ ...validInput, category: "Meme" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, status: "Dead" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, url: "javascript:x" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, xUrl: "notaurl" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, name: "  " })).ok).toBe(false)
    expect(prisma.ecosystemProject.create).not.toHaveBeenCalled()
  })

  it("creates with derived slug when none given", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.create as never).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject(validInput)
    expect(res).toEqual({ ok: true, id: "p1" })
    expect(prisma.ecosystemProject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "fairmints" }) })
    )
  })

  it("updates when id given", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.update as never).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject({ ...validInput, id: "p1" })
    expect(res.ok).toBe(true)
    expect(prisma.ecosystemProject.update).toHaveBeenCalled()
  })
})

describe("deleteEcosystemProject / setFeaturedBandEnabled", () => {
  it("requires edit privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(viewer as never)
    expect((await deleteEcosystemProject("p1")).ok).toBe(false)
    expect((await setFeaturedBandEnabled(false)).ok).toBe(false)
  })

  it("upserts the settings row", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    const res = await setFeaturedBandEnabled(false)
    expect(res.ok).toBe(true)
    expect(prisma.ecosystemSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { featuredBandEnabled: false },
      create: { id: 1, featuredBandEnabled: false },
    })
  })
})

describe("translateEcosystemDescription", () => {
  it("returns the translated body", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(translate as never).mockResolvedValueOnce({ title: "", excerpt: "", body: "中文描述", sources: "" } as never)
    const res = await translateEcosystemDescription("English description")
    expect(res).toEqual({ ok: true, zh: "中文描述" })
  })

  it("rejects empty source", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    const res = await translateEcosystemDescription("   ")
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ecosystem/actions.test.ts`
Expected: FAIL — module `@/actions/ecosystem/projects` not found.

- [ ] **Step 3: Implement**

```typescript
// actions/ecosystem/projects.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable } from "@/lib/cms/translate"
import {
  isValidCategory,
  isValidStatus,
  isValidHttpUrl,
  isValidOptionalHttpUrl,
  slugify,
} from "@/lib/ecosystem/constants"

export interface EcosystemProjectInput {
  id?: string
  name: string
  slug?: string
  logoUrl?: string | null
  category: string
  status: string
  url: string
  xUrl?: string | null
  docsUrl?: string | null
  descriptionEn: string
  descriptionZh: string
  featured: boolean
  sortOrder: number
  published: boolean
}

async function requireEdit(): Promise<string | null> {
  const user = await currentUser()
  if (!user) return "Not authenticated"
  if (!user.privileges.includes("ecosystem.edit")) return "Not allowed"
  return null
}

function revalidate() {
  revalidatePath("/ecosystem")
  revalidatePath("/admin/ecosystem")
}

function validate(input: EcosystemProjectInput): string | null {
  if (!input.name?.trim()) return "Name is required"
  if (!isValidCategory(input.category)) return "Unknown category"
  if (!isValidStatus(input.status)) return "Unknown status"
  if (!isValidHttpUrl(input.url)) return "Website must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.xUrl)) return "X link must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.docsUrl)) return "Docs link must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.logoUrl)) return "Logo must be a valid http(s) URL"
  return null
}

export async function saveEcosystemProject(
  input: EcosystemProjectInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  const err = validate(input)
  if (err) return { ok: false, error: err }

  const data = {
    name: input.name.trim(),
    logoUrl: input.logoUrl?.trim() || null,
    category: input.category,
    status: input.status,
    url: input.url.trim(),
    xUrl: input.xUrl?.trim() || null,
    docsUrl: input.docsUrl?.trim() || null,
    descriptionEn: input.descriptionEn.trim(),
    descriptionZh: input.descriptionZh.trim(),
    featured: input.featured,
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
    published: input.published,
  }

  try {
    if (input.id) {
      const row = await prisma.ecosystemProject.update({ where: { id: input.id }, data })
      revalidate()
      return { ok: true, id: row.id }
    }
    const slug = slugify(input.slug?.trim() || input.name)
    if (!slug) return { ok: false, error: "Could not derive a slug from the name" }
    const row = await prisma.ecosystemProject.create({ data: { ...data, slug } })
    revalidate()
    return { ok: true, id: row.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed"
    return { ok: false, error: msg.includes("Unique constraint") ? "Slug already exists" : msg }
  }
}

export async function deleteEcosystemProject(id: string): Promise<{ ok: boolean; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  try {
    await prisma.ecosystemProject.delete({ where: { id } })
    revalidate()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" }
  }
}

export async function setFeaturedBandEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  await prisma.ecosystemSettings.upsert({
    where: { id: 1 },
    update: { featuredBandEnabled: enabled },
    create: { id: 1, featuredBandEnabled: enabled },
  })
  revalidate()
  return { ok: true }
}

export async function translateEcosystemDescription(
  descriptionEn: string
): Promise<{ ok: boolean; zh?: string; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  if (!descriptionEn.trim()) return { ok: false, error: "Nothing to translate" }
  if (translationUnavailable()) return { ok: false, error: "Translation unavailable (no API key)" }
  // Reuse the article translator; only `body` carries content for a short blurb.
  const out = await translate(
    { title: "", excerpt: "", body: descriptionEn.trim(), sources: "" },
    "en",
    "zh"
  )
  return { ok: true, zh: out.body.trim() }
}
```

Note: check `lib/cms/translate.ts` `Locale` type import — if `translate` expects the Prisma `Locale` enum, import it (`import type { Locale } from "@prisma/client"`) and pass `"en" as Locale`/`"zh" as Locale` the same way `actions/cms/articles.ts` does. Copy that file's exact convention.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/ecosystem/actions.test.ts`
Expected: PASS (9 tests). `pnpm tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add actions/ecosystem/projects.ts tests/ecosystem/actions.test.ts
git commit -m "feat(ecosystem): server actions — CRUD, featured-band toggle, EN→ZH translate"
```

---

### Task 4: Public data layer

**Files:**
- Create: `lib/ecosystem/public.ts`
- Test: `tests/ecosystem/public.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces:
  - `type PublicEcosystemProject = { slug: string; name: string; logoUrl: string | null; category: string; status: string; url: string; xUrl: string | null; docsUrl: string | null; description: string; featured: boolean }`
  - `getEcosystemDirectory(locale: "en" | "zh"): Promise<{ projects: PublicEcosystemProject[]; featuredBandEnabled: boolean }>` — only `published: true`, ordered `featured desc, sortOrder asc, name asc`, description resolved with ZH→EN fallback. `projects` includes featured ones (the component splits them).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ecosystem/public.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn() },
    ecosystemSettings: { findUnique: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { getEcosystemDirectory } from "@/lib/ecosystem/public"

const row = (over: Record<string, unknown>) => ({
  slug: "x", name: "X", logoUrl: null, category: "DeFi", status: "Live",
  url: "https://x.io", xUrl: null, docsUrl: null,
  descriptionEn: "english", descriptionZh: "中文",
  featured: false, sortOrder: 0, published: true, ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("getEcosystemDirectory", () => {
  it("queries only published, in directory order", async () => {
    vi.mocked(prisma.ecosystemProject.findMany as never).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique as never).mockResolvedValueOnce(null as never)
    await getEcosystemDirectory("en")
    expect(prisma.ecosystemProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { published: true },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      })
    )
  })

  it("resolves zh with fallback to en", async () => {
    vi.mocked(prisma.ecosystemProject.findMany as never).mockResolvedValueOnce([
      row({ slug: "a", descriptionZh: "中文" }),
      row({ slug: "b", descriptionZh: "" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique as never).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("zh")
    expect(projects.find((p) => p.slug === "a")?.description).toBe("中文")
    expect(projects.find((p) => p.slug === "b")?.description).toBe("english")
  })

  it("defaults featuredBandEnabled to true when no settings row", async () => {
    vi.mocked(prisma.ecosystemProject.findMany as never).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique as never).mockResolvedValueOnce(null as never)
    const { featuredBandEnabled } = await getEcosystemDirectory("en")
    expect(featuredBandEnabled).toBe(true)
  })

  it("respects a disabled settings row", async () => {
    vi.mocked(prisma.ecosystemProject.findMany as never).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique as never).mockResolvedValueOnce({ id: 1, featuredBandEnabled: false } as never)
    const { featuredBandEnabled } = await getEcosystemDirectory("en")
    expect(featuredBandEnabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ecosystem/public.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// lib/ecosystem/public.ts
import { prisma } from "@/lib/prisma"

export interface PublicEcosystemProject {
  slug: string
  name: string
  logoUrl: string | null
  category: string
  status: string
  url: string
  xUrl: string | null
  docsUrl: string | null
  description: string
  featured: boolean
}

export async function getEcosystemDirectory(locale: "en" | "zh"): Promise<{
  projects: PublicEcosystemProject[]
  featuredBandEnabled: boolean
}> {
  const [rows, settings] = await Promise.all([
    prisma.ecosystemProject.findMany({
      where: { published: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.ecosystemSettings.findUnique({ where: { id: 1 } }),
  ])

  const projects = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    category: r.category,
    status: r.status,
    url: r.url,
    xUrl: r.xUrl,
    docsUrl: r.docsUrl,
    description: locale === "zh" && r.descriptionZh ? r.descriptionZh : r.descriptionEn,
    featured: r.featured,
  }))

  return { projects, featuredBandEnabled: settings?.featuredBandEnabled ?? true }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/ecosystem/public.test.ts` — PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ecosystem/public.ts tests/ecosystem/public.test.ts
git commit -m "feat(ecosystem): public directory data layer with locale fallback"
```

---

### Task 5: Public page `/ecosystem` (direção C)

**Files:**
- Create: `app/ecosystem/page.tsx`
- Create: `components/ecosystem/EcosystemDirectory.tsx` (client)
- Test: `tests/ecosystem/directory.test.tsx`

**Interfaces:**
- Consumes: `getEcosystemDirectory` + `PublicEcosystemProject` (Task 4), `EditorialShell` from `@/components/articles/EditorialShell` (`{ children }` only), `absoluteUrl` from `@/lib/seo`, `ECOSYSTEM_CATEGORIES` (Task 1).
- Produces: route `/ecosystem`; client component `EcosystemDirectory({ projects, featuredBandEnabled, copy, locale })`.

Visual reference (approved mockup, direção C): navy cover hero `linear-gradient(150deg, var(--ed-cover), var(--ed-cover-2))` + ice radial glow, white display type (Geist, ~font-normal, tight leading, tracking-tight), mono counts, white CTA button whose arrow is `var(--ed-flare)`; below: category chips (mono, pill, active = ink bg), optional featured band (2 wide cards, "FEATURED" mono tag in flare), then responsive card grid; monogram fallback = gradient tile (navy→ice family) with 1–2 initials; status dot colors: Live `#178a4c`, Beta `#b7791f`, Building `var(--ed-muted)`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ecosystem/directory.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EcosystemDirectory, type DirectoryCopy } from "@/components/ecosystem/EcosystemDirectory"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

const copy: DirectoryCopy = {
  filterAll: "All",
  featuredTag: "Featured",
  website: "Website",
  docs: "Docs",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
}

const p = (over: Partial<PublicEcosystemProject>): PublicEcosystemProject => ({
  slug: "x", name: "X", logoUrl: null, category: "DeFi", status: "Live",
  url: "https://x.io", xUrl: null, docsUrl: null, description: "d", featured: false, ...over,
})

const projects = [
  p({ slug: "subfrost", name: "SUBFROST", featured: true }),
  p({ slug: "oyl", name: "Oyl Wallet", category: "Wallet", featured: true }),
  p({ slug: "bound", name: "Bound", category: "DeFi" }),
  p({ slug: "ordiscan", name: "Ordiscan", category: "Tooling" }),
]

describe("EcosystemDirectory", () => {
  it("renders featured band when enabled", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    expect(screen.getAllByText("Featured").length).toBe(2)
  })

  it("hides featured band when disabled — featured projects fall into the grid", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled={false} copy={copy} />)
    expect(screen.queryByText("Featured")).toBeNull()
    expect(screen.getByText("SUBFROST")).toBeInTheDocument()
  })

  it("filters by category chip", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("button", { name: /Tooling/ }))
    expect(screen.getByText("Ordiscan")).toBeInTheDocument()
    expect(screen.queryByText("Bound")).toBeNull()
    expect(screen.queryByText("SUBFROST")).toBeNull() // featured filtered too
  })

  it("chips only show categories present plus All", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    expect(screen.queryByRole("button", { name: /Gaming/ })).toBeNull()
    expect(screen.getByRole("button", { name: /All/ })).toBeInTheDocument()
  })

  it("renders monogram fallback when no logo", () => {
    render(<EcosystemDirectory projects={[p({ slug: "bound", name: "Bound" })]} featuredBandEnabled={false} copy={copy} />)
    expect(screen.getByText("B")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ecosystem/directory.test.tsx` — FAIL (module not found).

- [ ] **Step 3: Implement the client component**

```tsx
// components/ecosystem/EcosystemDirectory.tsx
"use client"

import { useMemo, useState } from "react"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

export interface DirectoryCopy {
  filterAll: string
  featuredTag: string
  website: string
  docs: string
  statuses: Record<string, string>
}

const STATUS_COLOR: Record<string, string> = {
  Live: "#178a4c",
  Beta: "#b7791f",
  Building: "var(--ed-muted)",
}

const GRADS = [
  "linear-gradient(135deg,#11294a,#1a3c66)",
  "linear-gradient(135deg,#1a4d8f,#5b9cff)",
  "linear-gradient(135deg,#0a1628,#1a4d8f)",
  "linear-gradient(135deg,#1a3c66,#5b9cff)",
  "linear-gradient(135deg,#11294a,#5b9cff)",
]

function gradFor(slug: string) {
  let h = 0
  for (const ch of slug) h = (h + ch.charCodeAt(0)) % GRADS.length
  return GRADS[h]
}

function initials(name: string) {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 1).toUpperCase()
}

function Mark({ p, size }: { p: PublicEcosystemProject; size: number }) {
  if (p.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.logoUrl} alt="" width={size} height={size} className="rounded-[10px] object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-[10px] font-semibold text-white"
      style={{ width: size, height: size, background: gradFor(p.slug), fontSize: size * 0.38 }}
    >
      {initials(p.name)}
    </span>
  )
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.Building
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color }}>
      <i className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function LinksRow({ p, copy }: { p: PublicEcosystemProject; copy: DirectoryCopy }) {
  return (
    <div className="mt-auto flex gap-1.5">
      <a
        href={p.url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-[7px] border border-[color:var(--ed-hair)] px-2.5 py-1 text-[12.5px] font-medium text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)] hover:bg-[color:var(--ed-surface)]"
      >
        {copy.website} ↗
      </a>
      {p.xUrl ? (
        <a href={p.xUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-[color:var(--ed-muted)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-accent)]">𝕏</a>
      ) : null}
      {p.docsUrl ? (
        <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-[color:var(--ed-muted)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-accent)]">{copy.docs}</a>
      ) : null}
    </div>
  )
}

export function EcosystemDirectory({
  projects,
  featuredBandEnabled,
  copy,
}: {
  projects: PublicEcosystemProject[]
  featuredBandEnabled: boolean
  copy: DirectoryCopy
}) {
  const [cat, setCat] = useState<string>("__all__")

  const cats = useMemo(() => {
    const seen = new Map<string, number>()
    for (const p of projects) seen.set(p.category, (seen.get(p.category) ?? 0) + 1)
    return [...seen.entries()]
  }, [projects])

  const visible = cat === "__all__" ? projects : projects.filter((p) => p.category === cat)
  const showBand = featuredBandEnabled && cat === "__all__" ? visible.some((p) => p.featured) : false
  const featured = showBand ? visible.filter((p) => p.featured) : []
  const grid = showBand ? visible.filter((p) => !p.featured) : visible

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-[color:var(--ed-hair)] px-6 py-5 sm:px-10" role="group">
        <Chip active={cat === "__all__"} onClick={() => setCat("__all__")} label={copy.filterAll} count={projects.length} />
        {cats.map(([c, n]) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)} label={c} count={n} />
        ))}
      </div>

      {featured.length > 0 ? (
        <div className="grid gap-5 px-6 pt-7 sm:grid-cols-2 sm:px-10">
          {featured.map((p) => (
            <a key={p.slug} href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex flex-col gap-3 rounded-[14px] border border-[color:var(--ed-hair)] bg-gradient-to-b from-[color:var(--ed-surface)] to-white p-6 transition-colors hover:border-[color:var(--ed-ice)]">
              <div className="flex items-center gap-3.5">
                <Mark p={p} size={52} />
                <div>
                  <h3 className="text-[20px] font-medium tracking-[-0.012em] text-[color:var(--ed-ink)]">{p.name}</h3>
                  <div className="mt-0.5 flex items-center gap-3">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">{p.category}</span>
                    <StatusBadge status={p.status} label={copy.statuses[p.status] ?? p.status} />
                  </div>
                </div>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ed-flare)]">{copy.featuredTag}</span>
              </div>
              <p className="text-[14.5px] leading-relaxed text-[color:var(--ed-body)]">{p.description}</p>
              <LinksRow p={p} copy={copy} />
            </a>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3.5 px-6 py-6 sm:grid-cols-2 sm:px-10 lg:grid-cols-3 xl:grid-cols-4">
        {grid.map((p) => (
          <a key={p.slug} href={p.url} target="_blank" rel="noopener noreferrer"
            className="flex flex-col gap-2.5 rounded-[11px] border border-[color:var(--ed-hair)] bg-white p-[18px] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[color:var(--ed-ice)] motion-reduce:hover:translate-y-0">
            <div className="flex items-center gap-2.5">
              <Mark p={p} size={34} />
              <h3 className="text-[15px] font-medium text-[color:var(--ed-ink)]">{p.name}</h3>
            </div>
            <p className="text-[12.8px] leading-snug text-[color:var(--ed-muted)]">{p.description}</p>
            <div className="mt-auto flex items-center justify-between pt-1">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">{p.category}</span>
              <StatusBadge status={p.status} label={copy.statuses[p.status] ?? p.status} />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3.5 py-1.5 font-mono text-[11.5px] font-medium transition-colors " +
        (active
          ? "border-[color:var(--ed-ink)] bg-[color:var(--ed-ink)] text-white"
          : "border-[color:var(--ed-hair)] bg-white text-[color:var(--ed-body)] hover:border-[color:var(--ed-ice)] hover:text-[color:var(--ed-accent)]")
      }
    >
      {label}
      <span className={"ml-1.5 " + (active ? "text-white/55" : "text-[color:var(--ed-muted)]")}>{count}</span>
    </button>
  )
}
```

- [ ] **Step 4: Run component tests**

Run: `pnpm vitest run tests/ecosystem/directory.test.tsx` — PASS (5 tests).

- [ ] **Step 5: Implement the page (server component)**

```tsx
// app/ecosystem/page.tsx
import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { EcosystemDirectory } from "@/components/ecosystem/EcosystemDirectory"
import { getEcosystemDirectory } from "@/lib/ecosystem/public"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy = {
  en: {
    metaTitle: "The Alkanes ecosystem — projects building on Bitcoin",
    metaDescription: "Every project building on Alkanes — wallets, DeFi, launchpads and tooling for smart contracts on Bitcoin L1. One page, always current.",
    eyebrow: "Alkanes · ecosystem",
    title: "Everything being built on Alkanes",
    subtitle: "Smart contracts on Bitcoin L1 — and the wallets, exchanges, launchpads and tools shipping on them. Find a project, click through, dive in.",
    cta: "Building here? Get listed",
    projectsWord: "projects",
    categoriesWord: "categories",
    directory: {
      filterAll: "All",
      featuredTag: "Featured",
      website: "Website",
      docs: "Docs",
      statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
    },
  },
  zh: {
    metaTitle: "Alkanes 生态系统 — 构建在比特币上的项目",
    metaDescription: "所有基于 Alkanes 构建的项目——比特币主链智能合约的钱包、DeFi、发行平台与工具，一页尽览，持续更新。",
    eyebrow: "Alkanes · 生态系统",
    title: "Alkanes 上正在构建的一切",
    subtitle: "比特币主链上的智能合约，以及围绕它们的钱包、交易、发行平台与工具。找到项目，点击进入，即刻参与。",
    cta: "在 Alkanes 上构建？申请收录",
    projectsWord: "个项目",
    categoriesWord: "个分类",
    directory: {
      filterAll: "全部",
      featuredTag: "精选",
      website: "官网",
      docs: "文档",
      statuses: { Live: "已上线", Beta: "测试版", Building: "构建中" },
    },
  },
} // one copy object per locale; keep both shapes identical

const GET_LISTED_URL = "https://x.com/SUBFROSTio"

export async function generateMetadata({ searchParams }: { searchParams?: Promise<{ lang?: string }> }): Promise<Metadata> {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: {
      canonical: absoluteUrl("/ecosystem"),
      languages: { en: absoluteUrl("/ecosystem"), zh: absoluteUrl("/ecosystem?lang=zh"), "x-default": absoluteUrl("/ecosystem") },
    },
  }
}

export default async function EcosystemPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  const { projects, featuredBandEnabled } = await getEcosystemDirectory(locale)
  const categoryCount = new Set(projects.map((p) => p.category)).size

  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[1280px] px-0 pb-24 pt-8 sm:px-6">
        <section
          className="relative overflow-hidden sm:rounded-[16px]"
          style={{ background: "linear-gradient(150deg, var(--ed-cover), var(--ed-cover-2) 78%)" }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(680px 300px at 85% -10%, rgba(91,156,255,0.28), transparent 65%)" }} />
          <div className="relative px-6 py-14 sm:px-10">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#9fb6dd]">{c.eyebrow}</p>
            <h1 className="mt-3 max-w-[14ch] text-balance text-[clamp(32px,5vw,54px)] font-normal leading-[1.02] tracking-[-0.025em] text-white">{c.title}</h1>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.55] text-[#c9d8f2]">{c.subtitle}</p>
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <a
                href={GET_LISTED_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[8px] bg-white px-4.5 py-2.5 text-[14px] font-medium text-[color:var(--ed-ink)] transition-transform hover:-translate-y-px motion-reduce:hover:translate-y-0"
              >
                {c.cta} <span className="text-[color:var(--ed-flare)]">→</span>
              </a>
              <span className="font-mono text-[12.5px] text-[#9fb6dd]" style={{ fontVariantNumeric: "tabular-nums" }}>
                <b className="font-medium text-white">{projects.length}</b> {c.projectsWord} · <b className="font-medium text-white">{categoryCount}</b> {c.categoriesWord}
              </span>
            </div>
          </div>
        </section>

        <EcosystemDirectory projects={projects} featuredBandEnabled={featuredBandEnabled} copy={c.directory} />
      </main>
    </EditorialShell>
  )
}
```

Check before coding: confirm `EditorialShell` renders site nav/footer (see how `app/data/page.tsx` uses it) and whether `px-4.5`/`py-2.5` exist in this Tailwind config — if not, use `px-[18px] py-[10px]`.

- [ ] **Step 6: Verify page compiles + full ecosystem tests**

Run: `pnpm tsc --noEmit && pnpm vitest run tests/ecosystem/`
Expected: tsc clean; all ecosystem tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/ecosystem/page.tsx components/ecosystem/EcosystemDirectory.tsx tests/ecosystem/directory.test.tsx
git commit -m "feat(ecosystem): public /ecosystem page — cover hero, featured band, filterable card grid"
```

---

### Task 6: Admin screen `/admin/ecosystem`

**Files:**
- Create: `app/admin/ecosystem/page.tsx`
- Create: `components/cms/ecosystem/EcosystemAdmin.tsx` (client: list + form + toggle)
- Test: `tests/ecosystem/admin-page.test.ts`

**Interfaces:**
- Consumes: `currentUser` from `@/lib/cms/authz`, `redirect` from `next/navigation`, `prisma`, all server actions from Task 3, upload endpoint `POST /api/admin/upload` (FormData `file` + `kind: "ecosystem"` — check `app/api/admin/upload/route.ts`: if `kind` values are restricted to a known set, add `"ecosystem"` to it; otherwise pass-through), `ECOSYSTEM_CATEGORIES`, `ECOSYSTEM_STATUSES`.
- Produces: admin route `/admin/ecosystem`.

- [ ] **Step 1: Write the failing gating test**

```typescript
// tests/ecosystem/admin-page.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`) }),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn() },
    ecosystemSettings: { findUnique: vi.fn() },
  },
}))

import { currentUser } from "@/lib/cms/authz"
import { prisma } from "@/lib/prisma"
import EcosystemAdminPage from "@/app/admin/ecosystem/page"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.ecosystemProject.findMany as never).mockResolvedValue([] as never)
  vi.mocked(prisma.ecosystemSettings.findUnique as never).mockResolvedValue(null as never)
})

describe("/admin/ecosystem gating", () => {
  it("redirects to login when signed out", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null as never)
    await expect(EcosystemAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
  })

  it("redirects to /admin without ecosystem.view", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({ privileges: ["articles.write"] } as never)
    await expect(EcosystemAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin")
  })

  it("renders for a viewer", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({ privileges: ["ecosystem.view"] } as never)
    await expect(EcosystemAdminPage()).resolves.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/ecosystem/admin-page.test.ts` (module not found).

- [ ] **Step 3: Implement the page**

```tsx
// app/admin/ecosystem/page.tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { prisma } from "@/lib/prisma"
import { EcosystemAdmin } from "@/components/cms/ecosystem/EcosystemAdmin"

export const dynamic = "force-dynamic"

export default async function EcosystemAdminPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("ecosystem.view")) redirect("/admin")

  const [projects, settings] = await Promise.all([
    prisma.ecosystemProject.findMany({
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.ecosystemSettings.findUnique({ where: { id: 1 } }),
  ])

  return (
    <EcosystemAdmin
      projects={projects.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))}
      featuredBandEnabled={settings?.featuredBandEnabled ?? true}
      canEdit={me.privileges.includes("ecosystem.edit")}
    />
  )
}
```

- [ ] **Step 4: Implement the client component**

`components/cms/ecosystem/EcosystemAdmin.tsx` — follow the visual conventions of the closest existing admin client component (open `components/cms/ProfileForm.tsx` and the board components for styling/`--ed-*` class patterns before writing). Structure (single file is fine, ~250 lines):

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  saveEcosystemProject,
  deleteEcosystemProject,
  setFeaturedBandEnabled,
  translateEcosystemDescription,
  type EcosystemProjectInput,
} from "@/actions/ecosystem/projects"
import { ECOSYSTEM_CATEGORIES, ECOSYSTEM_STATUSES } from "@/lib/ecosystem/constants"

export interface AdminProject {
  id: string; slug: string; name: string; logoUrl: string | null
  category: string; status: string; url: string; xUrl: string | null; docsUrl: string | null
  descriptionEn: string; descriptionZh: string
  featured: boolean; sortOrder: number; published: boolean
  createdAt: string; updatedAt: string
}

export function EcosystemAdmin({ projects, featuredBandEnabled, canEdit }: {
  projects: AdminProject[]; featuredBandEnabled: boolean; canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<AdminProject | "new" | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggleBand(enabled: boolean) {
    startTransition(async () => {
      const res = await setFeaturedBandEnabled(enabled)
      if (res.ok) router.refresh(); else setError(res.error ?? "Failed")
    })
  }
  // list: table with name, category, status, published + featured toggles (checkbox
  //   that calls saveEcosystemProject({...row, published: !row.published}) etc.),
  //   Edit button → setEditing(row), Delete button → window.confirm then deleteEcosystemProject
  // header: featured-band toggle (switch) + "New project" button (if canEdit)
  // editing !== null → <ProjectForm> panel
}
```

The form (`ProjectForm`, same file): controlled inputs for every field — name, slug (only when creating; read-only after), url, xUrl, docsUrl, category `<select>` from `ECOSYSTEM_CATEGORIES`, status `<select>` from `ECOSYSTEM_STATUSES`, descriptionEn `<textarea rows={3}>`, descriptionZh `<textarea rows={3}>` with a **Translate EN→ZH** button:

```tsx
function translateZh() {
  startTransition(async () => {
    const res = await translateEcosystemDescription(descriptionEn)
    if (res.ok && res.zh) setDescriptionZh(res.zh)
    else setError(res.error ?? "Translate failed")
  })
}
```

Logo upload (same pattern as `ProfileForm.onPickAvatar`):

```tsx
async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append("file", file)
  fd.append("kind", "ecosystem")
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd })
  const json = await res.json()
  if (res.ok) setLogoUrl(json.url)
  else setError(json.error || "Upload failed")
}
```

Save: `startTransition(async () => { const res = await saveEcosystemProject(input); if (res.ok) { setEditing(null); router.refresh() } else setError(res.error ?? "Save failed") })`.

**Upload `kind` check:** open `app/api/admin/upload/route.ts`. If it validates `kind` against a whitelist (e.g. `avatar|cover|inline`), add `"ecosystem"` to that whitelist (and to the GCS path mapping in `handleUpload` if it switches on kind). If it passes `kind` through, no change needed. Include whatever change this requires in this task's commit.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/ecosystem/admin-page.test.ts && pnpm tsc --noEmit`
Expected: PASS (3 tests); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add app/admin/ecosystem/page.tsx components/cms/ecosystem/EcosystemAdmin.tsx tests/ecosystem/admin-page.test.ts
git commit -m "feat(ecosystem): admin CRUD screen with featured-band toggle, logo upload and translate"
```

(If the upload route needed the `kind` whitelist change: `git add app/api/admin/upload/route.ts lib/cms/<upload helper if touched>` too.)

---

### Task 7: Site integration — nav, footer, sitemap, middleware

**Files:**
- Modify: `components/StickyNav.tsx` (add "Ecosystem" link next to the `/articles` link, lines ~84-90 — copy the exact className of the Articles link)
- Modify: `components/Footer.tsx` (add `/ecosystem` link in the resources column next to `/articles`, lines ~70)
- Modify: `app/sitemap.ts` (after the `/data` entries, line ~26)
- Modify: `middleware.ts` (`isEditorialLocalePath`, line ~137-139)
- Test: `tests/ecosystem/integration.test.ts`

**Interfaces:** none new — 4 mechanical edits.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ecosystem/integration.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// These are wiring assertions on source: cheap, but they catch silent regressions
// (e.g. someone removing the nav link) without rendering the whole shell.
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("ecosystem site wiring", () => {
  it("sticky nav links /ecosystem", () => {
    expect(read("components/StickyNav.tsx")).toContain('href="/ecosystem"')
  })
  it("footer links /ecosystem", () => {
    expect(read("components/Footer.tsx")).toContain('href="/ecosystem"')
  })
  it("sitemap includes /ecosystem for both locales", () => {
    const src = read("app/sitemap.ts")
    expect(src).toContain('absoluteUrl("/ecosystem")')
    expect(src).toContain('absoluteUrl("/ecosystem?lang=zh")')
  })
  it("middleware treats /ecosystem as an editorial locale path", () => {
    expect(read("middleware.ts")).toContain('pathname === "/ecosystem"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/ecosystem/integration.test.ts` (4 failures).

- [ ] **Step 3: Make the 4 edits**

`middleware.ts`:

```typescript
function isEditorialLocalePath(pathname: string) {
  return pathname === "/" || pathname === "/data" || pathname === "/ecosystem" || pathname === "/articles" || pathname.startsWith("/articles/") || pathname.startsWith("/authors/")
}
```

`app/sitemap.ts` (after the `/data?lang=zh` entry):

```typescript
    sitemapEntry(absoluteUrl("/ecosystem"), { lastModified: now, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry(absoluteUrl("/ecosystem?lang=zh"), { lastModified: now, changeFrequency: "weekly", priority: 0.6 }),
```

`components/StickyNav.tsx`: duplicate the `/articles` `<Link>` (keep the exact `className`), set `href="/ecosystem"`, label `Ecosystem`, placed immediately after the Articles link.

`components/Footer.tsx`: duplicate the `/articles` footer link with `href="/ecosystem"`, label `Ecosystem`.

- [ ] **Step 4: Run tests** — `pnpm vitest run tests/ecosystem/integration.test.ts` → PASS; `pnpm tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add components/StickyNav.tsx components/Footer.tsx app/sitemap.ts middleware.ts tests/ecosystem/integration.test.ts
git commit -m "feat(ecosystem): nav/footer links, sitemap entries, ZH locale middleware"
```

---

### Task 8: Seed data + seed script

**Files:**
- Create: `scripts/data/ecosystem-seed.json`
- Create: `scripts/seed-ecosystem.cjs`
- Test: `tests/ecosystem/seed-data.test.ts`

**Interfaces:**
- Consumes: constants (Task 1) for validation in the test; `@prisma/client` directly in the script (NOT the app's `lib/prisma`, so the script runs in-pod with plain `node`).
- Produces: idempotent seeder — `node scripts/seed-ecosystem.cjs [--dry-run] [--file <path>]`, upsert by `slug`. **Upsert must NOT overwrite team edits**: on update it only refreshes `descriptionZh` when currently empty, and never touches `published`, `featured`, `sortOrder`, `logoUrl` on existing rows; full data only on create.

- [ ] **Step 1: Write the seed JSON**

`scripts/data/ecosystem-seed.json` — 20 entries, EXACT content (from 2026-07-04 verified research; do not invent or embellish):

```json
[
  { "slug": "subfrost", "name": "SUBFROST", "category": "DeFi", "status": "Live", "url": "https://subfrost.io", "xUrl": "https://x.com/SUBFROSTio", "docsUrl": "https://docs.subfrost.io", "descriptionEn": "Wrap BTC into frBTC — 1:1, minted and redeemed by a FROST/ROAST threshold-signed multisig — and put it to work in AMM pools and yield vaults without leaving Bitcoin L1.", "descriptionZh": "将 BTC 包装为 frBTC——由 FROST/ROAST 门限签名多签 1:1 铸造与赎回——并在不离开比特币主链的情况下投入 AMM 资金池和收益金库。", "featured": true, "sortOrder": 0, "published": true },
  { "slug": "oyl-wallet", "name": "Oyl Wallet", "category": "Wallet", "status": "Live", "url": "https://oyl.io", "xUrl": "https://x.com/oylwallet", "docsUrl": "https://docs.oyl.io/getting-started/welcome", "descriptionEn": "Non-custodial Bitcoin wallet from the team behind Alkanes: Ordinals, Runes, BRC-20 and Alkanes, plus an SDK for builders.", "descriptionZh": "由 Alkanes 开发团队打造的非托管比特币钱包：支持 Ordinals、Runes、BRC-20 和 Alkanes，并为开发者提供 SDK。", "featured": true, "sortOrder": 1, "published": true },
  { "slug": "fairmints", "name": "Fairmints", "category": "Launchpad", "status": "Live", "url": "https://fairmints.io", "xUrl": "https://x.com/fairmints", "docsUrl": null, "descriptionEn": "Bitcoin minting made easy — create, mint and trade tokens and NFT orbitals on Alkanes, with its own explorer built in.", "descriptionZh": "让比特币铸造变得简单——在 Alkanes 上创建、铸造和交易代币与 NFT orbitals，并内置专属浏览器。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "arbuzino", "name": "Arbuzino", "category": "Other", "status": "Live", "url": "https://arbuzino.com", "xUrl": null, "docsUrl": null, "descriptionEn": "Magic Arbuz — the community project around the ARBUZ token on Alkanes, with vaults and on-chain experiments on Bitcoin.", "descriptionZh": "Magic Arbuz——围绕 Alkanes 上 ARBUZ 代币的社区项目，包含金库和比特币链上实验。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "unisat", "name": "UniSat", "category": "Wallet", "status": "Live", "url": "https://unisat.io", "xUrl": "https://x.com/unisat_wallet", "docsUrl": "https://docs.unisat.io", "descriptionEn": "The widely-used Bitcoin browser wallet with native Ordinals, Runes and Alkanes support — explorer and marketplace included.", "descriptionZh": "广泛使用的比特币浏览器钱包，原生支持 Ordinals、Runes 和 Alkanes，并附带浏览器与交易市场。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "bound", "name": "Bound", "category": "DeFi", "status": "Live", "url": "https://bound.exchange", "xUrl": "https://x.com/Bound_Exchange", "docsUrl": "https://docs.bound.exchange/bound-docs", "descriptionEn": "Self-custodial BTC-backed loans with no liquidations, swaps and spot trading — home of the bUSD stablecoin.", "descriptionZh": "自托管的 BTC 抵押贷款，无清算风险，支持交换与现货交易——bUSD 稳定币的所在地。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "sats-terminal", "name": "Sats Terminal", "category": "DeFi", "status": "Live", "url": "https://www.satsterminal.com", "xUrl": "https://x.com/SatsTerminal", "docsUrl": "https://docs.satsterminal.com/trade", "descriptionEn": "Swap aggregator routing Runes and Alkanes trades across DEXs for best execution, plus a BTC-backed loan marketplace.", "descriptionZh": "交换聚合器，在多个 DEX 之间为 Runes 和 Alkanes 交易寻找最优执行，另提供 BTC 抵押贷款市场。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "oyl-amm", "name": "Oyl AMM", "category": "DeFi", "status": "Building", "url": "https://oyl.io", "xUrl": "https://x.com/oylwallet", "docsUrl": null, "descriptionEn": "Bitcoin-native automated market maker for permissionless Alkanes swaps and liquidity, settled on L1 — in development by Oyl Corp.", "descriptionZh": "比特币原生自动做市商，用于无许可的 Alkanes 交换和流动性，直接在主链结算——由 Oyl Corp 开发中。", "featured": false, "sortOrder": 20, "published": true },
  { "slug": "ordiscan", "name": "Ordiscan", "category": "Tooling", "status": "Live", "url": "https://ordiscan.com/alkanes", "xUrl": "https://x.com/ordiscan_com", "docsUrl": "https://ordiscan.com/docs/api", "descriptionEn": "Ordinals & Runes explorer with a dedicated Alkanes section — tokens, addresses, mint activity and a developer API.", "descriptionZh": "Ordinals 与 Runes 浏览器，设有专门的 Alkanes 板块——代币、地址、铸造活动和开发者 API。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "sandshrew", "name": "Sandshrew", "category": "Tooling", "status": "Live", "url": "https://sandshrew.io", "xUrl": "https://twitter.com/SandshrewRPC", "docsUrl": "https://docs.sandshrew.io", "descriptionEn": "Hosted Bitcoin RPC that unifies Core, Esplora and Alkanes indexing behind one API. Build without running a node.", "descriptionZh": "托管的比特币 RPC 服务，将 Core、Esplora 和 Alkanes 索引统一到单一 API 中。无需自建节点即可开发。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "metashrew", "name": "Metashrew", "category": "Tooling", "status": "Live", "url": "https://github.com/sandshrewmetaprotocols/metashrew", "xUrl": null, "docsUrl": "https://github.com/sandshrewmetaprotocols/metashrew/blob/master/SPECIFICATION.md", "descriptionEn": "Open-source WASM indexing framework Alkanes itself runs on — deterministic state, rollbacks, developer infrastructure.", "descriptionZh": "Alkanes 本身运行于其上的开源 WASM 索引框架——确定性状态、回滚能力，开发者基础设施。", "featured": false, "sortOrder": 30, "published": true },
  { "slug": "lasereyes", "name": "LaserEyes", "category": "Tooling", "status": "Live", "url": "https://www.lasereyes.build", "xUrl": null, "docsUrl": "https://www.lasereyes.build/docs/wallets", "descriptionEn": "Wallet-connect library giving Bitcoin dApps one interface to UniSat, Xverse, OYL, Leather and more — Ordinals, Runes and Alkanes ready.", "descriptionZh": "钱包连接库，为比特币 dApp 提供连接 UniSat、Xverse、OYL、Leather 等钱包的统一接口——支持 Ordinals、Runes 和 Alkanes。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "rebar-labs", "name": "Rebar Labs", "category": "Tooling", "status": "Live", "url": "https://rebarlabs.io", "xUrl": "https://x.com/RebarLabs", "docsUrl": "https://rebarlabs.io/writings/rebar-data-and-api", "descriptionEn": "MEV-aware Bitcoin infrastructure and a unified data API across transactions, Ordinals, Runes and Alkanes.", "descriptionZh": "具备 MEV 感知能力的比特币基础设施，提供覆盖交易、Ordinals、Runes 和 Alkanes 的统一数据 API。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "alkanes-build", "name": "alkanes.build", "category": "Tooling", "status": "Live", "url": "https://alkanes.build", "xUrl": null, "docsUrl": "https://alkanes.build/docs", "descriptionEn": "Official developer docs and portal for the Alkanes protocol — quickstarts, SDK reference, case studies.", "descriptionZh": "Alkanes 协议的官方开发者文档与门户——快速入门、SDK 参考和案例研究。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "mintalkanes", "name": "MintAlkanes", "category": "Launchpad", "status": "Live", "url": "https://mintalkanes.com", "xUrl": "https://x.com/mintalkanes", "docsUrl": null, "descriptionEn": "The easiest way to mint programmable Alkanes tokens — connect a wallet and launch straight from the site.", "descriptionZh": "铸造可编程 Alkanes 代币最简单的方式——连接钱包，直接在网站上发行。", "featured": false, "sortOrder": 10, "published": true },
  { "slug": "pizza-fun", "name": "Pizza.fun", "category": "Launchpad", "status": "Building", "url": "https://pizza.fun", "xUrl": "https://x.com/pizzadotfunbtc", "docsUrl": null, "descriptionEn": "Token-launch platform for Bitcoin, currently in pre-launch.", "descriptionZh": "比特币代币发行平台，目前处于预发布阶段。", "featured": false, "sortOrder": 20, "published": true },
  { "slug": "idclub", "name": "iDclub", "category": "NFT", "status": "Beta", "url": "https://www.idclub.io", "xUrl": "https://x.com/idclub_ord", "docsUrl": null, "descriptionEn": "Ordinals & Alkanes NFT marketplace and launchpad — home to collections like Alkane Pandas.", "descriptionZh": "Ordinals 与 Alkanes NFT 市场和发行平台——Alkane Pandas 等收藏系列的所在地。", "featured": false, "sortOrder": 20, "published": true },
  { "slug": "alkane-pandas", "name": "Alkane Pandas", "category": "NFT", "status": "Live", "url": "https://x.com/AlkanePandas", "xUrl": "https://x.com/AlkanePandas", "docsUrl": null, "descriptionEn": "Bitcoin NFT collection deployed on Alkanes, with holder swaps into the companion $BAMBOO token.", "descriptionZh": "部署在 Alkanes 上的比特币 NFT 收藏系列，持有者可兑换配套的 $BAMBOO 代币。", "featured": false, "sortOrder": 20, "published": true },
  { "slug": "alkamist", "name": "ALKAMIST", "category": "Gaming", "status": "Building", "url": "https://mint.lasereyes.build/alkamon/alkacenter", "xUrl": null, "docsUrl": null, "descriptionEn": "Train, trade & battle — Alkamon, an early creature game taking shape on Alkanes.", "descriptionZh": "训练、交易与对战——Alkamon，一款正在 Alkanes 上成形的早期宠物对战游戏。", "featured": false, "sortOrder": 30, "published": true },
  { "slug": "alkanescan", "name": "AlkaneScan", "category": "Tooling", "status": "Live", "url": "https://alkanescan.org", "xUrl": null, "docsUrl": null, "descriptionEn": "Market-data tracker for Alkanes tokens — live prices, market cap, volume and holder counts.", "descriptionZh": "Alkanes 代币市场数据追踪器——实时价格、市值、交易量和持有人数量。", "featured": false, "sortOrder": 40, "published": false }
]
```

(Note: `alkanescan` ships `published: false` — low-confidence research, no verified team footprint; the team flips it on in the admin after checking. Everything else was verified 2026-07-04.)

- [ ] **Step 2: Write the failing data-quality test**

```typescript
// tests/ecosystem/seed-data.test.ts
import { describe, it, expect } from "vitest"
import seed from "../../scripts/data/ecosystem-seed.json"
import { isValidCategory, isValidStatus, isValidHttpUrl, isValidOptionalHttpUrl } from "@/lib/ecosystem/constants"

describe("ecosystem seed data", () => {
  it("has 20 entries with unique slugs", () => {
    expect(seed.length).toBe(20)
    expect(new Set(seed.map((p) => p.slug)).size).toBe(20)
  })

  it("every entry is valid", () => {
    for (const p of seed) {
      expect(p.slug, p.slug).toMatch(/^[a-z0-9-]+$/)
      expect(p.name.trim().length, p.slug).toBeGreaterThan(0)
      expect(isValidCategory(p.category), `${p.slug} category`).toBe(true)
      expect(isValidStatus(p.status), `${p.slug} status`).toBe(true)
      expect(isValidHttpUrl(p.url), `${p.slug} url`).toBe(true)
      expect(isValidOptionalHttpUrl(p.xUrl), `${p.slug} xUrl`).toBe(true)
      expect(isValidOptionalHttpUrl(p.docsUrl), `${p.slug} docsUrl`).toBe(true)
      expect(p.descriptionEn.length, `${p.slug} en`).toBeGreaterThan(20)
      expect(p.descriptionZh.length, `${p.slug} zh`).toBeGreaterThan(5)
    }
  })

  it("features exactly SUBFROST and Oyl Wallet", () => {
    expect(seed.filter((p) => p.featured).map((p) => p.slug).sort()).toEqual(["oyl-wallet", "subfrost"])
  })
})
```

If `tsconfig` lacks `resolveJsonModule`, import via `createRequire` instead:
`const seed = createRequire(import.meta.url)("../../scripts/data/ecosystem-seed.json")`.

- [ ] **Step 3: Run test** — `pnpm vitest run tests/ecosystem/seed-data.test.ts` → PASS once JSON exists (this test is mostly a data gate; it may pass immediately — that's fine, it exists to protect future edits).

- [ ] **Step 4: Write the seeder**

```javascript
// scripts/seed-ecosystem.cjs
/**
 * Seeds/updates the ecosystem directory. Idempotent upsert by slug.
 * SAFE re-runs: existing rows only get descriptionZh backfilled when empty;
 * published/featured/sortOrder/logoUrl and team-edited text are never clobbered.
 *
 * Usage (local):  node scripts/seed-ecosystem.cjs --dry-run
 * Usage (in-pod): node /tmp/seed-ecosystem.cjs --file /tmp/ecosystem-seed.json
 */
const { PrismaClient } = require("@prisma/client")
const fs = require("node:fs")
const path = require("node:path")

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const fileIdx = args.indexOf("--file")
  const file = fileIdx >= 0 ? args[fileIdx + 1] : path.join(__dirname, "data", "ecosystem-seed.json")
  const seed = JSON.parse(fs.readFileSync(file, "utf8"))

  const prisma = new PrismaClient()
  let created = 0, updated = 0, skipped = 0
  try {
    for (const p of seed) {
      const existing = await prisma.ecosystemProject.findUnique({ where: { slug: p.slug } })
      if (!existing) {
        if (!dryRun) await prisma.ecosystemProject.create({ data: p })
        created++
        console.log(`+ create ${p.slug}`)
      } else if (!existing.descriptionZh && p.descriptionZh) {
        if (!dryRun) await prisma.ecosystemProject.update({ where: { slug: p.slug }, data: { descriptionZh: p.descriptionZh } })
        updated++
        console.log(`~ backfill zh ${p.slug}`)
      } else {
        skipped++
      }
    }
    console.log(`${dryRun ? "[dry-run] " : ""}done: ${created} created, ${updated} zh-backfilled, ${skipped} untouched`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 5: Dry-run against local schema** (no local DB needed — just verify the script parses and fails gracefully without DATABASE_URL):

Run: `node scripts/seed-ecosystem.cjs --dry-run`
Expected: either a dry-run report (if a local DB is configured) or a clean Prisma connection error — NOT a syntax/JSON error.

- [ ] **Step 6: Commit**

```bash
git add scripts/data/ecosystem-seed.json scripts/seed-ecosystem.cjs tests/ecosystem/seed-data.test.ts
git commit -m "feat(ecosystem): seed data (20 verified projects) + idempotent seeder"
```

---

### Task 9: Full gates + PR

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `CI=true pnpm vitest run`
Expected: only the pre-existing allow-listed failures (admin-nav/admin-landing group, 4 files) — every `tests/ecosystem/*` file green. If ANY other file regressed, fix before proceeding.

- [ ] **Step 2: Type + build gates**

Run: `pnpm prisma generate && pnpm tsc --noEmit` → clean.
Run: `pnpm next build` → "Compiled successfully" (Windows EPERM at standalone step is expected noise).

- [ ] **Step 3: Push + PR**

```bash
TOKEN=$(gh auth token)
git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/ecosystem-portal
gh pr create --head feat/ecosystem-portal --title "feat: Alkanes ecosystem portal (/ecosystem + admin CRUD)" --body "<summary per house style, link spec, screenshots>"
```

- [ ] **Step 4: Ops checklist (NOT for subagents — session owner runs after merge)**

1. Merge after CI green.
2. Deploy: bump `newTag` (QUOTED, full-SHA) in `k8s/kustomization.yaml` on main; Flux annotate source THEN kustomization (`bash .ioenv-extracted/kubectl-io.sh`); `rollout status`; confirm pod image. Schema applies via the init `prisma db push` (fully additive here).
3. Seed in-pod: copy `scripts/seed-ecosystem.cjs` + `scripts/data/ecosystem-seed.json` into the pod via the base64+heredoc pattern, run `node /tmp/seed-ecosystem.cjs --file /tmp/ecosystem-seed.json`.
4. Verify prod: `/ecosystem` EN + `?lang=zh`, chips filter, featured band, `/admin/ecosystem` CRUD + toggle + translate + logo upload.
5. Check ADMIN users see the new nav item (role ADMIN should hold all privileges; if the IAM data migration snapshots privilege lists per user, grant `ecosystem.edit` to the four ADMIN accounts + relevant STAFF via the admin IAM screen).
6. Ping Vitor/Gabe to review seeded copy in the admin the same day (page is nav-linked from deploy).

---

## Self-review notes (done at plan time)

- Spec coverage: schema/settings (T1), IAM+nav (T2), actions incl. toggle+translate (T3), public data+fallback (T4), page direção C (T5), admin CRUD+upload+toggle (T6), nav/footer/sitemap/middleware (T7), seed 20 projetos (T8), gates/PR/ops (T9). CTA "Get listed" → in T5 page. Featured band toggle → T3/T4/T5/T6.
- Type consistency: `EcosystemProjectInput` (T3) matches admin form fields (T6); `PublicEcosystemProject` (T4) matches `EcosystemDirectory` props (T5); `DirectoryCopy` defined once in T5 component and typed in test.
- Known checks delegated to implementers (flagged in-task, not placeholders): exact `expand()` export name (T2), `Locale` typing convention in translate calls (T3), upload-route `kind` whitelist (T6), Tailwind fractional spacing classes (T5).
