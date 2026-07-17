# Ecosystem Profile v2A — Banner + Abas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matar o "parece artigo": banner por projeto + conteúdo do profile fatiado em abas clicáveis (auto-split do markdown por H2), estilo abas Apps|Contracts.

**Architecture:** Campo aditivo `bannerUrl`; splitter puro de markdown (fence-aware) em `lib/ecosystem/profile-sections.ts`; `ProfileTabs` client component recebendo painéis já renderizados server-side (`Markdown` continua no server); `EcosystemProfile` reorganizado (banner → header → abas, com fallback v1 quando ≤1 painel); admin ganha upload de banner no fluxo do logo.

**Tech Stack:** Next 16 (RSC + client tabs), Prisma, vitest + @testing-library/react, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-05-ecosystem-profile-v2-design.md` (seção PR A)

## Global Constraints

- Branch `feat/ecosystem-profile-v2a`, worktree novo; PR sempre; `git add` NOMINAL.
- Schema ADITIVO (`bannerUrl String?` — nullable, sem default necessário).
- Soft-launch intacto: nav/sitemap/`tests/ecosystem/integration.test.ts` intocados.
- Público: cores SÓ via tokens `--ed-*`; abas no mesmo idioma visual das abas Apps|Contracts de `EcosystemDirectory.tsx` (role=tab, `-mb-px border-b-2 pb-3 font-mono text-[12.5px]`).
- Sem deps novas; jsdom NÃO bumpar.
- Upload admin: `uploadInlineImage(file, fetch, "ecosystem")` (mesmo kind do logo).
- Gates: `npx vitest run tests/ecosystem/` verde · `npx tsc --noEmit` · `pnpm build` verde · lint: não introduzir findings NOVOS nos arquivos tocados (base tem 86 pré-existentes; `pnpm lint` é `eslint .` desde #186).
- ⚠️ Worktree SEM junction: Turbopack rejeita junction de node_modules no build → `pnpm install --prefer-offline` real + `pnpm prisma generate` no setup.

## Setup (orquestrador, antes da Task 1)

```bash
cd "C:\Alkanes Geral Dev\subfrost.io"
git worktree add ../wt-eco-v2a -b feat/ecosystem-profile-v2a main
cd ../wt-eco-v2a
pnpm install --prefer-offline   # node_modules REAL (Turbopack x junction)
pnpm prisma generate
cp "C:\Alkanes Geral Dev\subfrost.io\docs\superpowers\specs\2026-07-05-ecosystem-profile-v2-design.md" docs/superpowers/specs/
cp "C:\Alkanes Geral Dev\subfrost.io\docs\superpowers\plans\2026-07-05-ecosystem-profile-v2a-layout.md" docs/superpowers/plans/
mkdir -p .superpowers/sdd && echo "# SDD ledger — eco-v2a ($(git rev-parse --short HEAD) base)" > .superpowers/sdd/progress.md
```

---

### Task 1: Schema `bannerUrl` + mapper + splitter de seções

**Files:**
- Modify: `prisma/schema.prisma` (model `EcosystemProject`, logo após `logoUrl`)
- Modify: `lib/ecosystem/public.ts` (interface + 2 mappers)
- Create: `lib/ecosystem/profile-sections.ts`
- Test: `tests/ecosystem/profile-sections.test.ts` (novo)
- Commit também: os dois docs copiados no setup (spec v2 + este plano)

**Interfaces:**
- Produces:
  - `EcosystemProject.bannerUrl String?` (Prisma).
  - `PublicEcosystemProject.bannerUrl: string | null` (exposto nos DOIS mappers — directory e profile herdam).
  - `splitProfileSections(md: string): { intro: string; sections: ProfileSection[] }` com `ProfileSection { title: string; body: string }` em `lib/ecosystem/profile-sections.ts`.

- [ ] **Step 1: Schema** — em `prisma/schema.prisma`, dentro de `model EcosystemProject`, logo abaixo de `logoUrl String?`, adicionar:

```prisma
  bannerUrl     String?
