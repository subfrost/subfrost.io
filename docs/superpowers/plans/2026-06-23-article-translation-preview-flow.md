# Article translation + preview phase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Claude translation step (saved statically to the DB) and a full-page, admin-only, shareable preview with one-button publish, to the subfrost.io article flow.

**Architecture:** A pure prompt-builder + thin `@anthropic-ai/sdk` call (`lib/cms/translate.ts`) behind a gated server action that persists the translation to `ArticleTranslation` + `Revision`. A shared `<ArticleView>` component (extracted from the public article page) renders both the public page and a new `/admin/articles/[id]/preview` route identically; publish reuses `upsertArticle`. No schema migration.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Prisma/Postgres, `@anthropic-ai/sdk` (new), Zod, Vitest + @testing-library/react.

## Global Constraints

- **Model:** `claude-opus-4-8` exactly (confirmed). Single exported constant `TRANSLATE_MODEL`.
- **Graceful:** translation only runs when `ANTHROPIC_API_KEY` is set. Absent → action returns `{ ok:false, unavailable:true }`, button disabled, build unaffected. Never throw into build/UI.
- **`@anthropic-ai/sdk` server-side only** — the key never reaches the client. Use structured outputs (`messages.parse()` + `zodOutputFormat`) → validated `{title, excerpt, body}`, no prefill/preamble.
- **No Prisma migration.** `ArticleTranslation` already has `en`/`zh`; preview is admin-only (no token model).
- Translate **title + excerpt + body**; prompt must instruct preserving Markdown exactly.
- Gating: translate = `articles.write` (+ author-or-`edit_any`); publish-from-preview = `articles.publish` (else `REVIEW`).
- branch → PR → merge → bump `newTag` via PR → Flux. Windows + Git Bash. Gates: `tsc` 0 · `CI=true vitest run` green · `next build` 0.

---

### Task 1: Translation engine + dependency

**Files:**
- Modify: `package.json` (add `@anthropic-ai/sdk`)
- Create: `lib/cms/translate.ts`
- Test: `tests/cms/translate.test.ts`

**Interfaces:**
- Produces:
  - `TRANSLATE_MODEL = "claude-opus-4-8"`
  - `LOCALE_NAME: Record<"en"|"zh", string>`
  - `TranslationContent = { title: string; excerpt: string; body: string }`
  - `buildTranslationRequest(source: TranslationContent, from: "en"|"zh", to: "en"|"zh"): { system: string; userText: string }` (pure)
  - `translationUnavailable(): boolean`
  - `async translate(source: TranslationContent, from: "en"|"zh", to: "en"|"zh"): Promise<TranslationContent>`

- [ ] **Step 1: Add the dependency**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npm install @anthropic-ai/sdk@^0.70.0 --save 2>&1 | tail -5`
(If that exact version errors, install latest: `npm install @anthropic-ai/sdk --save`.) Expected: `package.json` + lockfile updated; no peer-dep errors that fail the install.

- [ ] **Step 2: Write the failing pure test**

Create `tests/cms/translate.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest"
import { buildTranslationRequest, translationUnavailable, LOCALE_NAME } from "@/lib/cms/translate"

describe("buildTranslationRequest", () => {
  const src = { title: "Hello", excerpt: "Intro", body: "# Heading\n\n- item\n\n`code`" }
  it("names both languages and asks to preserve Markdown", () => {
    const { system, userText } = buildTranslationRequest(src, "en", "zh")
    expect(system).toContain(LOCALE_NAME.en)
    expect(system).toContain(LOCALE_NAME.zh)
    expect(system.toLowerCase()).toContain("markdown")
    expect(userText).toContain("Hello")
    expect(userText).toContain("# Heading")
  })
})

