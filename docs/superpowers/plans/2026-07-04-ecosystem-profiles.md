# Ecosystem Project Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DefiLlama-style internal profile pages at `/ecosystem/<slug>` — card clicks go inside, external links live on the profile; markdown EN/ZH body + relational contract rows, editable in /admin.

**Architecture:** Additive Prisma schema (`profileEn/profileZh` on `EcosystemProject`, new `EcosystemProjectContract`), a new public mapper `getEcosystemProfile`, a presentational `EcosystemProfile` server component under the existing `EditorialShell`, card stretched-link flipped to an internal `next/link`, and the existing server action + admin form extended (raw markdown textareas with preview, contracts repeater). Profile content for Arbuzino ships as an in-image seeder that only updates EXISTING projects.

**Tech Stack:** Next 16 (App Router, async params), Prisma/Postgres, react-markdown+gfm+rehype-sanitize+highlight via `lib/cms/markdown.tsx`, vitest + @testing-library/react, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-04-ecosystem-profiles-design.md`

## Global Constraints

- Branch `feat/ecosystem-profiles`, worktree novo; **PR sempre, nunca push na main** (exceto bump `deploy(io):`).
- `git add` NOMINAL (arquivo por arquivo, nunca `-A`).
- Schema **aditivo apenas** — todos os campos novos com `@default`; `prisma db push` sem `--accept-data-loss`.
- **NUNCA rodar `scripts/seed-ecosystem.cjs` / `ecosystem-seed.json`** (re-criaria os 10 apps deletados na curadoria). O seeder novo deste plano NUNCA cria projetos.
- Soft-launch continua: `/ecosystem/*` fora do nav e do sitemap (`tests/ecosystem/integration.test.ts` trava isso — não inverter).
- Tema duplo: cores SEMPRE via tokens `--ed-*` nas páginas públicas; admin usa as classes zinc existentes.
- jsdom NÃO bumpar pra ≥27; não mexer em deps.
- Locale público = `searchParams.lang` (`?lang=zh`), middleware injeta a partir do cookie — mesmo padrão de `app/ecosystem/page.tsx`.
- Explorer: linhas de contrato → `https://espo.sh/alkane/<block:tx>`; badge principal → ordiscan (padrão atual do card).
- Windows: `next build` com "Compiled successfully" = ok (EINVAL no standalone é ruído local).
- Testes: `npx vitest run tests/ecosystem/` (57 existentes continuam verdes) + `npx tsc --noEmit` (exige `pnpm prisma generate` fresco).

## Setup (orquestrador, antes da Task 1)

```bash
cd "C:\Alkanes Geral Dev\subfrost.io"
git worktree add ../wt-ecosystem-profiles -b feat/ecosystem-profiles main
cd ../wt-ecosystem-profiles
cmd //c mklink //J node_modules "C:\Alkanes Geral Dev\subfrost.io\node_modules"   # junction (gotcha worktree fresco)
pnpm prisma generate
# copiar spec+plano pro worktree (escritos no checkout main, untracked):
cp "C:\Alkanes Geral Dev\subfrost.io\docs\superpowers\specs\2026-07-04-ecosystem-profiles-design.md" docs/superpowers/specs/
cp "C:\Alkanes Geral Dev\subfrost.io\docs\superpowers\plans\2026-07-04-ecosystem-profiles.md" docs/superpowers/plans/
```

⚠️ Junction compartilha `node_modules` com o checkout main — o `prisma generate` da Task 1 muda o client gerado para AMBOS até o merge. Não rodar gates no checkout main em paralelo.

---

### Task 1: Schema + validador + mapper `getEcosystemProfile`

**Files:**
- Modify: `prisma/schema.prisma` (model `EcosystemProject` ~linha 1792)
- Modify: `lib/ecosystem/constants.ts`
- Modify: `lib/ecosystem/public.ts`
- Test: `tests/ecosystem/profile-public.test.ts` (novo)
- Commit também: `docs/superpowers/specs/2026-07-04-ecosystem-profiles-design.md`, `docs/superpowers/plans/2026-07-04-ecosystem-profiles.md`

**Interfaces:**
- Produces (Tasks 2/4/5 dependem):
  - Prisma: `EcosystemProject.profileEn/profileZh: string`, relação `contracts: EcosystemProjectContract[]`; model `EcosystemProjectContract { id, projectId, label, alkaneId, noteEn, noteZh, sortOrder }`.
  - `isValidAlkaneId(v: string): boolean` em `lib/ecosystem/constants.ts`.
  - `getEcosystemProfile(slug: string, locale: "en" | "zh"): Promise<PublicEcosystemProfile | null>` em `lib/ecosystem/public.ts`, com:
    ```ts
    export interface PublicEcosystemContract { label: string; alkaneId: string; note: string }
    export interface PublicEcosystemProfile extends PublicEcosystemProject {
      profile: string                      // markdown resolvido por locale (zh → fallback en)
      contracts: PublicEcosystemContract[] // ordenados por sortOrder
    }
    ```

- [ ] **Step 1: Schema — adicionar campos e model**

Em `prisma/schema.prisma`, dentro de `model EcosystemProject` (antes de `createdAt`), adicionar:

```prisma
  profileEn     String   @default("")
  profileZh     String   @default("")
  contracts     EcosystemProjectContract[]
```

Logo após o fechamento de `EcosystemProject` (antes de `EcosystemSettings`), adicionar:

```prisma
model EcosystemProjectContract {
  id        String           @id @default(cuid())
  projectId String
  project   EcosystemProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  label     String
  alkaneId  String
  noteEn    String           @default("")
  noteZh    String           @default("")
  sortOrder Int              @default(0)

  @@index([projectId, sortOrder])
}
```

- [ ] **Step 2: `pnpm prisma generate`** — Expected: "Generated Prisma Client".

- [ ] **Step 3: Validador em `lib/ecosystem/constants.ts`**

Adicionar ao final, e refatorar o optional pra delegar:

```ts
/** Alkane id in canonical `block:tx` form (e.g. "2:0"). */
export function isValidAlkaneId(v: string): boolean {
  return /^\d+:\d+$/.test(v)
}
```

E trocar o corpo de `isValidOptionalAlkaneId` para:

```ts
  if (v == null || v === "") return true
  return isValidAlkaneId(v)