```

- [ ] **Step 2: `pnpm prisma generate`** — Expected: "Generated Prisma Client".

- [ ] **Step 3: Mapper** — em `lib/ecosystem/public.ts`:
  - Na interface `PublicEcosystemProject`, abaixo de `logoUrl: string | null`, adicionar `bannerUrl: string | null`.
  - No map de `getEcosystemDirectory`, abaixo de `logoUrl: r.logoUrl,` adicionar `bannerUrl: r.bannerUrl,`.
  - No return de `getEcosystemProfile`, abaixo de `logoUrl: r.logoUrl,` adicionar `bannerUrl: r.bannerUrl,`.

- [ ] **Step 4: Teste que falha — `tests/ecosystem/profile-sections.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { splitProfileSections } from "@/lib/ecosystem/profile-sections"

describe("splitProfileSections", () => {
  it("returns everything as intro when there is no H2", () => {
    const md = "Just a paragraph.\n\nAnother one."
    expect(splitProfileSections(md)).toEqual({ intro: "Just a paragraph.\n\nAnother one.", sections: [] })
  })

  it("splits intro + sections on H2 lines", () => {
    const md = "Opening line.\n\n## Products\n\nBody A.\n\n## Reading on-chain data\n\nBody B."
    const out = splitProfileSections(md)
    expect(out.intro).toBe("Opening line.")
    expect(out.sections).toEqual([
      { title: "Products", body: "Body A." },
      { title: "Reading on-chain data", body: "Body B." },
    ])
  })

  it("does NOT split on ## inside code fences", () => {
    const md = "Intro.\n\n## Real\n\n```md\n## not a heading\n```\nafter fence."
    const out = splitProfileSections(md)
    expect(out.sections).toHaveLength(1)
    expect(out.sections[0].title).toBe("Real")
    expect(out.sections[0].body).toContain("## not a heading")
    expect(out.sections[0].body).toContain("after fence.")
  })

  it("handles empty intro (markdown starting at an H2) and ### is not a section", () => {
    const md = "## Only\n\nBody.\n\n### sub"
    const out = splitProfileSections(md)
    expect(out.intro).toBe("")
    expect(out.sections).toEqual([{ title: "Only", body: "Body.\n\n### sub" }])
  })
})
```

- [ ] **Step 5: Rodar — deve FALHAR** — `npx vitest run tests/ecosystem/profile-sections.test.ts` (módulo inexistente).

- [ ] **Step 6: Implementar `lib/ecosystem/profile-sections.ts`**

```ts
// lib/ecosystem/profile-sections.ts
/**
 * Splits a profile markdown body into an intro (before the first H2) and one
 * section per `## ` heading — the unit the profile page renders as tabs.
 * Fence-aware: `##` lines inside ``` / ~~~ code fences never open a section.
 */
export interface ProfileSection {
  title: string
  body: string
}

export function splitProfileSections(md: string): { intro: string; sections: ProfileSection[] } {
  const lines = md.split(/\r?\n/)
  const intro: string[] = []
  const sections: ProfileSection[] = []
  let current: { title: string; body: string[] } | null = null
  let inFence = false

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && /^## /.test(line)) {
      if (current) sections.push({ title: current.title, body: current.body.join("\n").trim() })
      current = { title: line.slice(3).trim(), body: [] }
      continue
    }
    if (current) current.body.push(line)
    else intro.push(line)
  }
  if (current) sections.push({ title: current.title, body: current.body.join("\n").trim() })

  return { intro: intro.join("\n").trim(), sections }
}
```

- [ ] **Step 7: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS; `npx tsc --noEmit` limpo.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/ecosystem/public.ts lib/ecosystem/profile-sections.ts tests/ecosystem/profile-sections.test.ts docs/superpowers/specs/2026-07-05-ecosystem-profile-v2-design.md docs/superpowers/plans/2026-07-05-ecosystem-profile-v2a-layout.md
git commit -m "feat(ecosystem): bannerUrl field and profile section splitter"
```