describe("translationUnavailable", () => {
  const prev = process.env.ANTHROPIC_API_KEY
  afterEach(() => { if (prev === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prev })
  it("is true without a key, false with one", () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(translationUnavailable()).toBe(true)
    process.env.ANTHROPIC_API_KEY = "sk-test"
    expect(translationUnavailable()).toBe(false)
  })
})
```

- [ ] **Step 3: Run it (fail)**

Run: `CI=true npx vitest run tests/cms/translate.test.ts`
Expected: FAIL — cannot resolve `@/lib/cms/translate`.

- [ ] **Step 4: Write `lib/cms/translate.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"

export type Locale = "en" | "zh"
export interface TranslationContent { title: string; excerpt: string; body: string }

export const TRANSLATE_MODEL = "claude-opus-4-8"
export const LOCALE_NAME: Record<Locale, string> = {
  en: "English",
  zh: "Simplified Chinese (中文)",
}

const TranslationSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
  body: z.string(),
})

/** Pure: compose the translator system prompt + the source payload. No SDK/network. */
export function buildTranslationRequest(source: TranslationContent, from: Locale, to: Locale): { system: string; userText: string } {
  const system =
    `You are a professional translator for a Bitcoin/DeFi publication. ` +
    `Translate the article from ${LOCALE_NAME[from]} to ${LOCALE_NAME[to]}. ` +
    `The body is Markdown — preserve its structure exactly: headings, lists, blockquotes, links, and fenced code blocks. ` +
    `Do not translate code, URLs, or proper nouns/ticker symbols (e.g. SUBFROST, frBTC, DIESEL, Bitcoin). ` +
    `Keep the author's tone. Return only the translated title, excerpt, and body.`
  const userText =
    `TITLE:\n${source.title}\n\nEXCERPT:\n${source.excerpt}\n\nBODY (Markdown):\n${source.body}`
  return { system, userText }
}

/** True when the Claude service isn't configured (graceful no-op). */
export function translationUnavailable(): boolean {
  return !process.env.ANTHROPIC_API_KEY
}

/** Translate via Claude using structured outputs. Throws on parse/API failure. */
export async function translate(source: TranslationContent, from: Locale, to: Locale): Promise<TranslationContent> {
  const { system, userText } = buildTranslationRequest(source, from, to)
  const client = new Anthropic()
  const res = await client.messages.parse({
    model: TRANSLATE_MODEL,
    max_tokens: 16000,
    system,
    output_config: { format: zodOutputFormat(TranslationSchema) },
    messages: [{ role: "user", content: userText }],
  })
  if (!res.parsed_output) throw new Error("Translation returned no structured output")
  return res.parsed_output
}
```

- [ ] **Step 5: Run it (pass)**

Run: `CI=true npx vitest run tests/cms/translate.test.ts`
Expected: PASS. If `zodOutputFormat` import path errors under tsc, confirm the SDK exports `@anthropic-ai/sdk/helpers/zod` (it does as of recent versions); otherwise WebFetch the SDK repo for the current helper path before changing the import.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.

```bash
git add package.json package-lock.json pnpm-lock.yaml lib/cms/translate.ts tests/cms/translate.test.ts 2>/dev/null; git commit -m "feat(cms): Claude translation engine (lib/cms/translate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Only the lockfile that exists will be staged.)

---

### Task 2: `translateArticleAction` (gated, persists to DB)

**Files:**
- Modify: `actions/cms/articles.ts`
- Test: `tests/cms/translate-action.test.ts`

**Interfaces:**
- Consumes: `currentUser` (`@/lib/cms/authz`), `translate` + `translationUnavailable` (`@/lib/cms/translate`), `prisma` (`@/lib/prisma`).
- Produces: `translateArticleAction(articleId: string, from: Locale, to: Locale): Promise<{ ok: true; translation: TranslationContent } | { ok: false; error: string; unavailable?: boolean }>`

- [ ] **Step 1: Write the failing test**