```

- [ ] **Step 4: Teste que falha — `tests/ecosystem/profile-public.test.ts`**

```ts
// tests/ecosystem/profile-public.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { ecosystemProject: { findFirst: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import { getEcosystemProfile } from "@/lib/ecosystem/public"

const row = (over: Record<string, unknown>) => ({
  slug: "arbuzino", name: "Arbuzino", logoUrl: null, category: "Gaming", status: "Live",
  kind: "App", alkaneId: "2:25349", url: "https://arbuzino.com", xUrl: null, docsUrl: null,
  descriptionEn: "english", descriptionZh: "中文",
  profileEn: "# Profile EN", profileZh: "",
  featured: false, sortOrder: 0, published: true,
  contracts: [
    { id: "c2", label: "Fireball", alkaneId: "4:257", noteEn: "lottery", noteZh: "彩票", sortOrder: 1 },
    { id: "c1", label: "ARBUZ", alkaneId: "2:25349", noteEn: "token", noteZh: "", sortOrder: 0 },
  ],
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("getEcosystemProfile", () => {
  it("queries published by slug including ordered contracts", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(row({}) as never)
    await getEcosystemProfile("arbuzino", "en")
    expect(prisma.ecosystemProject.findFirst).toHaveBeenCalledWith({
      where: { slug: "arbuzino", published: true },
      include: { contracts: { orderBy: { sortOrder: "asc" } } },
    })
  })

  it("returns null when not found", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    expect(await getEcosystemProfile("nope", "en")).toBeNull()
  })

  it("resolves profile + notes per locale with EN fallback", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValue(row({}) as never)
    const en = await getEcosystemProfile("arbuzino", "en")
    expect(en?.profile).toBe("# Profile EN")
    expect(en?.contracts.map((c) => c.note)).toEqual(["lottery", "token"]) // preserva a ordem vinda do Prisma
    const zh = await getEcosystemProfile("arbuzino", "zh")
    expect(zh?.profile).toBe("# Profile EN") // profileZh empty → EN fallback
    expect(zh?.description).toBe("中文")
    const fireball = zh?.contracts.find((c) => c.alkaneId === "4:257")
    const arbuz = zh?.contracts.find((c) => c.alkaneId === "2:25349")
    expect(fireball?.note).toBe("彩票")
    expect(arbuz?.note).toBe("token") // noteZh empty → EN fallback
  })

  it("maps contracts verbatim (label + alkaneId)", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(row({}) as never)
    const p = await getEcosystemProfile("arbuzino", "en")
    expect(p?.contracts.map((c) => c.label)).toContain("Fireball")
    expect(p?.contracts.map((c) => c.alkaneId)).toContain("4:257")
  })
})
```

(Nota: a asserção de ordem vem do `orderBy` no include — o mapper preserva a ordem do Prisma; não reordenar em JS.)

- [ ] **Step 5: Rodar — deve FALHAR** — `npx vitest run tests/ecosystem/profile-public.test.ts` → "getEcosystemProfile is not a function".

- [ ] **Step 6: Implementar em `lib/ecosystem/public.ts`** (append):

```ts
export interface PublicEcosystemContract {
  label: string
  alkaneId: string
  note: string
}

export interface PublicEcosystemProfile extends PublicEcosystemProject {
  profile: string
  contracts: PublicEcosystemContract[]
}

export async function getEcosystemProfile(
  slug: string,
  locale: "en" | "zh"
): Promise<PublicEcosystemProfile | null> {
  const r = await prisma.ecosystemProject.findFirst({
    where: { slug, published: true },
    include: { contracts: { orderBy: { sortOrder: "asc" } } },
  })
  if (!r) return null
  return {
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    category: r.category,
    status: r.status,
    kind: r.kind,
    alkaneId: r.alkaneId,
    url: r.url,
    xUrl: r.xUrl,
    docsUrl: r.docsUrl,
    description: locale === "zh" && r.descriptionZh ? r.descriptionZh : r.descriptionEn,
    featured: r.featured,
    profile: locale === "zh" && r.profileZh ? r.profileZh : r.profileEn,
    contracts: r.contracts.map((c) => ({
      label: c.label,
      alkaneId: c.alkaneId,
      note: locale === "zh" && c.noteZh ? c.noteZh : c.noteEn,
    })),
  }
}
```

- [ ] **Step 7: Verde + regressão** — `npx vitest run tests/ecosystem/` → tudo PASS; `npx tsc --noEmit` limpo.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/ecosystem/constants.ts lib/ecosystem/public.ts tests/ecosystem/profile-public.test.ts docs/superpowers/specs/2026-07-04-ecosystem-profiles-design.md docs/superpowers/plans/2026-07-04-ecosystem-profiles.md
git commit -m "feat(ecosystem): profile fields, contract rows and profile mapper"
```

---

### Task 2: Visuals compartilhados + componente `EcosystemProfile` + rota `/ecosystem/[slug]`

**Files:**
- Create: `components/ecosystem/visuals.tsx`
- Create: `components/ecosystem/EcosystemProfile.tsx`
- Create: `app/ecosystem/[slug]/page.tsx`
- Modify: `components/ecosystem/EcosystemDirectory.tsx` (importar visuals; deletar cópias locais)
- Test: `tests/ecosystem/profile-page.test.tsx` (novo)