---

### Task 2: ProfileTabs + EcosystemProfile v2 (banner + abas)

**Files:**
- Create: `components/ecosystem/ProfileTabs.tsx`
- Modify: `components/ecosystem/EcosystemProfile.tsx`
- Modify: `app/ecosystem/[slug]/page.tsx` (copy: `overview`)
- Test: `tests/ecosystem/profile-page.test.tsx` (estender), `tests/ecosystem/profile-tabs.test.tsx` (novo)

**Interfaces:**
- Consumes: `splitProfileSections` (Task 1), `bannerUrl` em `PublicEcosystemProfile` (Task 1), `gradFor` de `components/ecosystem/visuals.tsx` (já exportado), `Markdown` de `@/lib/cms/markdown`.
- Produces: `ProfileTabs({ tabs: { key; label }[]; panels: ReactNode[] })` client component; `ProfileCopy` ganha `overview: string`.

- [ ] **Step 1: Teste que falha — `tests/ecosystem/profile-tabs.test.tsx`**

```tsx
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ProfileTabs } from "@/components/ecosystem/ProfileTabs"

describe("ProfileTabs", () => {
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "products", label: "Products" },
  ]
  const panels = [<p key="a">panel A</p>, <p key="b">panel B</p>]

  it("renders a tablist with the first tab active", () => {
    render(<ProfileTabs tabs={tabs} panels={panels} />)
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("panel A")).toBeInTheDocument()
    expect(screen.queryByText("panel B")).toBeNull()
  })

  it("switches panel on click", () => {
    render(<ProfileTabs tabs={tabs} panels={panels} />)
    fireEvent.click(screen.getByRole("tab", { name: "Products" }))
    expect(screen.getByRole("tab", { name: "Products" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("panel B")).toBeInTheDocument()
    expect(screen.queryByText("panel A")).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar — deve FALHAR.**

- [ ] **Step 3: Implementar `components/ecosystem/ProfileTabs.tsx`**

```tsx
"use client"

import { useState, type ReactNode } from "react"

export interface ProfileTab {
  key: string
  label: string
}