Create `tests/cms/translate-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/translate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms/translate")>()
  return { ...actual, translate: vi.fn(), translationUnavailable: vi.fn() }
})
vi.mock("@/lib/prisma", () => ({
  default: {
    article: { findUnique: vi.fn() },
    articleTranslation: { findUnique: vi.fn(), upsert: vi.fn() },
    revision: { create: vi.fn() },
  },
}))

import { translateArticleAction } from "@/actions/cms/articles"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable } from "@/lib/cms/translate"
import prisma from "@/lib/prisma"

const asUser = (privileges: string[], id = "u1") =>
  ({ id, email: "a@b.io", name: null, role: "AUTHOR", privileges }) as never

beforeEach(() => vi.clearAllMocks())

describe("translateArticleAction", () => {
  it("rejects a caller without articles.write", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]))
    const res = await translateArticleAction("a1", "en", "zh")
    expect(res.ok).toBe(false)
    expect(translate).not.toHaveBeenCalled()
  })

  it("returns unavailable when no API key (no SDK call)", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.write"]))
    vi.mocked(prisma.article.findUnique as any).mockResolvedValueOnce({ id: "a1", authorId: "u1" })
    vi.mocked(translationUnavailable).mockReturnValueOnce(true)
    const res = await translateArticleAction("a1", "en", "zh")
    expect(res).toMatchObject({ ok: false, unavailable: true })
    expect(translate).not.toHaveBeenCalled()
  })

  it("translates and persists the target locale + a revision", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.write"]))
    vi.mocked(prisma.article.findUnique as any).mockResolvedValueOnce({ id: "a1", authorId: "u1" })
    vi.mocked(translationUnavailable).mockReturnValueOnce(false)
    vi.mocked(prisma.articleTranslation.findUnique as any).mockResolvedValueOnce({ title: "Hi", excerpt: "x", body: "# H" })
    vi.mocked(translate as any).mockResolvedValueOnce({ title: "你好", excerpt: "x", body: "# H" })
    const res = await translateArticleAction("a1", "en", "zh")
    expect(res.ok).toBe(true)
    expect(prisma.articleTranslation.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.revision.create).toHaveBeenCalledTimes(1)
    if (res.ok) expect(res.translation.title).toBe("你好")
  })
})
```

- [ ] **Step 2: Run it (fail)**

Run: `CI=true npx vitest run tests/cms/translate-action.test.ts`
Expected: FAIL — `translateArticleAction` is not exported.

- [ ] **Step 3: Implement the action**

Append to `actions/cms/articles.ts` (add imports at top: `import { translate, translationUnavailable, type Locale, type TranslationContent } from "@/lib/cms/translate"`):

```ts
export type TranslateResult =
  | { ok: true; translation: TranslationContent }
  | { ok: false; error: string; unavailable?: boolean }

export async function translateArticleAction(articleId: string, from: Locale, to: Locale): Promise<TranslateResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes("articles.write")) return { ok: false, error: "Not allowed" }

  const article = await prisma.article.findUnique({ where: { id: articleId } })
  if (!article) return { ok: false, error: "Article not found" }
  if (!user.privileges.includes("articles.edit_any") && article.authorId !== user.id) {
    return { ok: false, error: "You can only edit your own articles" }
  }

  if (translationUnavailable()) return { ok: false, error: "Translation service not configured", unavailable: true }

  const sourceRow = await prisma.articleTranslation.findUnique({
    where: { articleId_locale: { articleId, locale: from } },
  })
  if (!sourceRow || !sourceRow.title.trim()) return { ok: false, error: `Nothing to translate in ${from}` }

  let out: TranslationContent
  try {
    out = await translate({ title: sourceRow.title, excerpt: sourceRow.excerpt, body: sourceRow.body }, from, to)
  } catch {
    return { ok: false, error: "Translation failed" }
  }

  await prisma.articleTranslation.upsert({
    where: { articleId_locale: { articleId, locale: to } },
    update: { title: out.title, excerpt: out.excerpt, body: out.body },
    create: { articleId, locale: to, title: out.title, excerpt: out.excerpt, body: out.body },
  })
  await prisma.revision.create({ data: { articleId, locale: to, title: out.title, body: out.body, editorId: user.id } })
  return { ok: true, translation: out }
}
```