**Interfaces:**
- Consumes: `getEcosystemProfile`, `PublicEcosystemProfile` (Task 1); `Markdown` de `@/lib/cms/markdown`; `EditorialShell` de `@/components/articles/EditorialShell`; `absoluteUrl` de `@/lib/seo`.
- Produces: `components/ecosystem/visuals.tsx` exporta `Mark({ p, size })` (aceita `Pick<PublicEcosystemProject, "slug" | "name" | "logoUrl">`), `StatusBadge({ status, label })`, `STATUS_COLOR`, `gradFor(slug)`, `initials(name)`. `EcosystemProfile({ p, copy, backHref })` com `ProfileCopy { back, website, docs, contractsTitle, contractCol, idCol, notesCol, statuses }`.

- [ ] **Step 1: Extrair visuals**

Criar `components/ecosystem/visuals.tsx` movendo VERBATIM de `EcosystemDirectory.tsx`: `STATUS_COLOR`, `GRADS`, `gradFor`, `initials`, `Mark`, `StatusBadge` — sem `"use client"` (módulo puro, servível dos dois lados). Única mudança: o tipo do prop de `Mark` vira `Pick<PublicEcosystemProject, "slug" | "name" | "logoUrl">`, e exportar tudo. Em `EcosystemDirectory.tsx`, remover as cópias locais e importar `{ Mark, StatusBadge }` de `./visuals`.

- [ ] **Step 2: Teste que falha — `tests/ecosystem/profile-page.test.tsx`**

```tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { EcosystemProfile, type ProfileCopy } from "@/components/ecosystem/EcosystemProfile"
import type { PublicEcosystemProfile } from "@/lib/ecosystem/public"

const copy: ProfileCopy = {
  back: "← Ecosystem", website: "Website", docs: "Docs",
  contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
}

const profile = (over: Partial<PublicEcosystemProfile>): PublicEcosystemProfile => ({
  slug: "arbuzino", name: "Arbuzino", logoUrl: null, category: "Gaming", status: "Live",
  kind: "App", alkaneId: "2:25349", url: "https://arbuzino.com", xUrl: "https://x.com/arbuzino",
  docsUrl: null, description: "Casino-themed on-chain games.", featured: false,
  profile: "## Products\n\nFully on-chain lottery paid in **DIESEL**.",
  // ids distintos do alkaneId principal (2:25349) — evita getByRole ambíguo
  contracts: [
    { label: "Fireball game", alkaneId: "4:257", note: "The lottery singleton" },
    { label: "Fee vault", alkaneId: "4:777", note: "Staker yield vault" },
  ],
  ...over,
})

describe("EcosystemProfile", () => {
  it("renders header, markdown body and back link", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("heading", { level: 1, name: "Arbuzino" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "← Ecosystem" })).toHaveAttribute("href", "/ecosystem")
    expect(screen.getByRole("heading", { level: 2, name: "Products" })).toBeInTheDocument() // markdown rendered
    expect(screen.getByText("DIESEL")).toBeInTheDocument()
  })

  it("external links: website, X, main alkane badge to ordiscan", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "https://arbuzino.com")
    expect(screen.getByRole("link", { name: "2:25349 ↗" })).toHaveAttribute(
      "href", "https://ordiscan.com/alkane/Arbuzino/2:25349")
  })

  it("renders contracts table with espo.sh links", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("heading", { name: "Contracts" })).toBeInTheDocument()
    expect(screen.getByText("Fireball game")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "4:257 ↗" })).toHaveAttribute("href", "https://espo.sh/alkane/4:257")
  })

  it("omits body and contracts sections when empty", () => {
    render(<EcosystemProfile p={profile({ profile: "", contracts: [] })} copy={copy} backHref="/ecosystem" />)
    expect(screen.queryByRole("heading", { name: "Contracts" })).toBeNull()
  })
})
```

- [ ] **Step 3: Rodar — deve FALHAR** (módulo inexistente).

- [ ] **Step 4: Implementar `components/ecosystem/EcosystemProfile.tsx`**

