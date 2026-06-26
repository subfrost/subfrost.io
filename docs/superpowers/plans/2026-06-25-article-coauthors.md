# Co-authors em artigos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir 0..N co-autores num artigo, exibidos no byline (leitor + home + preview admin) e nos cards de bio, sem quebrar artigos existentes.

**Architecture:** Relação M:N implícita `Article.coAuthors User[]` espelhando o padrão das tags. A camada de dados (`lib/cms/articles.ts`) carrega `coAuthors` em cada preview; o editor grava via `upsertArticle` (connect/set); os componentes de byline/leitor renderizam autor + co-autores. Tudo aditivo.

**Tech Stack:** Next.js (App Router, server components), Prisma + Postgres, Zod, React, Vitest + @testing-library/react (happy-dom), Tailwind.

## Global Constraints

- **Migração ADITIVA, nunca destrutiva.** Schema novo entra em prod via init container `prisma db push` no boot; artigos antigos têm `coAuthors` vazio e renderizam idêntico.
- **Sem nova categoria IAM.** Edição de co-autores passa pelo mesmo `saveArticle` → `upsertArticle`, gateado por ownership ou `articles.edit_any`.
- **Gates antes de "pronto":** `npx prisma generate` → `npx tsc --noEmit` (0) → `npx vitest run` (tudo passa) → `npm run build` (0). Rodar `prisma generate` SEMPRE depois de mexer no schema, antes do tsc.
- **Windows + PowerShell:** usar Git Bash pra heredoc; `git -C "C:\Alkanes Geral Dev\subfrost.io" …`. Branch de trabalho: `feat/article-coauthors` (já criada).
- **Ordem determinística:** M:N implícita não guarda ordem → co-autores exibidos ordenados por `name`; autor principal sempre primeiro. Autor principal nunca é também co-autor (filtrado).
- **Tipos:** `AuthorProfile = { id: string; name: string; avatarUrl: string | null; bio: string | null; twitter: string | null }` (já existe em `lib/cms/articles.ts`). `CmsLocale = "en" | "zh"`.

---

### Task 1: Schema — relação M:N `coAuthors`

**Files:**
- Modify: `prisma/schema.prisma` (model `Article` ~L371-395; model `User` ~L286-298)

**Interfaces:**
- Produces: relação `coAuthors`/`coAuthoredArticles` (`@relation("CoAuthoredArticles")`) + join table implícita `_CoAuthoredArticles`.

- [ ] **Step 1: Adicionar o lado `Article`**

No `model Article`, logo abaixo da linha `authorId     String`, adicionar:

```prisma
  coAuthors    User[]               @relation("CoAuthoredArticles")
```

- [ ] **Step 2: Adicionar o lado inverso no `User`**

No `model User`, junto ao bloco de relações (logo abaixo de `articles        Article[]            @relation("AuthoredArticles")`), adicionar:

```prisma
  coAuthoredArticles Article[]            @relation("CoAuthoredArticles")
```

- [ ] **Step 3: Validar e gerar o client**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` + `Generated Prisma Client`. (Sem migração SQL versionada — `prisma db push` roda no boot do init container em prod.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): coAuthors M:N relation on Article"
```

---

### Task 2: Helper puro `formatAuthorNames`

**Files:**
- Create: `lib/cms/author-format.ts`
- Test: `tests/cms/author-format.test.ts`

**Interfaces:**
- Produces: `formatAuthorNames(names: string[], locale: CmsLocale): string` — junta nomes em texto plano com conjunção localizada (en Oxford comma; zh `、`/` 和 `). Usado pela home widget, byline compacto, busca e SEO.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/author-format.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { formatAuthorNames } from "@/lib/cms/author-format"