- [ ] **Step 4: Run it (pass)**

Run: `CI=true npx vitest run tests/cms/translate-action.test.ts`
Expected: PASS (3 tests). Then `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add actions/cms/articles.ts tests/cms/translate-action.test.ts
git commit -m "feat(cms): translateArticleAction — gated, persists translation + revision

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Shared `<ArticleView>` (extract from the public page)

**Files:**
- Create: `components/cms/ArticleView.tsx`
- Modify: `app/articles/[slug]/page.tsx` (render `<ArticleView>`; keep metadata + JSON-LD)
- Test: `tests/cms/article-view.test.tsx`

**Interfaces:**
- Produces: `ArticleView({ article, locale }: { article: { title: string; excerpt: string; body: string; publishedAt: string | null; tags: { slug: string; name: string }[] }; locale: "en"|"zh" })` — renders the `<article>` header (date + primary tag, `<h1>`, excerpt) + `<Markdown variant="article">{body}</Markdown>`, identical to the current public markup.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/article-view.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { ArticleView } from "@/components/cms/ArticleView"

beforeEach(() => cleanup())

describe("ArticleView", () => {
  const article = {
    title: "Liquidity Weekly",
    excerpt: "A field briefing.",
    body: "# Liquidity Weekly\n\nBody text here.",
    publishedAt: "2026-06-22T12:00:00.000Z",
    tags: [{ slug: "research", name: "Research" }],
  }
  it("renders the title, excerpt, and body", () => {
    const { getByText, getByRole } = render(<ArticleView article={article} locale="en" />)
    expect(getByRole("heading", { level: 1 }).textContent).toContain("Liquidity Weekly")
    expect(getByText("A field briefing.")).toBeTruthy()
    expect(getByText("Body text here.")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it (fail)**

Run: `CI=true npx vitest run tests/cms/article-view.test.tsx`
Expected: FAIL — cannot resolve `@/components/cms/ArticleView`.

- [ ] **Step 3: Create the component**

Create `components/cms/ArticleView.tsx` (move the `categoryLabel` helper + the `<article>` block out of the public page; copy the exact classes/styles from [app/articles/[slug]/page.tsx:21-28,136-163](app/articles/[slug]/page.tsx)):

```tsx
import { Markdown } from "@/lib/cms/markdown"
import type { CmsLocale } from "@/lib/cms/articles"

export interface ArticleViewData {
  title: string
  excerpt: string
  body: string
  publishedAt: string | null
  tags: { slug: string; name: string }[]
}

function categoryLabel(tag: { slug: string; name: string }, locale: CmsLocale): string | null {
  const value = tag.slug.toLowerCase()
  if (value === "local-mock") return null
  if (["operations", "ops", "protocol", "frbtc"].includes(value)) return locale === "zh" ? "协议" : "Protocol"
  if (["product", "release", "releases", "docs", "documentation", "subfrost"].includes(value)) return locale === "zh" ? "开发者" : "Developer"
  if (["research", "bitcoin", "alkanes"].includes(value)) return locale === "zh" ? "研究" : tag.name
  return tag.name
}

export function ArticleView({ article, locale }: { article: ArticleViewData; locale: CmsLocale }) {
  const fallback = locale === "zh" ? "文章" : "Article"
  const primaryTag = article.tags.map((t) => categoryLabel(t, locale)).find((t): t is string => Boolean(t)) ?? fallback
  return (
    <article className="mx-auto px-6 pb-20 pt-24 sm:px-8 lg:pt-28">
      <header className="mx-auto max-w-[920px] text-center">
        <div className="font-display mb-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
          {article.publishedAt ? (
            <span>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}</span>
          ) : null}
          <span>{primaryTag}</span>
        </div>
        <h1 className="font-display mx-auto max-w-[920px] text-balance text-[38px] font-medium leading-[1.02] sm:text-[56px] lg:text-[64px]" style={{ color: "var(--ed-ink)" }}>
          {article.title}
        </h1>
        {article.excerpt ? (
          <p className="font-display mx-auto mt-7 max-w-[620px] text-[17px] leading-[1.55]" style={{ color: "var(--ed-ink)" }}>{article.excerpt}</p>
        ) : null}
      </header>
      <div className="mx-auto mt-24 max-w-[680px]">
        <Markdown variant="article">{article.body}</Markdown>
      </div>
    </article>
  )
}