```tsx
import Link from "next/link"
import { Markdown } from "@/lib/cms/markdown"
import { Mark, StatusBadge } from "@/components/ecosystem/visuals"
import type { PublicEcosystemProfile } from "@/lib/ecosystem/public"

export interface ProfileCopy {
  back: string
  website: string
  docs: string
  contractsTitle: string
  contractCol: string
  idCol: string
  notesCol: string
  statuses: Record<string, string>
}

const btnCls =
  "inline-flex items-center gap-1 rounded-[7px] border border-[color:var(--ed-hair)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)] hover:bg-[color:var(--ed-surface)]"

export function EcosystemProfile({ p, copy, backHref }: {
  p: PublicEcosystemProfile
  copy: ProfileCopy
  backHref: string
}) {
  return (
    <article>
      <Link href={backHref} className="font-mono text-[12px] text-[color:var(--ed-muted)] transition-colors hover:text-[color:var(--ed-accent)]">
        {copy.back}
      </Link>

      <header className="mt-6 flex flex-wrap items-start gap-5">
        <Mark p={p} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(26px,4vw,38px)] font-normal leading-[1.05] tracking-[-0.02em] text-[color:var(--ed-ink)]">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">{p.category}</span>
            <StatusBadge status={p.status} label={copy.statuses[p.status] ?? p.status} />
            {p.alkaneId ? (
              <a
                href={`https://ordiscan.com/alkane/${encodeURIComponent(p.name)}/${p.alkaneId}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 py-0.5 font-mono text-[11px] text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)]"
              >
                {p.alkaneId} ↗
              </a>
            ) : null}
          </div>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ed-body)]">{p.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className={btnCls}>{copy.website} ↗</a>
            {p.xUrl ? <a href={p.xUrl} target="_blank" rel="noopener noreferrer" className={btnCls}>𝕏</a> : null}
            {p.docsUrl ? <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className={btnCls}>{copy.docs}</a> : null}
          </div>
        </div>
      </header>

      {p.profile ? (
        <div className="mt-10 border-t border-[color:var(--ed-hair)] pt-8">
          <Markdown variant="article">{p.profile}</Markdown>
        </div>
      ) : null}

      {p.contracts.length > 0 ? (
        <section className="mt-10 border-t border-[color:var(--ed-hair)] pt-8">
          <h2 className="text-[20px] font-medium tracking-[-0.012em] text-[color:var(--ed-ink)]">{copy.contractsTitle}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-[color:var(--ed-hair)] font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">
                  <th className="py-2 pr-4 font-medium">{copy.contractCol}</th>
                  <th className="py-2 pr-4 font-medium">{copy.idCol}</th>
                  <th className="py-2 font-medium">{copy.notesCol}</th>
                </tr>
              </thead>
              <tbody>
                {p.contracts.map((c) => (
                  <tr key={`${c.alkaneId}-${c.label}`} className="border-b border-[color:var(--ed-hair)] align-top">
                    <td className="py-2.5 pr-4 text-[color:var(--ed-ink)]">{c.label}</td>
                    <td className="py-2.5 pr-4">
                      <a
                        href={`https://espo.sh/alkane/${c.alkaneId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[12.5px] text-[color:var(--ed-accent)] hover:underline"
                      >
                        {c.alkaneId} ↗
                      </a>
                    </td>
                    <td className="py-2.5 text-[color:var(--ed-body)]">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </article>
  )
}
```

- [ ] **Step 5: Implementar `app/ecosystem/[slug]/page.tsx`**

```tsx
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { EcosystemProfile, type ProfileCopy } from "@/components/ecosystem/EcosystemProfile"
import { getEcosystemProfile } from "@/lib/ecosystem/public"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy: Record<Locale, ProfileCopy> = {
  en: {
    back: "← Ecosystem", website: "Website", docs: "Docs",
    contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
    statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
  },
  zh: {
    back: "← 生态系统", website: "官网", docs: "文档",
    contractsTitle: "合约", contractCol: "合约", idCol: "Alkane ID", notesCol: "说明",
    statuses: { Live: "已上线", Beta: "测试版", Building: "构建中" },
  },
}

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ lang?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const sp = searchParams ? await searchParams : {}
  const locale: Locale = sp.lang === "zh" ? "zh" : "en"
  const p = await getEcosystemProfile(slug, locale)
  if (!p) return { title: "Ecosystem" }
  return {
    title: `${p.name} — Alkanes ecosystem`,
    description: p.description,
    alternates: {
      canonical: absoluteUrl(`/ecosystem/${p.slug}`),
      languages: {
        en: absoluteUrl(`/ecosystem/${p.slug}`),
        zh: absoluteUrl(`/ecosystem/${p.slug}?lang=zh`),
        "x-default": absoluteUrl(`/ecosystem/${p.slug}`),
      },
    },
  }
}

export default async function EcosystemProjectPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = searchParams ? await searchParams : {}
  const locale: Locale = sp.lang === "zh" ? "zh" : "en"
  const p = await getEcosystemProfile(slug, locale)
  if (!p) notFound()
  const backHref = locale === "zh" ? "/ecosystem?lang=zh" : "/ecosystem"
  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[880px] px-6 pb-24 pt-10 sm:px-10">
        <EcosystemProfile p={p} copy={copy[locale]} backHref={backHref} />
      </main>
    </EditorialShell>
  )
}
```

- [ ] **Step 6: Verde + regressão** — `npx vitest run tests/ecosystem/` (novos + directory antigos PASS); `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add components/ecosystem/visuals.tsx components/ecosystem/EcosystemProfile.tsx 'app/ecosystem/[slug]/page.tsx' components/ecosystem/EcosystemDirectory.tsx tests/ecosystem/profile-page.test.tsx
git commit -m "feat(ecosystem): profile page at /ecosystem/[slug]"
```

---

### Task 3: Card do diretório navega pra dentro

**Files:**
- Modify: `components/ecosystem/EcosystemDirectory.tsx` (2 overlays: featured + grid)
- Test: `tests/ecosystem/directory.test.tsx` (estender)

**Interfaces:**
- Consumes: rota `/ecosystem/[slug]` (Task 2).
- Produces: overlay = `<Link href={"/ecosystem/" + p.slug} aria-label={p.name}>`; LinksRow e AlkaneBadge inalterados (externos, `z-10`).

- [ ] **Step 1: Teste que falha — adicionar em `tests/ecosystem/directory.test.tsx`:**

```tsx
describe("EcosystemDirectory — internal profile links", () => {
  it("card overlay links to the internal profile page", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    const overlay = screen.getByRole("link", { name: "Bound" })
    expect(overlay).toHaveAttribute("href", "/ecosystem/bound")
    expect(overlay).not.toHaveAttribute("target")
  })

  it("featured card overlay also links internally, Website button stays external", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    expect(screen.getByRole("link", { name: "SUBFROST" })).toHaveAttribute("href", "/ecosystem/subfrost")
    const websites = screen.getAllByRole("link", { name: /Website/ })
    for (const w of websites) expect(w).toHaveAttribute("target", "_blank")
  })
})
```

- [ ] **Step 2: Rodar — deve FALHAR** (overlay atual tem `aria-label` "Name — Website" e href externo).

- [ ] **Step 3: Implementar** — em `EcosystemDirectory.tsx`: `import Link from "next/link"`; substituir os DOIS overlays

De (featured; análogo no grid com `rounded-[11px]`):
```tsx
<a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} — ${copy.website}`} className="absolute inset-0 z-0 rounded-[14px]" />
```
Para:
```tsx
<Link href={`/ecosystem/${p.slug}`} aria-label={p.name} className="absolute inset-0 z-0 rounded-[14px]" />
```
Atualizar o comentário do overlay: o card agora navega pro profile interno; anchors externos (LinksRow/badge) seguem como siblings `z-10`.

- [ ] **Step 4: Verde** — `npx vitest run tests/ecosystem/directory.test.tsx` PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/EcosystemDirectory.tsx tests/ecosystem/directory.test.tsx
git commit -m "feat(ecosystem): directory cards navigate to internal profiles"
```

---

### Task 4: Server action + admin (textareas com preview, repeater de contratos)

**Files:**
- Modify: `actions/ecosystem/projects.ts`
- Modify: `app/admin/ecosystem/page.tsx`
- Modify: `components/cms/ecosystem/EcosystemAdmin.tsx`
- Test: `tests/ecosystem/actions.test.ts`, `tests/ecosystem/admin-form.test.tsx` (estender)

**Interfaces:**
- Consumes: schema/validador da Task 1 (`isValidAlkaneId`).
- Produces:
  ```ts
  export interface EcosystemContractInput { label: string; alkaneId: string; noteEn?: string; noteZh?: string }
  // EcosystemProjectInput ganha:
  profileEn?: string
  profileZh?: string
  contracts?: EcosystemContractInput[]   // ordem do array = sortOrder
  ```
  `AdminProject` ganha `profileEn: string; profileZh: string; contracts: AdminContract[]` com `AdminContract = { id?: string; label: string; alkaneId: string; noteEn: string; noteZh: string }`.

- [ ] **Step 1: Testes que falham — adicionar em `tests/ecosystem/actions.test.ts`:**

```ts
describe("saveEcosystemProject — profile & contracts", () => {
  it("rejects a contract row with empty label or bad alkaneId", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    expect((await saveEcosystemProject({ ...validInput, contracts: [{ label: " ", alkaneId: "2:0" }] } as never)).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, contracts: [{ label: "ARBUZ", alkaneId: "2-0" }] } as never)).ok).toBe(false)
    expect(prisma.ecosystemProject.create).not.toHaveBeenCalled()
  })

  it("creates with nested contracts, sortOrder from array index, trimmed", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject({
      ...validInput,
      profileEn: "  # Body  ",
      contracts: [
        { label: " Fireball ", alkaneId: " 4:257 ", noteEn: " lottery " },
        { label: "ARBUZ", alkaneId: "2:25349" },
      ],
    } as never)
    expect(res.ok).toBe(true)
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.profileEn).toBe("# Body")
    expect(data.contracts).toEqual({
      create: [
        { label: "Fireball", alkaneId: "4:257", noteEn: "lottery", noteZh: "", sortOrder: 0 },
        { label: "ARBUZ", alkaneId: "2:25349", noteEn: "", noteZh: "", sortOrder: 1 },
      ],
    })
  })

  it("update replaces contract rows (deleteMany + create)", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.update).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject({ ...validInput, id: "p1", contracts: [{ label: "ARBUZ", alkaneId: "2:25349" }] } as never)
    expect(res.ok).toBe(true)
    const data = vi.mocked(prisma.ecosystemProject.update).mock.calls[0][0].data
    expect(data.contracts.deleteMany).toEqual({})
    expect(data.contracts.create).toHaveLength(1)
  })

  it("update with no contracts field still clears rows only when [] sent explicitly", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.update).mockResolvedValueOnce({ id: "p1" } as never)
    await saveEcosystemProject({ ...validInput, id: "p1" } as never) // sem contracts
    const data = vi.mocked(prisma.ecosystemProject.update).mock.calls[0][0].data
    expect(data.contracts).toBeUndefined() // undefined = não mexe nas linhas
  })
})
```

- [ ] **Step 2: Rodar — deve FALHAR.**

- [ ] **Step 3: Implementar em `actions/ecosystem/projects.ts`:**

Imports: adicionar `isValidAlkaneId` ao import de constants. Tipos:

```ts
export interface EcosystemContractInput {
  label: string
  alkaneId: string
  noteEn?: string
  noteZh?: string
}
```

Em `EcosystemProjectInput`, adicionar `profileEn?: string`, `profileZh?: string`, `contracts?: EcosystemContractInput[]`.

Em `validate()`, antes do `return null`:

```ts
  for (const c of input.contracts ?? []) {
    if (!c.label?.trim()) return "Contract label is required"
    if (!isValidAlkaneId(c.alkaneId?.trim() ?? "")) {
      return "Contract Alkane ID must look like block:tx (e.g. 4:257)"
    }
  }
```

Em `saveEcosystemProject`, depois de montar `data`, adicionar os campos e as escritas aninhadas:

```ts
  const base = {
    ...data,
    profileEn: input.profileEn?.trim() ?? "",
    profileZh: input.profileZh?.trim() ?? "",
  }
  const contractRows = input.contracts?.map((c, i) => ({
    label: c.label.trim(),
    alkaneId: c.alkaneId.trim(),
    noteEn: c.noteEn?.trim() ?? "",
    noteZh: c.noteZh?.trim() ?? "",
    sortOrder: i,
  }))

  try {
    if (input.id) {
      const row = await prisma.ecosystemProject.update({
        where: { id: input.id },
        data: contractRows
          ? { ...base, contracts: { deleteMany: {}, create: contractRows } }
          : base,
      })
      revalidate()
      return { ok: true, id: row.id }
    }
    const slug = slugify(input.slug?.trim() || input.name)
    if (!slug) return { ok: false, error: "Could not derive a slug from the name" }
    const row = await prisma.ecosystemProject.create({
      data: { ...base, slug, contracts: { create: contractRows ?? [] } },
    })
    revalidate()
    return { ok: true, id: row.id }
  } catch (e) { /* inalterado */ }
```

⚠️ Atenção: teste de create espera `contracts: { create: [...] }` — quando `contracts` é undefined no create, `create: []` é inofensivo; ajustar asserção existente se necessário (os testes antigos usam `expect.objectContaining`, seguem passando). Em `revalidate()`, adicionar `revalidatePath("/ecosystem/[slug]", "page")`.

- [ ] **Step 4: Admin page — `app/admin/ecosystem/page.tsx`:** incluir contratos no fetch e serializar:

```ts
    prisma.ecosystemProject.findMany({
      include: { contracts: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
```
e no map: `contracts: p.contracts.map((c) => ({ id: c.id, label: c.label, alkaneId: c.alkaneId, noteEn: c.noteEn, noteZh: c.noteZh }))`.

- [ ] **Step 5: Teste que falha — adicionar em `tests/ecosystem/admin-form.test.tsx`:**

```tsx
describe("EcosystemAdmin — profile & contracts", () => {
  it("submits profile markdown and contract rows on save", async () => {
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "Arbuzino" } })
    fireEvent.change(getByLabelText("Website URL"), { target: { value: "https://arbuzino.com" } })
    fireEvent.change(getByLabelText("Profile (EN)"), { target: { value: "# Body" } })
    fireEvent.click(getByText("Add contract"))
    fireEvent.change(getByLabelText("Contract 1 label"), { target: { value: "Fireball" } })
    fireEvent.change(getByLabelText("Contract 1 alkane ID"), { target: { value: "4:257" } })
    fireEvent.click(getByText("Create project"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({
      profileEn: "# Body",
      contracts: [{ label: "Fireball", alkaneId: "4:257" }],
    })
  })

  it("toggles the EN profile preview", async () => {
    const { getByText, getByLabelText, queryByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Profile (EN)"), { target: { value: "## Hello" } })
    fireEvent.click(getByText("Preview EN"))
    expect(queryByLabelText("Profile (EN)")).toBeNull() // textarea escondida no preview
    expect(getByText("Hello")).toBeInTheDocument()       // markdown renderizado
    fireEvent.click(getByText("Edit EN"))
    expect(getByLabelText("Profile (EN)")).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Implementar em `components/cms/ecosystem/EcosystemAdmin.tsx`:**

1. `import { Markdown } from "@/lib/cms/markdown"` e `import type { EcosystemContractInput } from "@/actions/ecosystem/projects"`.
2. Tipo + blank:
```ts
export interface AdminContract { id?: string; label: string; alkaneId: string; noteEn: string; noteZh: string }
// AdminProject ganha:
profileEn: string
profileZh: string
contracts: AdminContract[]
// blankProject() ganha: profileEn: "", profileZh: "", contracts: []
```
3. `toInput()` ganha `profileEn: p.profileEn, profileZh: p.profileZh, contracts: p.contracts.map(({ label, alkaneId, noteEn, noteZh }) => ({ label, alkaneId, noteEn, noteZh }))` (assim toggles de featured/published não apagam linhas).
4. No `ProjectForm`: estados novos
```ts
const [profileEn, setProfileEn] = useState(initial.profileEn)
const [profileZh, setProfileZh] = useState(initial.profileZh)
const [contracts, setContracts] = useState<AdminContract[]>(initial.contracts)
const [previewEn, setPreviewEn] = useState(false)
const [previewZh, setPreviewZh] = useState(false)
```
5. UI depois do bloco Description (ZH) — dois blocos gêmeos (EN/ZH):
```tsx
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className={label} htmlFor="ep-profile-en">Profile (EN)</label>
          <button type="button" onClick={() => setPreviewEn(!previewEn)} className="text-xs text-sky-400 hover:text-sky-300">
            {previewEn ? "Edit EN" : "Preview EN"}
          </button>
        </div>
        {previewEn ? (
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <Markdown variant="compact">{profileEn}</Markdown>
          </div>
        ) : (
          <textarea id="ep-profile-en" rows={12} value={profileEn} onChange={(e) => setProfileEn(e.target.value)}
            placeholder="Long-form project profile in Markdown (GFM tables, code blocks…)"
            className={inputCls + " font-mono text-[12.5px]"} />
        )}
      </div>
```
(bloco ZH idêntico com `ep-profile-zh`, `Preview ZH`/`Edit ZH`, `profileZh`).
6. Repeater de contratos (antes dos checkboxes Featured/Published):
```tsx
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={label}>Contracts</span>
          <button type="button" onClick={() => setContracts([...contracts, { label: "", alkaneId: "", noteEn: "", noteZh: "" }])}
            className="text-xs text-sky-400 hover:text-sky-300">
            Add contract
          </button>
        </div>
        {contracts.map((c, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-zinc-800 p-2 sm:grid-cols-[1fr_110px_1fr_1fr_auto]">
            <input aria-label={`Contract ${i + 1} label`} placeholder="Label" value={c.label}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputCls} />
            <input aria-label={`Contract ${i + 1} alkane ID`} placeholder="4:257" value={c.alkaneId}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, alkaneId: e.target.value } : x)))} className={inputCls + " font-mono"} />
            <input aria-label={`Contract ${i + 1} note EN`} placeholder="Note (EN)" value={c.noteEn}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, noteEn: e.target.value } : x)))} className={inputCls} />
            <input aria-label={`Contract ${i + 1} note ZH`} placeholder="Note (ZH)" value={c.noteZh}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, noteZh: e.target.value } : x)))} className={inputCls} />
            <button type="button" aria-label={`Remove contract ${i + 1}`}
              onClick={() => setContracts(contracts.filter((_, j) => j !== i))}
              className="self-center text-zinc-500 hover:text-rose-400"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