// Content tabs for the project profile page. Panels arrive fully rendered from
// the server (Markdown stays server-side); this component only switches them.
export function ProfileTabs({ tabs, panels }: { tabs: ProfileTab[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0)
  return (
    <div>
      <div role="tablist" aria-label="Profile sections" className="flex gap-6 overflow-x-auto border-b border-[color:var(--ed-hair)]">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={
              "-mb-px whitespace-nowrap border-b-2 pb-3 font-mono text-[12.5px] font-medium tracking-[0.04em] transition-colors " +
              (active === i
                ? "border-[color:var(--ed-ink)] text-[color:var(--ed-ink)]"
                : "border-transparent text-[color:var(--ed-muted)] hover:text-[color:var(--ed-accent)]")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-6">{panels[active]}</div>
    </div>
  )
}
```

- [ ] **Step 4: Testes que falham — adicionar em `tests/ecosystem/profile-page.test.tsx`** (o fixture `profile()` já existe; adicionar `bannerUrl: null` nele para satisfazer o tipo):

```tsx
describe("EcosystemProfile v2 — banner + tabs", () => {
  const md = "Intro paragraph.\n\n## Products\n\nProducts body.\n\n## On-chain\n\nData body."

  it("renders banner img when bannerUrl is set, gradient band when not", () => {
    const { container, rerender } = render(
      <EcosystemProfile p={profile({ bannerUrl: "https://cdn.x/banner.png" })} copy={copy} backHref="/ecosystem" />,
    )
    expect(container.querySelector('img[src="https://cdn.x/banner.png"]')).toBeTruthy()
    rerender(<EcosystemProfile p={profile({ bannerUrl: null })} copy={copy} backHref="/ecosystem" />)
    expect(container.querySelector('img[src="https://cdn.x/banner.png"]')).toBeNull()
  })

  it("renders tabs from H2 sections plus Overview and Contracts", () => {
    render(<EcosystemProfile p={profile({ profile: md })} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Products" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "On-chain" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Contracts" })).toBeInTheDocument()
    expect(screen.getByText("Intro paragraph.")).toBeInTheDocument() // Overview ativo
    expect(screen.queryByText("Products body.")).toBeNull()
    fireEvent.click(screen.getByRole("tab", { name: "Contracts" }))
    expect(screen.getByText("Fireball game")).toBeInTheDocument() // tabela virou painel
  })

  it("thin profile (≤1 panel) keeps the v1 layout without a tablist", () => {
    render(
      <EcosystemProfile
        p={profile({ profile: "Just a short blurb.", contracts: [] })}
        copy={copy}
        backHref="/ecosystem"
      />,
    )
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByText("Just a short blurb.")).toBeInTheDocument()
  })
})
```

(Imports: adicionar `fireEvent` ao import de `@testing-library/react`. No objeto `copy` do teste, adicionar `overview: "Overview"`.)

- [ ] **Step 5: Implementar em `components/ecosystem/EcosystemProfile.tsx`**

Mudanças:
1. Imports novos: `splitProfileSections` de `@/lib/ecosystem/profile-sections`; `gradFor` junto do import de visuals; `ProfileTabs` de `./ProfileTabs`; `type ReactNode` de react.
2. `ProfileCopy` ganha `overview: string`.
3. Extrair a tabela de contratos atual para um componente interno `ContractsTable({ contracts, copy })` no MESMO arquivo (markup idêntico ao atual, sem o `<section>`/`<h2>` wrapper — o título vira a aba; manter o wrapper `overflow-x-auto`).
4. Logo após o `<Link>` do breadcrumb, inserir o banner:

```tsx
      {p.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.bannerUrl} alt="" className="mt-5 h-[clamp(120px,22vw,240px)] w-full rounded-[14px] object-cover" />
      ) : (
        <div aria-hidden className="mt-5 h-[96px] w-full rounded-[14px]" style={{ background: gradFor(p.slug) }} />
      )}
```

5. Substituir os dois blocos do corpo (markdown + section Contracts) por:

```tsx
      <ProfileBody p={p} copy={copy} />
```

com o componente interno (mesmo arquivo):

```tsx
function ProfileBody({ p, copy }: { p: PublicEcosystemProfile; copy: ProfileCopy }) {
  const { intro, sections } = splitProfileSections(p.profile)
  const tabs: { key: string; label: string }[] = []
  const panels: ReactNode[] = []
  if (intro) {
    tabs.push({ key: "overview", label: copy.overview })
    panels.push(<Markdown variant="article">{intro}</Markdown>)
  }
  sections.forEach((s, i) => {
    tabs.push({ key: `s${i}`, label: s.title })
    panels.push(<Markdown variant="article">{s.body}</Markdown>)
  })
  if (p.contracts.length > 0) {
    tabs.push({ key: "contracts", label: copy.contractsTitle })
    panels.push(<ContractsTable contracts={p.contracts} copy={copy} />)
  }
  if (tabs.length === 0) return null
  if (tabs.length === 1) {
    // Thin profile: keep the v1 single-flow layout (no tab chrome for one panel).
    return <div className="mt-10 border-t border-[color:var(--ed-hair)] pt-8">{panels[0]}</div>
  }
  return (
    <div className="mt-10">
      <ProfileTabs tabs={tabs} panels={panels} />
    </div>
  )
}
```

⚠️ Manter o caso "1 painel = contratos apenas" legível: quando o único painel for a tabela, o título "Contracts" não aparece — aceitável e pinado pelos testes? NÃO: para preservar o v1 nesse caso, quando `tabs.length === 1 && tabs[0].key === "contracts"`, renderizar com o heading:

```tsx
  if (tabs.length === 1) {
    return (
      <div className="mt-10 border-t border-[color:var(--ed-hair)] pt-8">
        {tabs[0].key === "contracts" ? (
          <>
            <h2 className="mb-4 text-[20px] font-medium tracking-[-0.012em] text-[color:var(--ed-ink)]">{copy.contractsTitle}</h2>
            {panels[0]}
          </>
        ) : (
          panels[0]
        )}
      </div>
    )
  }