export { categoryLabel }
```

- [ ] **Step 4: Refactor the public page to use it**

In `app/articles/[slug]/page.tsx`: import `ArticleView` (and import `categoryLabel` from the component instead of the local copy — used by `generateMetadata`); replace the inline `<article>…</article>` JSX (lines ~136-163) with `<ArticleView article={a} locale={locale} />` (keep the surrounding `<script type="application/ld+json">` and `generateMetadata` exactly). Delete the now-duplicate local `categoryLabel`.

- [ ] **Step 5: Run tests (pass) + typecheck**

Run: `CI=true npx vitest run tests/cms/article-view.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc 0. The public page renders byte-identical markup (same classes/styles moved verbatim).

- [ ] **Step 6: Commit**

```bash
git add components/cms/ArticleView.tsx app/articles/[slug]/page.tsx tests/cms/article-view.test.tsx
git commit -m "refactor(cms): extract shared ArticleView for public page + preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: "Translate with Claude" button in the editor

**Files:**
- Modify: `components/cms/AdminEditor.tsx`
- Modify: `app/admin/articles/[id]/page.tsx` (pass `canTranslate`)

**Interfaces:**
- Consumes: `translateArticleAction` (Task 2), `translationUnavailable` (Task 1).
- `AdminEditor` gains a `canTranslate?: boolean` prop.

- [ ] **Step 1: Wire `canTranslate` from the edit page**

In `app/admin/articles/[id]/page.tsx`: `import { translationUnavailable } from "@/lib/cms/translate"`, compute `const canTranslate = !translationUnavailable()`, and pass `canTranslate={canTranslate}` to `<AdminEditor>`. (The `new` page can pass `canTranslate={false}` — translation needs a saved article id.)

- [ ] **Step 2: Add the button + handler in `AdminEditor.tsx`**

Add to the imports: `import { saveArticle, deleteArticle, translateArticleAction } from "@/actions/cms/articles"`. Extend the props type with `canTranslate?: boolean`. Add state `const [translating, setTranslating] = useState(false)`. Add a handler:

```tsx
function onTranslate() {
  if (!initial.id) return
  const from = activeLocale
  const to: Locale = from === "en" ? "zh" : "en"
  if (content[to].title.trim() && !confirm(`Overwrite the ${LOCALE_LABEL[to]} translation with a new Claude translation?`)) return
  setError(null); setTranslating(true)
  translateArticleAction(initial.id, from, to)
    .then((res) => {
      if (res.ok) setContent((c) => ({ ...c, [to]: res.translation }))
      else setError(res.error)
    })
    .finally(() => setTranslating(false))
}
```

(`Locale` is the local type already defined in this file.) In the Publish card (near the Save/Publish buttons), add — only when editing an existing article:

```tsx
{initial.id && (
  <Button size="sm" variant="outline" onClick={onTranslate}
    disabled={pending || translating || !canTranslate}
    title={canTranslate ? "Translate the current language into the other with Claude" : "Claude translation isn't configured"}>
    {translating ? "Translating…" : `Translate ${activeLocale === "en" ? "EN→中文" : "中文→EN"} with Claude`}
  </Button>
)}
```

- [ ] **Step 3: Typecheck + targeted tests**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/cms/` → tsc 0, suite green (no test asserts the old AdminEditor shape in a way this breaks; if one does, update it).

- [ ] **Step 4: Commit**