```
7. No `save()`, incluir no payload: `profileEn, profileZh, contracts: contracts.map(({ label, alkaneId, noteEn, noteZh }) => ({ label, alkaneId, noteEn, noteZh })) satisfies EcosystemContractInput[]`.

- [ ] **Step 7: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS; `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add actions/ecosystem/projects.ts app/admin/ecosystem/page.tsx components/cms/ecosystem/EcosystemAdmin.tsx tests/ecosystem/actions.test.ts tests/ecosystem/admin-form.test.tsx
git commit -m "feat(ecosystem): admin profile markdown + contracts repeater"
```

---

### Task 5: Seeder de profiles (in-image) + conteúdo Arbuzino

**Files:**
- Create: `scripts/seed-ecosystem-profile.cjs`
- Create: `scripts/data/ecosystem-profiles.json`
- Create: `scripts/data/profiles/arbuzino.en.md`
- Test: `tests/ecosystem/profile-seed-data.test.ts` (novo)

**Interfaces:**
- Consumes: schema Task 1. `scripts/` já vai na imagem Docker (`COPY scripts ./scripts`) — roda in-pod com `NODE_PATH=/app/node_modules`.
- Produces: comando idempotente que ATUALIZA projetos existentes por slug (profile + contratos + descrição opcional) e NUNCA cria projetos.

- [ ] **Step 1: Conteúdo — `scripts/data/profiles/arbuzino.en.md`**

Adaptar de `C:\Alkanes Geral Dev\.claude\handoffs\arbuzino-profile-example.md` (PROFILE.md do misha), com estas mudanças EXATAS:
1. REMOVER o H1 (`# Magic Arbuz / Arbuzino — Project Profile`) — o header da página já mostra o nome.
2. REMOVER a lista de bullets inicial `- **Website:** … - **One-liner:** …` INTEIRA, EXCETO transformar: o texto do bullet **Chain** vira o parágrafo de abertura, e o texto do **One-liner** vira o segundo parágrafo (sem os prefixos em bold, texto corrido).
3. REMOVER a seção `## Contract addresses (AlkaneId = block:tx)` inteira (tabela vira linhas relacionais no JSON abaixo).
4. MANTER na íntegra: `## Products` (subseções 1–4) e `## Reading on-chain data (for aggregators: TVL, prize pools, volumes)` com o template JSON-RPC, as tabelas de view opcodes de `4:257`, `4:777`, position NFTs e card factory, e o exemplo final do top prize.
5. Único ajuste de texto: em "Explorer" não há mais bullet; onde a seção on-chain menciona endpoints, manter como está (self-contained).