describe("formatAuthorNames", () => {
  it("returns empty string for no names", () => {
    expect(formatAuthorNames([], "en")).toBe("")
  })
  it("returns the single name unchanged", () => {
    expect(formatAuthorNames(["Vitor"], "en")).toBe("Vitor")
  })
  it("joins two names with 'and' in English", () => {
    expect(formatAuthorNames(["Vitor", "Gabe"], "en")).toBe("Vitor and Gabe")
  })
  it("uses an Oxford comma for three or more in English", () => {
    expect(formatAuthorNames(["A", "B", "C"], "en")).toBe("A, B, and C")
  })
  it("joins two names with 和 in Chinese", () => {
    expect(formatAuthorNames(["甲", "乙"], "zh")).toBe("甲 和 乙")
  })
  it("uses 、 separators and 和 before the last name in Chinese", () => {
    expect(formatAuthorNames(["甲", "乙", "丙"], "zh")).toBe("甲、乙 和 丙")
  })
  it("drops empty entries before joining", () => {
    expect(formatAuthorNames(["Vitor", ""], "en")).toBe("Vitor")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/author-format.test.ts`
Expected: FAIL — cannot resolve `@/lib/cms/author-format`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/cms/author-format.ts`:

```ts
import type { CmsLocale } from "@/lib/cms/articles"

/** Joins author names into one display string with a localized conjunction.
 *  en: "A", "A and B", "A, B, and C" (Oxford comma).
 *  zh: "A", "A 和 B", "A、B 和 C". Empty entries are dropped. */
export function formatAuthorNames(names: string[], locale: CmsLocale): string {
  const list = names.filter((n) => n && n.trim())
  if (list.length === 0) return ""
  if (list.length === 1) return list[0]
  const and = locale === "zh" ? " 和 " : " and "
  if (list.length === 2) return list[0] + and + list[1]
  const sep = locale === "zh" ? "、" : ", "
  const head = list.slice(0, -1).join(sep)
  const tail = list[list.length - 1]
  return locale === "zh" ? head + and + tail : head + "," + and + tail
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/author-format.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/author-format.ts tests/cms/author-format.test.ts
git commit -m "feat(cms): formatAuthorNames helper for multi-author bylines"
```

---

### Task 3: Camada de dados — `coAuthors` em ArticlePreview/ArticleFull

**Files:**
- Modify: `lib/cms/articles.ts` (`ArticlePreview` ~L19-31; `baseSelect` ~L53-62; `ArticleRow` ~L64-73; `previewArticleToPreview` ~L183-201; `toPreview` ~L253-275)
- Test: `tests/cms/articles-coauthors.test.ts`

**Interfaces:**
- Consumes: `AuthorProfile` (existente).
- Produces: `ArticlePreview.coAuthors: AuthorProfile[]` (e `ArticleFull` por herança), populado por `toPreview`, ordenado por nome, excluindo o autor principal.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/articles-coauthors.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { article: { findMany: vi.fn() } },
}))

import { getPublishedPreviews } from "@/lib/cms/articles"
import prisma from "@/lib/prisma"

const fn = (m: unknown) => vi.mocked(m as never as ReturnType<typeof vi.fn>)
beforeEach(() => vi.clearAllMocks())

const baseRow = {
  slug: "a",
  coverImage: null,
  publishedAt: new Date("2026-06-22T12:00:00.000Z"),
  updatedAt: new Date("2026-06-22T12:00:00.000Z"),
  primaryLocale: "en",
  author: { id: "auth1", name: "Vitor", email: "v@s.io", avatarUrl: null, bio: null, twitter: null },
  tags: [],
  translations: [{ locale: "en", title: "T", excerpt: "E", body: "B", sources: "" }],
}

describe("getPublishedPreviews — coAuthors", () => {
  it("maps coAuthors sorted by name, excluding the primary author", async () => {
    fn(prisma.article.findMany).mockResolvedValue([
      {
        ...baseRow,
        coAuthors: [
          { id: "u3", name: "Zara", email: "z@s.io", avatarUrl: null, bio: null, twitter: null },
          { id: "u2", name: "Gabe", email: "g@s.io", avatarUrl: "/g.png", bio: "bio", twitter: "gabe" },
          { id: "auth1", name: "Vitor", email: "v@s.io", avatarUrl: null, bio: null, twitter: null },
        ],
      },
    ])
    const [preview] = await getPublishedPreviews()
    expect(preview.coAuthors.map((c) => c.name)).toEqual(["Gabe", "Zara"])
    expect(preview.coAuthors[0]).toMatchObject({ id: "u2", avatarUrl: "/g.png", bio: "bio", twitter: "gabe" })
  })

  it("returns an empty coAuthors array when there are none", async () => {
    fn(prisma.article.findMany).mockResolvedValue([{ ...baseRow, coAuthors: [] }])
    const [preview] = await getPublishedPreviews()
    expect(preview.coAuthors).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/articles-coauthors.test.ts`
Expected: FAIL — `preview.coAuthors` is undefined (type/runtime).

- [ ] **Step 3a: Add `coAuthors` to the `ArticlePreview` interface**

In `lib/cms/articles.ts`, in `interface ArticlePreview`, right after the `author: AuthorProfile` line, add:

```ts
  coAuthors: AuthorProfile[]
```

- [ ] **Step 3b: Select `coAuthors` in `baseSelect`**

In `baseSelect`, right after the `author: { select: { ... } },` line, add:

```ts
  coAuthors: { select: { id: true, name: true, email: true, avatarUrl: true, bio: true, twitter: true } },
```

- [ ] **Step 3c: Add `coAuthors` to the `ArticleRow` type**

In `type ArticleRow`, right after the `author: { ... }` line, add:

```ts
  coAuthors: { id: string; name: string | null; email: string; avatarUrl: string | null; bio: string | null; twitter: string | null }[]
```

- [ ] **Step 3d: Map `coAuthors` in `toPreview`**

In `toPreview`, inside the returned object, right after the `author: { ... },` block (after its closing `},`), add:

```ts
    coAuthors: a.coAuthors
      .filter((u) => u.id !== a.author.id)
      .map((u) => ({ id: u.id, name: u.name ?? u.email, avatarUrl: u.avatarUrl, bio: u.bio, twitter: u.twitter }))
      .sort((x, y) => x.name.localeCompare(y.name)),
```

- [ ] **Step 3e: Default `coAuthors` in `previewArticleToPreview`**

In `previewArticleToPreview`, inside the returned object, right after `author: article.author,`, add:

```ts
    coAuthors: [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/articles-coauthors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Regenerate + typecheck + commit**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: 0 errors.

```bash
git add lib/cms/articles.ts tests/cms/articles-coauthors.test.ts
git commit -m "feat(cms): load coAuthors into article previews"
```

---

### Task 4: Write action — `coAuthorIds` (validação + connect/set)

**Files:**
- Modify: `lib/cms/article-write.ts` (`articleInputSchema` ~L14-23; `upsertArticle` create ~L113-122 and update tx ~L87-107)
- Test: `tests/cms/article-write-coauthors.test.ts`

**Interfaces:**
- Consumes: `prisma.user.findMany`, `prisma.article.create`, `prisma.$transaction` + `tx.article.update`.
- Produces: `ArticleInput.coAuthorIds?: string[]`; on create `coAuthors: { connect }`, on update `coAuthors: { set }`, both sanitized (dedupe, drop author, keep only existing users).

- [ ] **Step 1: Write the failing test**

Create `tests/cms/article-write-coauthors.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const tx = {
  article: { update: vi.fn() },
  articleTranslation: { deleteMany: vi.fn(), upsert: vi.fn() },
  revision: { create: vi.fn() },
}

vi.mock("@/lib/prisma", () => {
  const article = { findUnique: vi.fn(), create: vi.fn() }
  const user = { findMany: vi.fn() }
  const client = { article, user, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) }
  return { prisma: client, default: client }
})
vi.mock("@/lib/cms/article-notify", () => ({ notifyNewArticle: vi.fn() }))

import prisma from "@/lib/prisma"
import { upsertArticle } from "@/lib/cms/article-write"

const p = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>
  user: { findMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}
const actor = { id: "auth1", privileges: ["articles.publish", "articles.edit_any"] as never }
const input = (over: Record<string, unknown> = {}) => ({
  translations: { en: { title: "T", excerpt: "E", body: "B", sources: "" } }, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  tx.article.update.mockResolvedValue({})
  tx.articleTranslation.deleteMany.mockResolvedValue({})
  tx.articleTranslation.upsert.mockResolvedValue({})
  tx.revision.create.mockResolvedValue({})
  p.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
})

describe("upsertArticle — coAuthors", () => {
  it("connects validated coAuthors on create, dropping the author and unknown ids", async () => {
    p.user.findMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]) // u9 unknown, auth1 is the author
    p.article.create.mockResolvedValue({ id: "new1", slug: "t" })
    await upsertArticle(actor, input({ coAuthorIds: ["u2", "u3", "u2", "auth1", "u9"] }))
    const arg = p.article.create.mock.calls[0][0] as { data: { coAuthors: { connect: { id: string }[] } } }
    expect(arg.data.coAuthors.connect.map((c) => c.id).sort()).toEqual(["u2", "u3"])
  })

  it("sets coAuthors on update", async () => {
    p.user.findMany.mockResolvedValue([{ id: "u2" }])
    p.article.findUnique.mockResolvedValueOnce({ id: "a1", slug: "s", status: "DRAFT", authorId: "auth1", publishedAt: null })
    await upsertArticle(actor, input({ id: "a1", coAuthorIds: ["u2"] }))
    const arg = tx.article.update.mock.calls[0][0] as { data: { coAuthors: { set: { id: string }[] } } }
    expect(arg.data.coAuthors.set).toEqual([{ id: "u2" }])
  })

  it("connects an empty set when no coAuthorIds are given", async () => {
    p.article.create.mockResolvedValue({ id: "new1", slug: "t" })
    await upsertArticle(actor, input())
    const arg = p.article.create.mock.calls[0][0] as { data: { coAuthors: { connect: { id: string }[] } } }
    expect(arg.data.coAuthors.connect).toEqual([])
    expect(p.user.findMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/article-write-coauthors.test.ts`
Expected: FAIL — `coAuthors` undefined on the create/update args.

- [ ] **Step 3a: Add `coAuthorIds` to the schema**

In `lib/cms/article-write.ts`, in `articleInputSchema`, add (e.g. right after the `tags:` line):

```ts
  coAuthorIds: z.array(z.string()).optional().default([]),
```

- [ ] **Step 3b: Add the sanitizer helper**

In `lib/cms/article-write.ts`, after the `uniqueSlug` function, add:

```ts
/** Dedupe coAuthor ids, drop the primary author, and keep only ids that resolve
 *  to a real user. Defense-in-depth — the editor only offers valid members. */
async function resolveCoAuthorIds(ids: string[], authorId: string): Promise<string[]> {
  const unique = Array.from(new Set(ids)).filter((id) => id && id !== authorId)
  if (unique.length === 0) return []
  const found = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true } })
  const valid = new Set(found.map((u) => u.id))
  return unique.filter((id) => valid.has(id))
}
```

- [ ] **Step 3c: Use it in the update path**

In `upsertArticle`, inside the `if (data.id) { ... }` block, after the `existing` ownership checks and before `await prisma.$transaction(...)`, add:

```ts
    const coAuthorIds = await resolveCoAuthorIds(data.coAuthorIds, existing.authorId)
```

Then in the `tx.article.update({ ... data: { ... } })` call, add to the `data` object (e.g. after the `tags: { set: [], connectOrCreate: tagConnect },` line):

```ts
          coAuthors: { set: coAuthorIds.map((id) => ({ id })) },
```

- [ ] **Step 3d: Use it in the create path**

In `upsertArticle`, before `const created = await prisma.article.create({`, add:

```ts
  const createCoAuthorIds = await resolveCoAuthorIds(data.coAuthorIds, actor.id)
```

Then in the create `data` object (e.g. after the `tags: { connectOrCreate: tagConnect },` line), add:

```ts
      coAuthors: { connect: createCoAuthorIds.map((id) => ({ id })) },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/article-write-coauthors.test.ts`
Expected: PASS (3 tests). Also re-run the existing write tests to ensure no regression:
Run: `npx vitest run tests/cms/article-write.test.ts tests/cms/article-write-notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cms/article-write.ts tests/cms/article-write-coauthors.test.ts
git commit -m "feat(cms): persist coAuthors via upsertArticle (connect/set + validation)"
```

---

### Task 5: `AuthorByline` — autor + co-autores

**Files:**
- Modify: `components/articles/AuthorByline.tsx`
- Test: `tests/cms/author-byline.test.tsx`

**Interfaces:**
- Consumes: `AuthorProfile`, `formatAuthorNames` (not strictly needed here — links rendered directly).
- Produces: `AuthorByline` accepts optional `coAuthors?: AuthorProfile[]`; renders linked names "X and Y" + an avatar stack (full variant, cap 3). Existing callers (no `coAuthors`) unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/author-byline.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { AuthorByline } from "@/components/articles/AuthorByline"

beforeEach(() => cleanup())

const author = { id: "u1", name: "Vitor", avatarUrl: null, bio: null, twitter: null }
const gabe = { id: "u2", name: "Gabe", avatarUrl: null, bio: null, twitter: null }

describe("AuthorByline — coAuthors", () => {
  it("renders only the primary author when there are no coAuthors", () => {
    const { container, getByText } = render(
      <AuthorByline author={author} publishedAt={null} readingMinutes={3} />,
    )
    expect(getByText("Vitor")).toBeTruthy()
    expect(container.querySelectorAll('a[href^="/authors/"]').length).toBe(1)
  })

  it("renders both authors, each linking to its author page", () => {
    const { container, getByText } = render(
      <AuthorByline author={author} coAuthors={[gabe]} publishedAt={null} readingMinutes={3} />,
    )
    expect(getByText("Vitor")).toBeTruthy()
    expect(getByText("Gabe")).toBeTruthy()
    expect(container.querySelector('a[href="/authors/u1"]')).toBeTruthy()
    expect(container.querySelector('a[href="/authors/u2"]')).toBeTruthy()
  })

  it("does not link names when linkAuthor is false (card context)", () => {
    const { container, getByText } = render(
      <AuthorByline author={author} coAuthors={[gabe]} publishedAt={null} readingMinutes={3} variant="compact" linkAuthor={false} />,
    )
    expect(getByText("Gabe")).toBeTruthy()
    expect(container.querySelector('a[href^="/authors/"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/author-byline.test.tsx`
Expected: FAIL — `coAuthors` prop not accepted / "Gabe" not found.

- [ ] **Step 3: Rewrite `AuthorByline`**

Replace the whole `AuthorByline` function in `components/articles/AuthorByline.tsx` with the following (keep the `Avatar` export and imports above it; add `Fragment` to the React import — change line 1 region to include it):

At the top, ensure the imports include `Fragment` and the `CSSProperties` type (no `React` namespace is in scope, so import the type directly):

```tsx
import Link from "next/link"
import { Fragment, type CSSProperties } from "react"
import type { AuthorProfile, CmsLocale } from "@/lib/cms/articles"
```

Then the component:

```tsx
// Byline rendered under feed cards, the reader header, and author pages.
// `variant="compact"` is a single muted line (used in cards); the default
// stacks the names over the date/read-time. `linkAuthor` is disabled inside
// card links to avoid nesting an <a> within an <a>. `coAuthors` (optional)
// extends the byline to "X and Y" and the avatar to a small overlapping stack.
export function AuthorByline({
  author,
  publishedAt,
  readingMinutes,
  size = 40,
  variant = "full",
  linkAuthor = true,
  locale = "en",
  coAuthors = [],
}: {
  author: AuthorProfile
  publishedAt: string | null
  readingMinutes: number
  size?: number
  variant?: "full" | "compact"
  linkAuthor?: boolean
  locale?: CmsLocale
  coAuthors?: AuthorProfile[]
}) {
  const all = [author, ...coAuthors]
  const hrefFor = (a: AuthorProfile) => (locale === "zh" ? `/authors/${a.id}?lang=zh` : `/authors/${a.id}`)
  const sepBefore = (i: number) => {
    if (i === all.length - 1) return all.length > 2 && locale !== "zh" ? ", and " : locale === "zh" ? " 和 " : " and "
    return locale === "zh" ? "、" : ", "
  }
  const names = (
    <>
      {all.map((a, i) => (
        <Fragment key={a.id}>
          {i > 0 ? <span>{sepBefore(i)}</span> : null}
          {linkAuthor ? (
            <Link href={hrefFor(a)} className="font-medium hover:underline" style={{ color: "var(--ed-ink)" }}>
              {a.name}
            </Link>
          ) : (
            <span className="font-medium" style={{ color: "var(--ed-ink)" }}>
              {a.name}
            </span>
          )}
        </Fragment>
      ))}
    </>
  )

  if (variant === "compact") {
    const d = publishedAt
      ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }).format(new Date(publishedAt))
      : ""
    return (
      <div className="flex items-center gap-2.5">
        <Avatar name={author.name} src={author.avatarUrl} size={size} />
        <div className="font-reading text-[13px]" style={{ color: "var(--ed-muted)" }}>
          {names}
          {d ? ` · ${d}` : ""}
          {readingMinutes ? ` · ${readingMinutes} ${locale === "zh" ? "分钟" : "min"}` : ""}
        </div>
      </div>
    )
  }

  const dateStr = publishedAt
    ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(publishedAt))
    : ""
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {all.slice(0, 3).map((a) => (
          <span key={a.id} className="rounded-full ring-2" style={{ ["--tw-ring-color"]: "var(--ed-hair)" } as CSSProperties}>
            <Avatar name={a.name} src={a.avatarUrl} size={size} />
          </span>
        ))}
      </div>
      <div className="leading-tight">
        <div className="text-[15px]">{names}</div>
        <div className="font-reading text-[14px]" style={{ color: "var(--ed-muted)" }}>
          {dateStr}
          {readingMinutes ? ` · ${readingMinutes} ${locale === "zh" ? "分钟阅读" : "min read"}` : ""}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/author-byline.test.tsx`
Expected: PASS (3 tests). Re-run the existing view test for no regression:
Run: `npx vitest run tests/cms/article-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/articles/AuthorByline.tsx tests/cms/author-byline.test.tsx
git commit -m "feat(articles): multi-author byline with avatar stack"
```

---

### Task 6: `ArticleView` — co-autores no header + cards de bio

**Files:**
- Modify: `components/cms/ArticleView.tsx` (`ArticleViewData` ~L6-15; header byline ~L61-65; bio card ~L79-97)
- Test: `tests/cms/article-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `AuthorByline` (with `coAuthors`), `Avatar`.
- Produces: `ArticleViewData.coAuthors?: AuthorProfile[]`; header byline shows co-authors; one "Written by" bio card per author/co-author that has a bio (primary first, then co-authors by name).

- [ ] **Step 1: Write the failing tests (append to existing file)**

Append to `tests/cms/article-view.test.tsx`, inside the `describe("ArticleView", () => { ... })` block (before its closing `})`):

```tsx
  const coAuthor = { id: "u2", name: "Gabe", avatarUrl: null, bio: "Ops and growth.", twitter: null }

  it("renders co-authors in the byline linking to their author pages", () => {
    const { container, getByText } = render(
      <ArticleView article={{ ...base, author, coAuthors: [coAuthor], readingMinutes: 4 }} locale="en" />,
    )
    expect(getByText("Gabe")).toBeTruthy()
    expect(container.querySelector('a[href="/authors/u2"]')).toBeTruthy()
  })

  it("renders a bio card per author and co-author that has a bio", () => {
    const { getByText } = render(
      <ArticleView article={{ ...base, author, coAuthors: [coAuthor], readingMinutes: 4 }} locale="en" />,
    )
    expect(getByText("Builder of Bitcoin-native things.")).toBeTruthy()
    expect(getByText("Ops and growth.")).toBeTruthy()
  })

  it("skips a co-author with no bio but still bylines them", () => {
    const { container, getByText, queryByText } = render(
      <ArticleView article={{ ...base, author, coAuthors: [{ ...coAuthor, bio: null }], readingMinutes: 4 }} locale="en" />,
    )
    expect(getByText("Builder of Bitcoin-native things.")).toBeTruthy()
    expect(queryByText("Ops and growth.")).toBeNull()
    expect(container.querySelector('a[href="/authors/u2"]')).toBeTruthy()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cms/article-view.test.tsx`
Expected: FAIL — `coAuthors` not rendered / "Gabe" + "Ops and growth." not found.

- [ ] **Step 3a: Add `coAuthors` to `ArticleViewData`**

In `components/cms/ArticleView.tsx`, in `interface ArticleViewData`, right after `author?: AuthorProfile`, add:

```ts
  coAuthors?: AuthorProfile[]
```

- [ ] **Step 3b: Pass `coAuthors` to the header byline**

Replace the `<AuthorByline ... />` line (~L63) with:

```tsx
            <AuthorByline author={author} coAuthors={article.coAuthors ?? []} publishedAt={article.publishedAt} readingMinutes={article.readingMinutes ?? 0} size={44} locale={locale} />
```

- [ ] **Step 3c: Replace the single bio card with a per-contributor list**

Replace the whole bio-card block (the `{author?.bio && authorHref ? ( <aside ...> ... </aside> ) : null}` JSX, ~L79-97) with:

```tsx
      {(() => {
        const contributors = [author, ...(article.coAuthors ?? [])].filter((a): a is AuthorProfile => Boolean(a?.bio))
        if (contributors.length === 0) return null
        return (
          <div className="mx-auto mt-14 max-w-[680px] space-y-4">
            {contributors.map((a, i) => {
              const href = locale === "zh" ? `/authors/${a.id}?lang=zh` : `/authors/${a.id}`
              return (
                <aside key={a.id} className="flex items-start gap-4 rounded-[14px] border p-5" style={{ borderColor: "var(--ed-hair)" }}>
                  <Avatar name={a.name} src={a.avatarUrl} size={48} />
                  <div>
                    {i === 0 ? (
                      <div className="font-display text-[11px] uppercase tracking-[1.5px]" style={{ color: "var(--ed-muted)" }}>
                        {locale === "zh" ? "作者" : "Written by"}
                      </div>
                    ) : null}
                    <Link href={href} className="font-display text-[15px] font-medium hover:underline" style={{ color: "var(--ed-ink)" }}>
                      {a.name}
                    </Link>
                    <p className="font-reading mt-1 text-[15px] leading-[1.6]" style={{ color: "var(--ed-body)" }}>
                      {a.bio}
                    </p>
                  </div>
                </aside>
              )
            })}
          </div>
        )
      })()}
```

Then **remove the now-unused `authorHref` const** (~L36, the line `const authorHref = author ? (...) : null`) — the new bio block computes its own `href` per author, so this const is dead code and the ESLint step in `npm run build` (`@typescript-eslint/no-unused-vars`) will flag it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cms/article-view.test.tsx`
Expected: PASS (all, including the 3 new + existing back-compat ones).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add components/cms/ArticleView.tsx tests/cms/article-view.test.tsx
git commit -m "feat(cms): show co-authors in ArticleView byline and bio cards"
```

---

### Task 7: `AdminEditor` — seletor de co-autores

**Files:**
- Modify: `components/cms/AdminEditor.tsx` (`EditorInitial` ~L20-30; component props ~L34; state ~L42-47; `submit()` ~L139-157; settings sidebar — add a section after Tags ~L351-355)
- Test: `tests/cms/admin-editor.test.tsx` (extend)

**Interfaces:**
- Consumes: `saveArticle` (action; now also takes `coAuthorIds`).
- Produces: `AdminEditor` accepts `members?: { id: string; name: string }[]` prop and `EditorInitial.coAuthorIds?: string[]`; renders a "Co-authors" chip selector; includes `coAuthorIds` in the `saveArticle` payload.

- [ ] **Step 1: Write the failing test (extend existing file)**

In `tests/cms/admin-editor.test.tsx`, first update the imports at the **top** of the file (ES imports must be top-level): change the testing-library import to include `fireEvent`, and add a `saveArticle` import from the already-mocked actions module:

```tsx
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { saveArticle } from "@/actions/cms/articles"
```

Then append this describe block at the **end** of the file (after the existing one):

```tsx
describe("AdminEditor -- co-authors", () => {
  const members = [
    { id: "u2", name: "Gabe" },
    { id: "u3", name: "Brooks" },
  ]

  it("renders a chip per member and submits the toggled co-author ids", async () => {
    vi.mocked(saveArticle).mockResolvedValue({ ok: true, slug: "s", id: "a1" } as never)
    const { getAllByText, getByRole } = render(
      <AdminEditor initial={{ ...initial, coAuthorIds: [] }} members={members} canPublish />,
    )
    // toggle Gabe on
    fireEvent.click(getByRole("button", { name: "Gabe" }))
    // save draft (there are two "Save draft" buttons — header + sidebar; click the first)
    fireEvent.click(getAllByText("Save draft")[0])
    await waitFor(() => expect(saveArticle).toHaveBeenCalled())
    const payload = vi.mocked(saveArticle).mock.calls[0][0] as { coAuthorIds: string[] }
    expect(payload.coAuthorIds).toEqual(["u2"])
  })

  it("pre-selects existing co-authors from initial.coAuthorIds", () => {
    const { getByRole } = render(
      <AdminEditor initial={{ ...initial, coAuthorIds: ["u3"] }} members={members} canPublish />,
    )
    expect(getByRole("button", { name: "Brooks" }).getAttribute("aria-pressed")).toBe("true")
    expect(getByRole("button", { name: "Gabe" }).getAttribute("aria-pressed")).toBe("false")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/admin-editor.test.tsx`
Expected: FAIL — `members` prop not accepted / no co-author chips.

- [ ] **Step 3a: Extend `EditorInitial` and component signature**

In `components/cms/AdminEditor.tsx`, add to `interface EditorInitial` (after `status: Status`):

```ts
  coAuthorIds?: string[]
```

Change the component signature (~L34) to accept `members`:

```tsx
export function AdminEditor({ initial, canPublish, canTranslate, members = [] }: { initial: EditorInitial; canPublish: boolean; canTranslate?: boolean; members?: { id: string; name: string }[] }) {
```

- [ ] **Step 3b: Add state**

After the existing `const [primaryLocale, setPrimaryLocale] = useState<Locale>(initial.primaryLocale)` line, add:

```tsx
  const [coAuthorIds, setCoAuthorIds] = useState<string[]>(initial.coAuthorIds ?? [])
  const toggleCoAuthor = (id: string) =>
    setCoAuthorIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
```

- [ ] **Step 3c: Include `coAuthorIds` in submit**

In `submit()`, in the object passed to `saveArticle`, add `coAuthorIds,` (e.g. right after `featured,`):

```tsx
        coAuthorIds,
```

- [ ] **Step 3d: Render the selector after the Tags block**

In the settings sidebar, right after the Tags `<div className="space-y-2"> ... </div>` block (the one containing the `Tags` label, ~L351-355), insert:

```tsx
            {members.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">Co-authors</Label>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const on = coAuthorIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleCoAuthor(m.id)}
                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                          on
                            ? "border-[#e9f0f7] bg-[#e9f0f7] text-[#212121]"
                            : "border-white/15 text-zinc-300 hover:border-white/30 hover:text-white"
                        }`}
                      >
                        {m.name}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-zinc-600">Members who helped write this article appear in the byline.</p>
              </div>
            )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/admin-editor.test.tsx`
Expected: PASS (existing 2 + new 2).

- [ ] **Step 5: Commit**

```bash
git add components/cms/AdminEditor.tsx tests/cms/admin-editor.test.tsx
git commit -m "feat(cms): co-author chip selector in the article editor"
```

---

### Task 8: Editor server pages — carregar membros + co-autores atuais

**Files:**
- Modify: `app/admin/articles/new/page.tsx`
- Modify: `app/admin/articles/[id]/page.tsx`
- Test: `tests/admin/new-article-coauthors.test.ts` (new, self-contained — leaves the existing `new-article-page.test.ts` untouched)

**Interfaces:**
- Consumes: `prisma.user.findMany`, `prisma.article.findUnique` (with `coAuthors`).
- Produces: both pages pass `members` (active users minus the primary author) + (`[id]`) `initial.coAuthorIds` into `AdminEditor`.

- [ ] **Step 1: Write the failing test (new file)**

Create `tests/admin/new-article-coauthors.test.ts` (self-contained — does NOT touch the existing `new-article-page.test.ts`, whose two tests don't mock prisma and would break if prisma were added there):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/components/cms/AdminEditor", () => ({ AdminEditor: () => null }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`)
  }),
}))
vi.mock("@/lib/prisma", () => ({ default: { user: { findMany: vi.fn() } } }))

import NewArticlePage from "@/app/admin/articles/new/page"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"

const fn = (m: unknown) => vi.mocked(m as never as ReturnType<typeof vi.fn>)
beforeEach(() => vi.clearAllMocks())

describe("new article page — co-author options", () => {
  it("passes active members (minus self) as co-author options", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({
      id: "u1", email: "a@b.io", name: "Vitor", role: "EDITOR", privileges: ["articles.publish"],
    } as never)
    fn(prisma.user.findMany).mockResolvedValue([{ id: "u2", name: "Gabe", email: "g@b.io" }])
    const editor = (await NewArticlePage()) as { props: { members: { id: string; name: string }[] } }
    expect(editor.props.members).toEqual([{ id: "u2", name: "Gabe" }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/admin/new-article-coauthors.test.ts`
Expected: FAIL — `editor.props.members` is undefined.

- [ ] **Step 3a: Add a shared member loader**

Add to `lib/cms/articles.ts` (export), after `getAuthorArticles` or near the other exports. It excludes the primary author in the DB query AND in-memory (the in-memory filter keeps unit tests deterministic against a mock that returns all rows; name falls back to email):

```ts
/** Active accounts offered as co-author options in the editor, excluding the
 *  given primary author. Name falls back to email. */
export async function getCoAuthorOptions(excludeId: string): Promise<{ id: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: { active: true, id: { not: excludeId } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  })
  return users
    .filter((u) => u.id !== excludeId)
    .map((u) => ({ id: u.id, name: u.name ?? u.email }))
}
```

- [ ] **Step 3b: Wire `new/page.tsx`**

In `app/admin/articles/new/page.tsx`, import the loader and pass `members`:

Change the import block to add:

```tsx
import { getCoAuthorOptions } from "@/lib/cms/articles"
```

After `const canPublish = ...`, add:

```tsx
  const members = await getCoAuthorOptions(user.id)
```

Change the `<AdminEditor ... />` to pass `members`:

```tsx
    <AdminEditor
      canPublish={canPublish}
      members={members}
      initial={{ slug: "", coverImage: "", tags: [], featured: false, primaryLocale: "en", status: "DRAFT", en: empty, zh: empty }}
    />
```

- [ ] **Step 3c: Wire `[id]/page.tsx`**

In `app/admin/articles/[id]/page.tsx`:

Add the import:

```tsx
import { getCoAuthorOptions } from "@/lib/cms/articles"
```

Change the prisma query to include `coAuthors`:

```tsx
  const article = await prisma.article.findUnique({
    where: { id },
    include: { tags: true, translations: true, coAuthors: { select: { id: true } } },
  })
```

After `const canTranslate = ...`, add:

```tsx
  const members = await getCoAuthorOptions(article.authorId)
```

Change the `<AdminEditor ... />` to pass `members` and `coAuthorIds`:

```tsx
    <AdminEditor
      canPublish={canPublish}
      canTranslate={canTranslate}
      members={members}
      initial={{
        id: article.id,
        slug: article.slug,
        coverImage: article.coverImage ?? "",
        tags: article.tags.map((t) => t.name),
        featured: article.featured,
        primaryLocale: article.primaryLocale as "en" | "zh",
        status: article.status,
        coAuthorIds: article.coAuthors.map((c) => c.id),
        en: tr("en"),
        zh: tr("zh"),
      }}
    />
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/admin/new-article-coauthors.test.ts tests/admin/new-article-page.test.ts`
Expected: PASS (new 1 + existing 2 untouched).
Run: `npx prisma generate && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/cms/articles.ts app/admin/articles/new/page.tsx "app/admin/articles/[id]/page.tsx" tests/admin/new-article-coauthors.test.ts
git commit -m "feat(admin): load co-author options + current co-authors into the editor"
```

---

### Task 9: Leitor público + preview admin — passar co-autores

**Files:**
- Modify: `app/articles/[slug]/page.tsx` (ArticleView call ~L132-135; `generateMetadata` authors ~L59, L69)
- Modify: `app/admin/articles/[id]/preview/page.tsx` (prisma include ~L28; ArticleView call ~L60-80)

**Interfaces:**
- Consumes: `ArticleFull.coAuthors` (public), `prisma ... coAuthors` (preview).
- Produces: both pages pass `coAuthors` to `ArticleView`; public metadata `authors` includes co-authors.

- [ ] **Step 1: Wire the public reader page**

In `app/articles/[slug]/page.tsx`, change the `<ArticleView article={{ ... }} />` (~L133) to add `coAuthors`:

```tsx
        article={{ title: a.title, excerpt: a.excerpt, body: a.body, sources: a.sources, publishedAt: a.publishedAt, tags: a.tags, author: a.author, coAuthors: a.coAuthors, readingMinutes: a.readingMinutes }}
```

In `generateMetadata`, change the `authors:` line (~L59) to include co-authors:

```tsx
    authors: [a.author, ...a.coAuthors].map((au) => ({ name: au.name, url: authorUrl(au.id, locale) })),
```

And the openGraph `authors:` line (~L69):

```tsx
      authors: [a.author, ...a.coAuthors].map((au) => au.name),
```

- [ ] **Step 2: Wire the preview admin page**

In `app/admin/articles/[id]/preview/page.tsx`, change the prisma query (~L28) to include `coAuthors`:

```tsx
  const article = await prisma.article.findUnique({
    where: { id },
    include: { tags: true, translations: true, author: true, coAuthors: true },
  })
```

In the `<ArticleView article={{ ... }} />` call, add `coAuthors` after the `author: { ... },` block:

```tsx
            coAuthors: article.coAuthors.map((u) => ({
              id: u.id,
              name: u.name ?? u.email,
              avatarUrl: u.avatarUrl,
              bio: u.bio,
              twitter: u.twitter,
            })),
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "app/articles/[slug]/page.tsx" "app/admin/articles/[id]/preview/page.tsx"
git commit -m "feat(articles): pass co-authors to reader, preview, and SEO metadata"
```

---

### Task 10: Home widget + busca — co-autores no card e no índice

**Files:**
- Modify: `components/articles/LatestArticles.tsx` (`Preview` interface ~L9-18; author line ~L57-63)
- Modify: `components/articles/ArticleSearchPrompt.tsx` (search index ~L19-30)
- Test: `tests/articles/latest-articles.test.tsx` (create)

**Interfaces:**
- Consumes: `ArticlePreview.coAuthors` (via `/api/articles`), `formatAuthorNames`.
- Produces: home card shows "X and Y"; search index includes co-author names.

- [ ] **Step 1: Write the failing test**

Create `tests/articles/latest-articles.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, waitFor } from "@testing-library/react"
import LatestArticles from "@/components/articles/LatestArticles"

beforeEach(() => cleanup())

const article = {
  slug: "a",
  title: "Liquidity Weekly",
  excerpt: "Brief.",
  coverImage: null,
  publishedAt: "2026-06-22T12:00:00.000Z",
  readingMinutes: 4,
  author: { name: "Vitor", avatarUrl: null },
  coAuthors: [{ name: "Gabe", avatarUrl: null }],
  tags: [{ slug: "research", name: "Research" }],
}

describe("LatestArticles — co-authors", () => {
  it("renders the author and co-author together", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ articles: [article] }) })) as never)
    const { getByText } = render(<LatestArticles />)
    await waitFor(() => expect(getByText(/Vitor and Gabe/)).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/articles/latest-articles.test.tsx`
Expected: FAIL — only "Vitor" rendered, "Vitor and Gabe" not found.

- [ ] **Step 3a: Extend the home widget**

In `components/articles/LatestArticles.tsx`:

Add the import at the top:

```tsx
import { formatAuthorNames } from "@/lib/cms/author-format"
```

Extend the `Preview` interface — add after the `author: { name: string; avatarUrl: string | null }` line:

```tsx
  coAuthors?: { name: string; avatarUrl: string | null }[]
```

Replace the author line (`<span>{a.author.name}</span><span>·</span><span>{a.readingMinutes} min</span>`) with:

```tsx
                <span>{formatAuthorNames([a.author.name, ...(a.coAuthors ?? []).map((c) => c.name)], "en")}</span><span>·</span><span>{a.readingMinutes} min</span>
```

- [ ] **Step 3b: Extend the search index**

In `components/articles/ArticleSearchPrompt.tsx`, in the `text:` array (which contains `article.author.name`), add right after that line:

```tsx
          ...(article.coAuthors ?? []).map((c) => c.name),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/articles/latest-articles.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add components/articles/LatestArticles.tsx components/articles/ArticleSearchPrompt.tsx tests/articles/latest-articles.test.tsx
git commit -m "feat(articles): co-authors on the home widget and search index"
```

---

### Task 11: Gates finais + verificação funcional

**Files:** none (verification only)

- [ ] **Step 1: Full gate run**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma generate && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0 errors · vitest all pass · build 0 errors.

- [ ] **Step 2: Manual functional check (local dev)**

Run the app (`npm run dev`), then:
- Editar um artigo, marcar 1-2 co-autores nos chips, salvar → reabrir o editor → chips continuam marcados (round-trip).
- Abrir o preview admin (`/admin/articles/<id>/preview`) → byline mostra "Autor and CoAutor"; um card "Written by" pra cada autor com bio.
- Abrir o leitor público do artigo publicado → mesmo byline + cards de bio.
- Abrir a home → o card do artigo mostra "Autor and CoAutor".
- Um artigo SEM co-autor renderiza idêntico ao de antes (byline só do autor, 1 card de bio).

- [ ] **Step 3: Final commit (se algo foi ajustado na verificação)**

```bash
git add -A && git commit -m "test(articles): co-author feature gates green"
```

(Se nada mudou, pular.)

---

## Notas de deploy (human-owned — Vitor dá o go)

- PR `feat/article-coauthors` → review → merge na `main`.
- Bump `newTag` no `k8s/…kustomization.yaml` (⚠️ **com aspas**, ex.: `newTag: "abc1234"` — SHA `\d+e\d+` vira float YAML e quebra). Anotar o GitRepository (source) ANTES do Kustomization ao reconciliar o Flux.
- O init container roda `prisma db push` no boot → cria a join table `_CoAuthoredArticles` (aditivo).