```bash
git add components/cms/AdminEditor.tsx app/admin/articles/[id]/page.tsx
git commit -m "feat(cms): Translate with Claude button in the editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Preview route + one-button publish

**Files:**
- Create: `app/admin/articles/[id]/preview/page.tsx`
- Create: `components/cms/PreviewActions.tsx`
- Modify: `actions/cms/articles.ts` (add `publishArticleAction`)
- Modify: `app/admin/articles/[id]/page.tsx` + `app/admin/articles/page.tsx` (link to preview)
- Test: `tests/cms/publish-action.test.ts`

**Interfaces:**
- Produces: `publishArticleAction(id: string): Promise<ActionResult>` (reuses `upsertArticle`); `PreviewActions({ id, slug, canPublish }: { id: string; slug: string; canPublish: boolean })`.

- [ ] **Step 1: Failing test for `publishArticleAction`**

Create `tests/cms/publish-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cms/article-write", () => ({ upsertArticle: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: { article: { findUnique: vi.fn() }, articleTranslation: { findMany: vi.fn() } },
}))

import { publishArticleAction } from "@/actions/cms/articles"
import { currentUser } from "@/lib/cms/authz"
import { upsertArticle } from "@/lib/cms/article-write"
import prisma from "@/lib/prisma"

const asUser = (privileges: string[]) => ({ id: "u1", email: "a@b.io", name: null, role: "EDITOR", privileges }) as never

beforeEach(() => vi.clearAllMocks())

it("requires authentication", async () => {
  vi.mocked(currentUser).mockResolvedValueOnce(null)
  expect((await publishArticleAction("a1")).ok).toBe(false)
})

it("publishes via upsertArticle keeping the slug", async () => {
  vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.publish"]))
  vi.mocked(prisma.article.findUnique as any).mockResolvedValueOnce({
    id: "a1", slug: "my-post", coverImage: null, featured: false, primaryLocale: "en", authorId: "u1", tags: [],
  })
  vi.mocked(prisma.articleTranslation.findMany as any).mockResolvedValueOnce([{ locale: "en", title: "T", excerpt: "", body: "B" }])
  vi.mocked(upsertArticle as any).mockResolvedValueOnce({ ok: true, slug: "my-post", id: "a1" })
  const res = await publishArticleAction("a1")
  expect(res.ok).toBe(true)
  const arg = vi.mocked(upsertArticle).mock.calls[0][1] as any
  expect(arg.id).toBe("a1")
  expect(arg.status).toBe("PUBLISHED")
})
```

- [ ] **Step 2: Run it (fail)**

Run: `CI=true npx vitest run tests/cms/publish-action.test.ts`
Expected: FAIL — `publishArticleAction` not exported.

- [ ] **Step 3: Implement `publishArticleAction`**

Append to `actions/cms/articles.ts`:

```ts
export async function publishArticleAction(id: string): Promise<ActionResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  const article = await prisma.article.findUnique({ where: { id }, include: { tags: true } })
  if (!article) return { ok: false, error: "Article not found" }
  if (!user.privileges.includes("articles.edit_any") && article.authorId !== user.id) {
    return { ok: false, error: "Not allowed" }
  }
  const translations = await prisma.articleTranslation.findMany({ where: { articleId: id } })
  const res = await upsertArticle(
    { id: user.id, privileges: user.privileges },
    {
      id,
      slug: article.slug,
      coverImage: article.coverImage ?? "",
      tags: article.tags.map((t) => t.name),
      featured: article.featured,
      primaryLocale: article.primaryLocale as "en" | "zh",
      status: "PUBLISHED",
      translations: {
        en: translations.find((t) => t.locale === "en") ?? undefined,
        zh: translations.find((t) => t.locale === "zh") ?? undefined,
      },
    },
  )
  if (res.ok) revalidateArticle(res.slug)
  return res
}
```

(`upsertArticle` already downgrades `PUBLISHED → REVIEW` when the actor lacks `articles.publish`, so the "Submit for review" path is handled server-side. `revalidateArticle` already exists in this file.)

- [ ] **Step 4: Run it (pass) + typecheck**

Run: `CI=true npx vitest run tests/cms/publish-action.test.ts && npx tsc --noEmit` → PASS, 0.

- [ ] **Step 5: PreviewActions component**

Create `components/cms/PreviewActions.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { publishArticleAction } from "@/actions/cms/articles"