- [ ] **Step 2: `scripts/data/ecosystem-profiles.json`**

```json
[
  {
    "slug": "arbuzino",
    "profileMd": "profiles/arbuzino.en.md",
    "contracts": [
      { "label": "ARBUZ token", "alkaneId": "2:25349", "noteEn": "Free-mint alkane token, 100 ARBUZ per mint (pool-gated via Acai)", "noteZh": "" },
      { "label": "Magic Arbuz Card factory", "alkaneId": "2:69849", "noteEn": "Generative tarot-card NFTs, minted by burning 100 ARBUZ", "noteZh": "" },
      { "label": "Inugami bounty", "alkaneId": "2:69834", "noteEn": "DIESEL bounty locked against a miner coinbase phrase", "noteZh": "" },
      { "label": "Fireball game (Arbuzino lottery)", "alkaneId": "4:257", "noteEn": "The lottery singleton — tickets, draws, claims, prize pools", "noteZh": "" },
      { "label": "Fireball position NFT template", "alkaneId": "4:256", "noteEn": "Ticket NFT template; each ticket is a clone minted at 2:N", "noteZh": "" },
      { "label": "Fireball fee vault", "alkaneId": "4:777", "noteEn": "Share vault; the lottery's 14% fee is swept here as staker yield", "noteZh": "" }
    ]
  },
  {
    "slug": "wunsch-vault",
    "descriptionEn": "Share vault for the Arbuzino Fireball lottery — the game's immutable 14% fee is swept here permissionlessly as staker yield.",
    "descriptionZh": "Arbuzino Fireball 彩票的份额金库——游戏不可变的 14% 手续费以无许可方式汇入此处，作为质押者收益。"
  }
]
```