```

6. Em `app/ecosystem/[slug]/page.tsx`, adicionar ao copy: EN `overview: "Overview",` e ZH `overview: "概览",` (e o tipo compila via `ProfileCopy`).

- [ ] **Step 6: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS (os testes v1 de "renders header, markdown body" continuam passando: o teste antigo usa markdown com `## Products`, que agora vira aba — **ajustar o teste v1 existente** se ele asserta `getByRole("heading", { name: "Products" })`: com abas, o painel Overview mostra só o intro. Atualizar a asserção antiga para clicar na aba Products antes de procurar o heading, preservando a intenção). `npx tsc --noEmit` limpo.

- [ ] **Step 7: Commit**

```bash
git add components/ecosystem/ProfileTabs.tsx components/ecosystem/EcosystemProfile.tsx 'app/ecosystem/[slug]/page.tsx' tests/ecosystem/profile-tabs.test.tsx tests/ecosystem/profile-page.test.tsx
git commit -m "feat(ecosystem): profile banner band and content tabs"
```

---

### Task 3: Admin — upload de banner

**Files:**
- Modify: `actions/ecosystem/projects.ts`
- Modify: `app/admin/ecosystem/page.tsx` (serialização — `bannerUrl` já vem no spread `...p`; conferir e só ajustar se o map for explícito)
- Modify: `components/cms/ecosystem/EcosystemAdmin.tsx`
- Test: `tests/ecosystem/actions.test.ts`, `tests/ecosystem/admin-upload.test.tsx` (estender)

**Interfaces:**
- Consumes: `bannerUrl` no schema (Task 1); `uploadInlineImage` de `@/lib/cms/inline-image-upload`.
- Produces: `EcosystemProjectInput.bannerUrl?: string | null`; `AdminProject.bannerUrl: string | null`.

- [ ] **Step 1: Testes que falham** — em `tests/ecosystem/actions.test.ts`:

```ts
  it("persists bannerUrl trimmed and rejects a non-http banner", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValue({ id: "b1" } as never)
    const ok = await saveEcosystemProject({ ...validInput, bannerUrl: " https://cdn.x/b.png " } as never)
    expect(ok.ok).toBe(true)
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.bannerUrl).toBe("https://cdn.x/b.png")
    const bad = await saveEcosystemProject({ ...validInput, bannerUrl: "javascript:x" } as never)
    expect(bad.ok).toBe(false)
  })
```

Em `tests/ecosystem/admin-upload.test.tsx` (segue o padrão do teste de logo existente — mock de `@/lib/cms/inline-image-upload`):

```tsx
  it("uploads a banner with kind ecosystem and submits its url", async () => {
    vi.mocked(uploadInlineImage).mockResolvedValue("https://cdn.x/banner.png")
    vi.mocked(saveEcosystemProject).mockResolvedValue({ ok: true, id: "e1" })
    const { getByText, getByLabelText } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    fireEvent.change(getByLabelText("Name"), { target: { value: "X" } })
    fireEvent.change(getByLabelText("Website URL"), { target: { value: "https://x.io" } })
    const input = getByLabelText("Upload banner file") as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["b"], "b.png", { type: "image/png" })] } })
    await waitFor(() => expect(uploadInlineImage).toHaveBeenCalled())
    expect(vi.mocked(uploadInlineImage).mock.calls[0][2]).toBe("ecosystem")
    fireEvent.click(getByText("Create project"))
    await waitFor(() => expect(saveEcosystemProject).toHaveBeenCalled())
    expect(vi.mocked(saveEcosystemProject).mock.calls[0][0]).toMatchObject({ bannerUrl: "https://cdn.x/banner.png" })
  })
```