export function PreviewActions({ id, slug, canPublish }: { id: string; slug: string; canPublish: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  function go() {
    setError(null)
    startTransition(async () => {
      const res = await publishArticleAction(id)
      if (res.ok) { router.push(`/articles/${res.slug}`) } else setError(res.error)
    })
  }
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" onClick={go} disabled={pending}>
        {canPublish ? "Publish" : "Submit for review"}
      </Button>
      <span className="text-xs text-zinc-500">/articles/{slug}</span>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 6: Preview page**

Create `app/admin/articles/[id]/preview/page.tsx`:

```tsx
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { ArticleView } from "@/components/cms/ArticleView"
import { PreviewActions } from "@/components/cms/PreviewActions"

export const dynamic = "force-dynamic"

export default async function PreviewArticlePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { id } = await params
  const { lang } = await searchParams
  const user = await currentUser()
  if (!user) redirect("/admin/login")

  const article = await prisma.article.findUnique({ where: { id }, include: { tags: true, translations: true } })
  if (!article) notFound()
  const canPublish = user.privileges.includes("articles.publish")
  if (!canPublish && article.authorId !== user.id) redirect("/admin/articles")

  const available = article.translations.map((t) => t.locale as "en" | "zh")
  const locale: "en" | "zh" = lang === "zh" && available.includes("zh") ? "zh"
    : lang === "en" && available.includes("en") ? "en"
    : (article.primaryLocale as "en" | "zh")
  const tr = article.translations.find((t) => t.locale === locale) ?? article.translations[0]
  if (!tr) notFound()

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/admin/articles/${id}`} className="text-zinc-400 hover:text-white">← Edit</Link>
          <span className="rounded-full border border-amber-700/60 px-2 py-0.5 text-xs text-amber-300">Preview · {article.status}</span>
          <div className="flex gap-1">
            {available.map((loc) => (
              <Link key={loc} href={`/admin/articles/${id}/preview?lang=${loc}`}
                className={`rounded px-2 py-0.5 text-xs ${loc === locale ? "bg-zinc-800 text-white" : "text-zinc-400"}`}>
                {loc === "en" ? "English" : "中文"}
              </Link>
            ))}
          </div>
        </div>
        <PreviewActions id={id} slug={article.slug} canPublish={canPublish} />
      </div>
      <div className="bg-white">
        <ArticleView
          article={{ title: tr.title, excerpt: tr.excerpt, body: tr.body, publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null, tags: article.tags }}
          locale={locale}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Link to the preview from editor + list**

In `app/admin/articles/[id]/page.tsx`, add near the `<h1>`: `<Link href={`/admin/articles/${article.id}/preview`} ...>Preview</Link>`. In `app/admin/articles/page.tsx`, add a "Preview" link in each row's title cell (`/admin/articles/${a.id}/preview`).

- [ ] **Step 8: Gate + commit**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/cms/` → 0, green.

```bash
git add app/admin/articles components/cms/PreviewActions.tsx actions/cms/articles.ts tests/cms/publish-action.test.ts
git commit -m "feat(cms): admin preview route + one-button publish (keeps slug)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1:** `npx tsc --noEmit` → 0.
- [ ] **Step 2:** `CI=true npx vitest run` → green (new tests pass; prior tests still pass).
- [ ] **Step 3:** `npx next build` → 0 (the article page + new preview route compile; `@anthropic-ai/sdk` only imported server-side).
- [ ] **Step 4:** `git diff --stat main -- prisma/schema.prisma` → empty (no migration).