- [ ] **Step 3: Teste que falha — `tests/ecosystem/profile-seed-data.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const dataDir = path.join(process.cwd(), "scripts", "data")
const seed = JSON.parse(fs.readFileSync(path.join(dataDir, "ecosystem-profiles.json"), "utf8")) as Array<{
  slug: string
  profileMd?: string
  profileMdZh?: string
  descriptionEn?: string
  descriptionZh?: string
  contracts?: Array<{ label: string; alkaneId: string; noteEn?: string; noteZh?: string }>
}>

describe("ecosystem-profiles seed data", () => {
  it("has unique non-empty slugs", () => {
    const slugs = seed.map((e) => e.slug)
    expect(slugs.every((s) => s && /^[a-z0-9-]+$/.test(s))).toBe(true)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("contract rows have labels and canonical alkane ids", () => {
    for (const e of seed) for (const c of e.contracts ?? []) {
      expect(c.label.trim().length).toBeGreaterThan(0)
      expect(c.alkaneId).toMatch(/^\d+:\d+$/)
    }
  })

  it("referenced markdown files exist and are non-trivial", () => {
    for (const e of seed) for (const f of [e.profileMd, e.profileMdZh]) {
      if (!f) continue
      const md = fs.readFileSync(path.join(dataDir, f), "utf8")
      expect(md.length).toBeGreaterThan(500)
      expect(md).not.toMatch(/^# /m) // sem H1 — o header da página já tem o nome
    }
  })

  it("arbuzino entry carries the 6 contracts", () => {
    const arb = seed.find((e) => e.slug === "arbuzino")
    expect(arb?.contracts).toHaveLength(6)
    expect(arb?.contracts?.map((c) => c.alkaneId)).toContain("4:777")
  })
})
```