(Adaptar imports/mocks ao arquivo existente — ele já mocka `uploadInlineImage` e `saveEcosystemProject` para o fluxo do logo; seguir a MESMA estrutura. O `aria-label="Upload banner file"` vem do input novo no Step 3.)

- [ ] **Step 2: Rodar — deve FALHAR.**

- [ ] **Step 3: Implementar**

`actions/ecosystem/projects.ts`:
- `EcosystemProjectInput` ganha `bannerUrl?: string | null`.
- `validate()`: junto da validação do logo, `if (!isValidOptionalHttpUrl(input.bannerUrl)) return "Banner must be a valid http(s) URL"`.
- `data`/`base`: `bannerUrl: input.bannerUrl?.trim() || null,` (junto de `logoUrl`).

`components/cms/ecosystem/EcosystemAdmin.tsx`:
- `AdminProject.bannerUrl: string | null`; `blankProject()` ganha `bannerUrl: null`; `toInput()` ganha `bannerUrl: p.bannerUrl`.
- `ProjectForm`: estado `const [bannerUrl, setBannerUrl] = useState(initial.bannerUrl ?? "")`, ref/estado de upload próprios (`bannerFileRef`, `uploadingBanner`, `bannerError`), handler `onPickBanner` idêntico ao `onPickLogo` (mesmo try/catch resiliente, `uploadInlineImage(file, fetch, "ecosystem")` → `setBannerUrl`).
- UI: bloco logo abaixo do bloco do logo:

```tsx
      <div className="flex items-center gap-4">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" className="h-16 w-40 rounded-md object-cover" />
        ) : (
          <div className="flex h-16 w-40 items-center justify-center rounded-md bg-zinc-800 text-xs text-zinc-500">No banner</div>
        )}
        <div>
          <input ref={bannerFileRef} type="file" accept="image/*" aria-label="Upload banner file" className="hidden" onChange={onPickBanner} />
          <button type="button" onClick={() => bannerFileRef.current?.click()} disabled={uploadingBanner}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
            {uploadingBanner ? "Uploading…" : "Upload banner"}
          </button>
          {bannerUrl ? (
            <button type="button" onClick={() => setBannerUrl("")} className="ml-2 text-xs text-zinc-500 hover:text-rose-400">Remove</button>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">Wide cover image (profile page)</p>
          {bannerError && <p role="alert" className="mt-1 text-xs text-rose-400">{bannerError}</p>}
        </div>
      </div>
```

- `save()`: payload ganha `bannerUrl: bannerUrl || null`.
- ⚠️ O input de arquivo do LOGO existente não tem aria-label — adicionar `aria-label="Upload logo file"` nele NÃO é necessário (não mexer; o teste do banner usa o label novo).

`app/admin/ecosystem/page.tsx`: o map atual usa spread `{ ...p, createdAt: ..., updatedAt: ..., contracts: ... }` — `bannerUrl` já passa; nenhuma mudança a fazer (conferir).

- [ ] **Step 4: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS; `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add actions/ecosystem/projects.ts components/cms/ecosystem/EcosystemAdmin.tsx tests/ecosystem/actions.test.ts tests/ecosystem/admin-upload.test.tsx
git commit -m "feat(ecosystem): admin banner upload"
```

(Se `app/admin/ecosystem/page.tsx` precisar de ajuste no Step 3, incluir no `git add`.)

---

### Task 4: Gates + PR (orquestrador)

- [ ] `npx vitest run tests/ecosystem/ tests/i18n/` verde
- [ ] `npx tsc --noEmit` limpo
- [ ] `pnpm lint` — sem findings NOVOS nos arquivos tocados (base 86)
- [ ] `pnpm build` — "Compiled successfully" + rota `[slug]` na tabela
- [ ] Push (`TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/ecosystem-profile-v2a`) + `gh pr create --head ...` + CI paridade (4 allow-listed) + review final Opus da branch + merge squash + bump QUOTED + Flux + rollout + verificação prod (/ecosystem/arbuzino com abas; banner ainda null → banda gradiente).