- [ ] **Step 4: Rodar — deve FALHAR** até json+md existirem; depois PASS.

- [ ] **Step 5: `scripts/seed-ecosystem-profile.cjs`**

```js
// scripts/seed-ecosystem-profile.cjs
/**
 * Seeds PROFILE content (markdown body, contract rows, optional description
 * refinements) for EXISTING ecosystem projects. It NEVER creates a project:
 * unknown slugs are reported and skipped (create them via /admin first).
 * For each listed slug this file is the source of truth: profile fields are
 * overwritten and contract rows replaced when present in the entry.
 *
 * Usage (local):  node scripts/seed-ecosystem-profile.cjs --dry-run
 * Usage (in-pod): NODE_PATH=/app/node_modules node /app/scripts/seed-ecosystem-profile.cjs
 */
const { PrismaClient } = require("@prisma/client")
const fs = require("node:fs")
const path = require("node:path")

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const fileIdx = args.indexOf("--file")
  const dataDir = path.join(__dirname, "data")
  const file = fileIdx >= 0 ? args[fileIdx + 1] : path.join(dataDir, "ecosystem-profiles.json")
  const seed = JSON.parse(fs.readFileSync(file, "utf8"))

  const prisma = new PrismaClient()
  let updated = 0, missing = 0
  try {
    for (const e of seed) {
      const existing = await prisma.ecosystemProject.findUnique({ where: { slug: e.slug } })
      if (!existing) {
        missing++
        console.warn(`! missing project "${e.slug}" — skipped (create it via /admin first)`)
        continue
      }
      const data = {}
      if (e.profileMd) data.profileEn = fs.readFileSync(path.join(dataDir, e.profileMd), "utf8")
      if (e.profileMdZh) data.profileZh = fs.readFileSync(path.join(dataDir, e.profileMdZh), "utf8")
      if (e.descriptionEn) data.descriptionEn = e.descriptionEn
      if (e.descriptionZh) data.descriptionZh = e.descriptionZh
      if (Array.isArray(e.contracts)) {
        data.contracts = {
          deleteMany: {},
          create: e.contracts.map((c, i) => ({
            label: c.label, alkaneId: c.alkaneId,
            noteEn: c.noteEn || "", noteZh: c.noteZh || "", sortOrder: i,
          })),
        }
      }
      if (!dryRun) await prisma.ecosystemProject.update({ where: { slug: e.slug }, data })
      updated++
      console.log(`~ profile ${e.slug}${e.contracts ? ` (+${e.contracts.length} contracts)` : ""}`)
    }
    console.log(`${dryRun ? "[dry-run] " : ""}done: ${updated} updated, ${missing} missing`)
    if (missing > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 6: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS; `node scripts/seed-ecosystem-profile.cjs --dry-run` local NÃO precisa rodar (sem DB local) — a validação estática é o teste.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed-ecosystem-profile.cjs scripts/data/ecosystem-profiles.json scripts/data/profiles/arbuzino.en.md tests/ecosystem/profile-seed-data.test.ts
git commit -m "feat(ecosystem): profile seeder + Arbuzino showcase content"
```

---

### Task 6: Gates finais + PR

**Files:** nenhum novo (correções pontuais se um gate reprovar).

- [ ] **Step 1:** `npx vitest run tests/ecosystem/` → 57 antigos + novos, tudo PASS.
- [ ] **Step 2:** `npx tsc --noEmit` → limpo (rodar `pnpm prisma generate` antes se o client estiver stale).
- [ ] **Step 3:** `pnpm lint` → limpo.
- [ ] **Step 4:** `pnpm build` → "Compiled successfully" (EINVAL de standalone no Windows é ruído aceitável).
- [ ] **Step 5:** Push + PR:

```bash
TOKEN=$(gh auth token)
git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/ecosystem-profiles
gh pr create --title "feat(ecosystem): per-project profile pages (/ecosystem/[slug])" --body "…resumo + test plan…"
```

- [ ] **Step 6:** CI paridade — esperar checks; aceitável SOMENTE as 4 falhas allow-listed (admin-nav 3 + admin-landing 1). Qualquer outra falha = investigar antes de merge.

## Pós-merge (orquestrador — fora do escopo dos subagents)

1. `gh pr merge <N> --squash` (após review final Opus).
2. Esperar o workflow "Deploy to GCP" da main terminar (builda a imagem).
3. Bump `k8s/kustomization.yaml` `newTag` com **full-SHA ENTRE ASPAS**, commit `deploy(io): …` direto na main; Flux reconcilia ~1min; `rollout status`. (Schema é aditivo — o `prisma db push` do init container aplica sem prompt.)
4. Seed in-pod:
```bash
cp .ioenv-extracted/kubectl.exe /tmp/ 2>/dev/null || true
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' bash kubectl-io.sh exec deploy/subfrost-io -c app -- env NODE_PATH=/app/node_modules node /app/scripts/seed-ecosystem-profile.cjs
```
5. Verificar prod: `/ecosystem` (cards navegam pra dentro, EN+ZH), `/ecosystem/arbuzino` (markdown + 6 contratos + links espo.sh/ordiscan), `/ecosystem/wunsch-vault` (descrição refinada), slug inexistente → 404, sitemap sem `/ecosystem/*`.
