# Article editor — 3 improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate per-locale "Sources" field, paste/drag-drop image upload in the article body, and fix image overflow + the preview that scrolls off-screen — in `subfrost.io/admin` + the public article render.

**Architecture:** All three are additive. Sources threads a new optional `ArticleTranslation.sources` column through the write path (article-write), read path (articles.ts), render (ArticleView), editor UI, and the Claude translate flow. Image upload reuses the existing `/api/admin/upload` (`kind=inline`) with two small pure utils + thin textarea event wiring. The image/preview fix is CSS + a layout breakout so the preview stops overflowing while keeping the admin sidebar.

**Tech Stack:** Next.js 16 App Router, React 19 (client components), Prisma 5 / Postgres, Zod v3, `@anthropic-ai/sdk`, Vitest + @testing-library/react (happy-dom), Tailwind, GCS.

## Global Constraints

- **Branch → PR → merge, NEVER push to main.** Branch already created: `feat/article-editor-features`.
- **Gates (run before each PR):** `npx tsc --noEmit` → 0 · `CI=true npx vitest run` → green · `npx next build` → 0 (pre-existing Windows `EINVAL` copy warnings on the standalone trace are benign).
- **Prisma:** schema is applied in prod by the `prisma db push` init container in `k8s/deployment.yaml` (no migrations folder). When the schema changes, run `npx prisma db push` then `npx prisma generate` **before** `tsc` locally.
- **Sources field:** per-locale (lives in `ArticleTranslation`), **optional** (empty → section is NOT rendered), accepts **Markdown**, translated by Claude.
- **Image upload:** body only (cover stays a URL field); both **paste and drop**; `POST /api/admin/upload` with `kind=inline`; allowed png/jpeg/webp/gif/avif, ≤8MB (enforced server-side, surface its error).
- **Translate model:** `claude-opus-4-8` (existing `TRANSLATE_MODEL`, do not change).
- **Env:** Windows + Git Bash. `pnpm` for installs. Zod **v3**. No PowerShell heredocs.
- **Each commit ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File map

**Feature 1 — Sources**
- `prisma/schema.prisma` — modify `ArticleTranslation` (+`sources`).
- `lib/cms/translate.ts` — modify (`TranslationContent`, schema, prompt, `buildTranslationRequest`).
- `actions/cms/articles.ts` — modify (`translateArticleAction` reads/writes sources).
- `lib/cms/article-write.ts` — modify (`translationSchema`, `collect`, upsert).
- `lib/cms/articles.ts` — modify (`baseSelect`, `TranslationRow`, `ArticleFull`, `getPublishedArticle`, `previewArticle`).
- `components/cms/ArticleView.tsx` — modify (`ArticleViewData` +optional sources, render section).
- `app/globals.css` — modify (add `.ed-sources` block; also the img fix in Feature 3).
- `components/cms/AdminEditor.tsx` — modify (`LocaleContent` +sources, UI field).
- `app/admin/articles/[id]/page.tsx`, `app/admin/articles/new/page.tsx` — modify (editor defaults).
- `app/admin/articles/[id]/preview/page.tsx`, `app/articles/[slug]/page.tsx` — modify (pass sources to `ArticleView`).
- Tests: `tests/cms/translate.test.ts`, `tests/cms/translate-action.test.ts`, `tests/cms/publish-action.test.ts`, `tests/cms/article-write.test.ts` (new), `tests/cms/article-view.test.tsx`, `tests/cms/admin-editor.test.tsx` (new).

**Feature 2 — Image upload**
- `lib/cms/markdown-insert.ts` (new) — pure cursor-insert / placeholder-replace.
- `lib/cms/inline-image-upload.ts` (new) — POST to `/api/admin/upload`, return URL.
- `components/cms/AdminEditor.tsx` — modify (paste/drop wiring on the body textarea).
- Tests: `tests/cms/markdown-insert.test.ts` (new), `tests/cms/inline-image-upload.test.ts` (new).

**Feature 3 — Image overflow + preview scroll**
- `app/globals.css` — modify (`.ed-article-prose img`).
- `app/admin/articles/[id]/preview/page.tsx` — modify (layout breakout).

---

## Task 1: Sources through the schema + Claude translate flow

**Files:**
- Modify: `prisma/schema.prisma` (model `ArticleTranslation`, ~line 382)
- Modify: `lib/cms/translate.ts`
- Modify: `actions/cms/articles.ts` (`translateArticleAction`)
- Test: `tests/cms/translate.test.ts`, `tests/cms/translate-action.test.ts`, `tests/cms/publish-action.test.ts`

**Interfaces:**
- Produces: `TranslationContent = { title: string; excerpt: string; body: string; sources: string }`; `buildTranslationRequest(source, from, to)` unchanged signature; `translate(source, from, to): Promise<TranslationContent>` unchanged signature.

- [ ] **Step 1: Add the schema column**

In `prisma/schema.prisma`, model `ArticleTranslation`, add `sources` right after `body`:

```prisma
  body      String   @default("") // Markdown
  sources   String   @default("") // Markdown attribution, rendered as a separate section
```

- [ ] **Step 2: Regenerate the Prisma client (+ push to the local DB if available)**

Run (gate-critical — `generate` is what makes `sources` exist in the client types for tsc):
```bash
npx prisma generate
```
Expected: `generate` succeeds and `articleTranslation` now has a `sources` field.

Then update the local dev DB if one is reachable (prod applies this via the `prisma db push` init container regardless, so this is only for local runtime/integration use — our unit tests mock prisma):
```bash
npx prisma db push   # needs a local Postgres (pnpm docker:up); skip if unavailable
```
Expected: reports the `ArticleTranslation` table updated (additive column, no data loss), or a connection error you can ignore locally if no DB is running.

- [ ] **Step 3: Write the failing translate.ts test**

In `tests/cms/translate.test.ts`, update the existing `src` object and add a sources assertion:

```ts
describe("buildTranslationRequest", () => {
  const src = { title: "Hello", excerpt: "Intro", body: "# Heading\n\n- item\n\n`code`", sources: "[BBSW](https://x.io), Issue #29" }
  it("names both languages and asks to preserve Markdown", () => {
    const { system, userText } = buildTranslationRequest(src, "en", "zh")
    expect(system).toContain(LOCALE_NAME.en)
    expect(system).toContain(LOCALE_NAME.zh)
    expect(system.toLowerCase()).toContain("markdown")
    expect(userText).toContain("Hello")
    expect(userText).toContain("# Heading")
  })
  it("includes the sources in the payload and asks to translate them", () => {
    const { system, userText } = buildTranslationRequest(src, "en", "zh")
    expect(userText).toContain("[BBSW](https://x.io), Issue #29")
    expect(system.toLowerCase()).toContain("source")
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/translate.test.ts`
Expected: FAIL — the new test can't find the sources text in `userText` (and the `src` object is now typed against the not-yet-updated `TranslationContent`).

- [ ] **Step 5: Implement sources in translate.ts**

In `lib/cms/translate.ts`:

```ts
export interface TranslationContent { title: string; excerpt: string; body: string; sources: string }
```

```ts
const TRANSLATION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    excerpt: { type: "string" },
    body: { type: "string" },
    sources: { type: "string" },
  },
  required: ["title", "excerpt", "body", "sources"],
  additionalProperties: false,
} as const
```

In `buildTranslationRequest`, extend the system prompt and the payload:

```ts
  const system =
    `You are a professional translator for a Bitcoin/DeFi publication. ` +
    `Translate the article from ${LOCALE_NAME[from]} to ${LOCALE_NAME[to]}. ` +
    `The body and sources are Markdown — preserve their structure exactly: headings, lists, blockquotes, links, and fenced code blocks. ` +
    `Do not translate code, URLs, or proper nouns / ticker symbols (e.g. SUBFROST, frBTC, DIESEL, Bitcoin). ` +
    `Translate the sources line too (e.g. the word "Sources"), but keep citation names, URLs, and issue numbers intact. ` +
    `Keep the author's tone. Return only the translated title, excerpt, body, and sources.`
  const userText = `TITLE:\n${source.title}\n\nEXCERPT:\n${source.excerpt}\n\nBODY (Markdown):\n${source.body}\n\nSOURCES (Markdown):\n${source.sources}`
  return { system, userText }
```

- [ ] **Step 6: Thread sources through translateArticleAction**

In `actions/cms/articles.ts`, `translateArticleAction`, pass and persist `sources`:

```ts
  let out: TranslationContent
  try {
    out = await translate(
      { title: sourceRow.title, excerpt: sourceRow.excerpt, body: sourceRow.body, sources: sourceRow.sources },
      from,
      to,
    )
  } catch {
    return { ok: false, error: "Translation failed" }
  }

  await prisma.articleTranslation.upsert({
    where: { articleId_locale: { articleId, locale: to } },
    update: { title: out.title, excerpt: out.excerpt, body: out.body, sources: out.sources },
    create: { articleId, locale: to, title: out.title, excerpt: out.excerpt, body: out.body, sources: out.sources },
  })
```

(The `Revision` snapshot stays title/body only — unchanged.)

- [ ] **Step 7: Run translate.ts test to verify it passes**

Run: `CI=true npx vitest run tests/cms/translate.test.ts`
Expected: PASS.

- [ ] **Step 8: Update + extend the translate-action test**

In `tests/cms/translate-action.test.ts`, update the third test so the source row and the translate result carry sources, and assert persistence:

```ts
  it("translates and persists the target locale + a revision", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.write"]))
    vi.mocked(prisma.article.findUnique as never as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "a1", authorId: "u1" })
    vi.mocked(translationUnavailable).mockReturnValueOnce(false)
    vi.mocked(prisma.articleTranslation.findUnique as never as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ title: "Hi", excerpt: "x", body: "# H", sources: "BBSW #29" })
    vi.mocked(translate).mockResolvedValueOnce({ title: "你好", excerpt: "x", body: "# H", sources: "BBSW #29" })
    const res = await translateArticleAction("a1", "en", "zh")
    expect(res.ok).toBe(true)
    expect(translate).toHaveBeenCalledWith(
      expect.objectContaining({ sources: "BBSW #29" }), "en", "zh",
    )
    const upsertArg = vi.mocked(prisma.articleTranslation.upsert as never as ReturnType<typeof vi.fn>).mock.calls[0][0] as { create: { sources: string }; update: { sources: string } }
    expect(upsertArg.create.sources).toBe("BBSW #29")
    expect(upsertArg.update.sources).toBe("BBSW #29")
    expect(prisma.revision.create).toHaveBeenCalledTimes(1)
    if (res.ok) expect(res.translation.title).toBe("你好")
  })
```

- [ ] **Step 9: Add a publish-action sources test**

In `tests/cms/publish-action.test.ts`, add a case asserting `publishArticleAction` passes the row's `sources` into `upsertArticle`:

```ts
  it("preserves sources when publishing from preview", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.publish"]))
    fn(prisma.article.findUnique).mockResolvedValueOnce({
      id: "a1", slug: "my-post", coverImage: null, featured: false, primaryLocale: "en", authorId: "u1", tags: [],
    })
    fn(prisma.articleTranslation.findMany).mockResolvedValueOnce([{ locale: "en", title: "T", excerpt: "", body: "B", sources: "BBSW #29" }])
    fn(upsertArticle).mockResolvedValueOnce({ ok: true, slug: "my-post", id: "a1" })
    await publishArticleAction("a1")
    const arg = vi.mocked(upsertArticle).mock.calls[0][1] as { translations: { en?: { sources?: string } } }
    expect(arg.translations.en?.sources).toBe("BBSW #29")
  })
```

- [ ] **Step 10: Run the action tests to verify they pass**

Run: `CI=true npx vitest run tests/cms/translate-action.test.ts tests/cms/publish-action.test.ts`
Expected: PASS.

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma lib/cms/translate.ts actions/cms/articles.ts tests/cms/translate.test.ts tests/cms/translate-action.test.ts tests/cms/publish-action.test.ts
git commit -m "feat(cms): translate the article sources field through Claude

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Sources through the write + read path

**Files:**
- Modify: `lib/cms/article-write.ts`
- Modify: `lib/cms/articles.ts`
- Test: `tests/cms/article-write.test.ts` (new)

**Interfaces:**
- Consumes: `ArticleTranslation.sources` column (Task 1).
- Produces: `ArticleInput.translations.{en,zh}` accepts optional `sources`; `ArticleFull` gains `sources: string`; `baseSelect` selects `sources`.

- [ ] **Step 1: Write the failing write-path test**

Create `tests/cms/article-write.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { article: { findUnique: vi.fn(), create: vi.fn() } },
}))

import { upsertArticle } from "@/lib/cms/article-write"
import prisma from "@/lib/prisma"

const fn = (m: unknown) => vi.mocked(m as never as ReturnType<typeof vi.fn>)
beforeEach(() => vi.clearAllMocks())

describe("upsertArticle — sources", () => {
  it("persists sources on create", async () => {
    fn(prisma.article.findUnique).mockResolvedValue(null)
    fn(prisma.article.create).mockResolvedValue({ id: "a1", slug: "title" })
    const res = await upsertArticle(
      { id: "u1", privileges: ["articles.publish"] },
      { translations: { en: { title: "Title", excerpt: "", body: "Body", sources: "BBSW #29" } } },
    )
    expect(res.ok).toBe(true)
    const arg = vi.mocked(prisma.article.create).mock.calls[0][0] as { data: { translations: { create: { sources: string }[] } } }
    expect(arg.data.translations.create[0].sources).toBe("BBSW #29")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/article-write.test.ts`
Expected: FAIL — `create[0].sources` is `undefined` (collect doesn't carry sources yet).

- [ ] **Step 3: Add sources to article-write.ts**

In `lib/cms/article-write.ts`:

```ts
const translationSchema = z.object({
  title: z.string().max(200).optional().default(""),
  excerpt: z.string().max(400).optional().default(""),
  body: z.string().optional().default(""),
  sources: z.string().optional().default(""),
})
```

Update `collect` to carry sources:

```ts
function collect(t: z.infer<typeof articleInputSchema>["translations"]) {
  const out: { locale: "en" | "zh"; title: string; excerpt: string; body: string; sources: string }[] = []
  for (const loc of ["en", "zh"] as const) {
    const tr = t[loc]
    if (tr && tr.title.trim()) out.push({ locale: loc, title: tr.title, excerpt: tr.excerpt, body: tr.body, sources: tr.sources })
  }
  return out
}
```

In the update path's `articleTranslation.upsert`, add sources to both `update` and `create`:

```ts
        await tx.articleTranslation.upsert({
          where: { articleId_locale: { articleId: existing.id, locale: t.locale } },
          update: { title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources },
          create: { articleId: existing.id, locale: t.locale, title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources },
        })
```

(The create path uses `translations: { create: translations }`, which now includes `sources` automatically via `collect`.)

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/article-write.test.ts`
Expected: PASS.

- [ ] **Step 5: Add sources to the read path (articles.ts)**

In `lib/cms/articles.ts`:

`baseSelect.translations.select` — add sources:

```ts
  translations: { select: { locale: true, title: true, excerpt: true, body: true, sources: true } },
```

`TranslationRow` — add optional sources (so the inline `previewFallbackArticles` literals need no edits):

```ts
type TranslationRow = { locale: string; title: string; excerpt: string; body: string; sources?: string }
```

`ArticleFull` — add sources:

```ts
export interface ArticleFull extends ArticlePreview {
  body: string
  sources: string
}
```

`getPublishedArticle` return — include sources:

```ts
    return { ...preview, body: t.body, sources: t.sources ?? "" }
```

`previewArticle` (deploy-preview fallback) return — include sources:

```ts
  return {
    ...previewArticleToPreview(article, locale),
    body: translation.body,
    sources: translation.sources ?? "",
  }
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/cms/article-write.test.ts`
Expected: tsc 0 · test PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/cms/article-write.ts lib/cms/articles.ts tests/cms/article-write.test.ts
git commit -m "feat(cms): persist + load the article sources field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Render the Sources section in ArticleView

**Files:**
- Modify: `components/cms/ArticleView.tsx`
- Modify: `app/globals.css` (add `.ed-sources` block)
- Test: `tests/cms/article-view.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ArticleViewData` gains optional `sources?: string`. Section renders only when `sources` is non-empty; localized label EN `Sources` / ZH `来源`.

- [ ] **Step 1: Write the failing render tests**

Replace `tests/cms/article-view.test.tsx` with (updates the existing object to include `sources`, adds three cases):

```tsx
import { describe, it, expect, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { ArticleView } from "@/components/cms/ArticleView"

beforeEach(() => cleanup())

describe("ArticleView", () => {
  const base = {
    title: "Liquidity Weekly",
    excerpt: "A field briefing.",
    body: "Body text here.",
    sources: "",
    publishedAt: "2026-06-22T12:00:00.000Z",
    tags: [{ slug: "research", name: "Research" }],
  }
  it("renders the title, excerpt, and body", () => {
    const { getByText, getByRole } = render(<ArticleView article={base} locale="en" />)
    expect(getByRole("heading", { level: 1 }).textContent).toContain("Liquidity Weekly")
    expect(getByText("A field briefing.")).toBeTruthy()
    expect(getByText("Body text here.")).toBeTruthy()
  })
  it("omits the sources section when sources is empty", () => {
    const { queryByText } = render(<ArticleView article={base} locale="en" />)
    expect(queryByText("Sources")).toBeNull()
  })
  it("renders an English Sources section when present", () => {
    const { getByText } = render(<ArticleView article={{ ...base, sources: "Bitcoin Block Space Weekly, Issue #29" }} locale="en" />)
    expect(getByText("Sources")).toBeTruthy()
    expect(getByText("Bitcoin Block Space Weekly, Issue #29")).toBeTruthy()
  })
  it("renders a localized label in Chinese", () => {
    const { getByText } = render(<ArticleView article={{ ...base, sources: "来源说明" }} locale="zh" />)
    expect(getByText("来源")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/article-view.test.tsx`
Expected: FAIL — `ArticleViewData` has no `sources` (type) and no section renders.

- [ ] **Step 3: Add sources to ArticleView**

In `components/cms/ArticleView.tsx`, add to the interface:

```ts
export interface ArticleViewData {
  title: string
  excerpt: string
  body: string
  sources?: string
  publishedAt: string | null
  tags: { slug: string; name: string }[]
}
```

Replace the body block at the end of the `<article>` with the body **plus** the conditional sources section:

```tsx
      <div className="mx-auto mt-24 max-w-[680px]">
        <Markdown variant="article">{article.body}</Markdown>
      </div>

      {(article.sources ?? "").trim() ? (
        <aside className="ed-sources">
          <div className="ed-sources-label">{locale === "zh" ? "来源" : "Sources"}</div>
          <Markdown variant="article">{article.sources as string}</Markdown>
        </aside>
      ) : null}
```

- [ ] **Step 4: Add the `.ed-sources` styles**

In `app/globals.css`, after the `.ed-article-prose pre { … }` block (around line 394), add:

```css
.ed-sources {
  margin: 56px auto 0;
  max-width: 680px;
  padding-top: 22px;
  border-top: 1px solid var(--ed-hair);
}
.ed-sources .ed-sources-label {
  font-family: var(--ed-sans);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ed-muted);
  margin-bottom: 8px;
}
.ed-sources .ed-article-prose,
.ed-sources .ed-article-prose p {
  font-size: 15px;
  line-height: 1.6;
  color: var(--ed-muted);
}
.ed-sources .ed-article-prose a {
  color: var(--ed-accent);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/article-view.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add components/cms/ArticleView.tsx app/globals.css tests/cms/article-view.test.tsx
git commit -m "feat(cms): render a distinct Sources section at the end of articles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Sources field in the editor + wire sources into the pages

**Files:**
- Modify: `components/cms/AdminEditor.tsx`
- Modify: `app/admin/articles/[id]/page.tsx`
- Modify: `app/admin/articles/new/page.tsx`
- Modify: `app/admin/articles/[id]/preview/page.tsx`
- Modify: `app/articles/[slug]/page.tsx`
- Test: `tests/cms/admin-editor.test.tsx` (new)

**Interfaces:**
- Consumes: `ArticleViewData.sources` (Task 3), `ArticleFull.sources` (Task 2).
- Produces: editor `LocaleContent` gains `sources: string`; the preview + public pages pass `sources` to `ArticleView`.

- [ ] **Step 1: Write the failing editor test**

Create `tests/cms/admin-editor.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { AdminEditor, type EditorInitial } from "@/components/cms/AdminEditor"

vi.mock("@/actions/cms/articles", () => ({
  saveArticle: vi.fn(),
  deleteArticle: vi.fn(),
  translateArticleAction: vi.fn(),
}))

beforeEach(() => cleanup())

const initial: EditorInitial = {
  id: "a1",
  slug: "s",
  coverImage: "",
  tags: [],
  featured: false,
  primaryLocale: "en",
  status: "DRAFT",
  en: { title: "T", excerpt: "", body: "B", sources: "BBSW #29" },
  zh: { title: "", excerpt: "", body: "", sources: "" },
}

describe("AdminEditor — sources field", () => {
  it("shows a Sources field bound to the active locale", () => {
    const { getByText, getByDisplayValue } = render(<AdminEditor initial={initial} canPublish />)
    expect(getByText(/Sources/i)).toBeTruthy()
    expect(getByDisplayValue("BBSW #29")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/admin-editor.test.tsx`
Expected: FAIL — `LocaleContent` has no `sources` (type error) / no Sources field rendered.

- [ ] **Step 3: Add sources to the editor types + UI**

In `components/cms/AdminEditor.tsx`, extend the interface:

```ts
interface LocaleContent { title: string; excerpt: string; body: string; sources: string }
```

Add the Sources textarea immediately after the Body block (after the closing `</div>` of the Body `<div>`, before `{error && …}`):

```tsx
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Sources (Markdown · optional)</Label>
          <Textarea value={cur.sources} onChange={(e) => setCur({ sources: e.target.value })} rows={3}
            placeholder="e.g. Bitcoin Block Space Weekly, Issue #29 — shown as a separate section at the end"
            className="bg-zinc-900 font-mono text-sm text-zinc-100 border-zinc-700" />
        </div>
```

(`submit()` already passes `content.en`/`content.zh` straight through, so `sources` flows once `LocaleContent` has it. `onTranslate`'s `setContent((c) => ({ ...c, [to]: res.translation }))` also already carries sources because `TranslationContent` includes it.)

- [ ] **Step 4: Update the editor load defaults**

In `app/admin/articles/[id]/page.tsx`:

```ts
const empty = { title: "", excerpt: "", body: "", sources: "" }
```
```ts
  const tr = (loc: "en" | "zh") => {
    const t = article.translations.find((x) => x.locale === loc)
    return t ? { title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources } : empty
  }
```

In `app/admin/articles/new/page.tsx`:

```ts
const empty = { title: "", excerpt: "", body: "", sources: "" }
```

- [ ] **Step 5: Pass sources into ArticleView on both pages**

In `app/admin/articles/[id]/preview/page.tsx`, in the `<ArticleView article={{ … }}>` literal add `sources: tr.sources`:

```tsx
          article={{
            title: tr.title,
            excerpt: tr.excerpt,
            body: tr.body,
            sources: tr.sources,
            publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
            tags: article.tags,
          }}
```

In `app/articles/[slug]/page.tsx`, in the `<ArticleView article={{ … }}>` literal add `sources: a.sources`:

```tsx
      <ArticleView
        article={{ title: a.title, excerpt: a.excerpt, body: a.body, sources: a.sources, publishedAt: a.publishedAt, tags: a.tags }}
        locale={locale}
      />
```

- [ ] **Step 6: Run the editor test + typecheck**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/cms/admin-editor.test.tsx`
Expected: tsc 0 · test PASS.

- [ ] **Step 7: Full suite (Feature 1 regression)**

Run: `CI=true npx vitest run`
Expected: green (no failures).

- [ ] **Step 8: Commit**

```bash
git add components/cms/AdminEditor.tsx "app/admin/articles/[id]/page.tsx" "app/admin/articles/new/page.tsx" "app/admin/articles/[id]/preview/page.tsx" "app/articles/[slug]/page.tsx" tests/cms/admin-editor.test.tsx
git commit -m "feat(cms): add the per-locale Sources field to the editor + pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Pure cursor-insert / placeholder-replace utilities

**Files:**
- Create: `lib/cms/markdown-insert.ts`
- Test: `tests/cms/markdown-insert.test.ts` (new)

**Interfaces:**
- Produces:
  - `insertAtCursor(text: string, selStart: number, selEnd: number, snippet: string): { text: string; cursor: number }`
  - `replaceFirst(text: string, token: string, replacement: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/cms/markdown-insert.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { insertAtCursor, replaceFirst } from "@/lib/cms/markdown-insert"

describe("insertAtCursor", () => {
  it("inserts at the caret and reports the new caret position", () => {
    const r = insertAtCursor("hello world", 5, 5, "X")
    expect(r.text).toBe("helloX world")
    expect(r.cursor).toBe(6)
  })
  it("replaces a selection range", () => {
    const r = insertAtCursor("hello world", 0, 5, "hi")
    expect(r.text).toBe("hi world")
    expect(r.cursor).toBe(2)
  })
})

describe("replaceFirst", () => {
  it("replaces only the first occurrence of the token", () => {
    expect(replaceFirst("a [T] b [T]", "[T]", "X")).toBe("a X b [T]")
  })
  it("returns the text unchanged when the token is absent", () => {
    expect(replaceFirst("abc", "[T]", "X")).toBe("abc")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/markdown-insert.test.ts`
Expected: FAIL — module `@/lib/cms/markdown-insert` not found.

- [ ] **Step 3: Implement the utilities**

Create `lib/cms/markdown-insert.ts`:

```ts
/** Insert `snippet` over the [selStart, selEnd) range, returning the new text
 *  and the caret position just after the inserted snippet. Pure (no DOM). */
export function insertAtCursor(
  text: string,
  selStart: number,
  selEnd: number,
  snippet: string,
): { text: string; cursor: number } {
  const before = text.slice(0, selStart)
  const after = text.slice(selEnd)
  return { text: `${before}${snippet}${after}`, cursor: selStart + snippet.length }
}

/** Replace the first occurrence of `token` with `replacement`. Returns the text
 *  unchanged if the token is absent. */
export function replaceFirst(text: string, token: string, replacement: string): string {
  const i = text.indexOf(token)
  if (i === -1) return text
  return text.slice(0, i) + replacement + text.slice(i + token.length)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/markdown-insert.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cms/markdown-insert.ts tests/cms/markdown-insert.test.ts
git commit -m "feat(cms): pure cursor-insert + placeholder-replace utils

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Inline image upload util + paste/drop wiring

**Files:**
- Create: `lib/cms/inline-image-upload.ts`
- Modify: `components/cms/AdminEditor.tsx`
- Test: `tests/cms/inline-image-upload.test.ts` (new)

**Interfaces:**
- Consumes: `insertAtCursor`, `replaceFirst` (Task 5).
- Produces: `uploadInlineImage(file: File, fetchImpl?: typeof fetch): Promise<string>` (returns the public URL, throws on failure).

- [ ] **Step 1: Write the failing upload-util test**

Create `tests/cms/inline-image-upload.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { uploadInlineImage } from "@/lib/cms/inline-image-upload"

const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })

describe("uploadInlineImage", () => {
  it("POSTs to /api/admin/upload with kind=inline and returns the url", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url: "https://x/img.png" }), { status: 200 })) as unknown as typeof fetch
    const url = await uploadInlineImage(file, fetchImpl)
    expect(url).toBe("https://x/img.png")
    const [path, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect(path).toBe("/api/admin/upload")
    const body = (init as RequestInit).body as FormData
    expect(body.get("kind")).toBe("inline")
    expect(body.get("file")).toBeInstanceOf(File)
  })
  it("throws the server error message on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Image exceeds 8MB limit" }), { status: 400 })) as unknown as typeof fetch
    await expect(uploadInlineImage(file, fetchImpl)).rejects.toThrow("Image exceeds 8MB limit")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/inline-image-upload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the upload util**

Create `lib/cms/inline-image-upload.ts`:

```ts
/** Upload a single image File to the admin upload endpoint as an inline body
 *  image. Returns the public URL, or throws with the server's error message. */
export async function uploadInlineImage(file: File, fetchImpl: typeof fetch = fetch): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  form.append("kind", "inline")
  const res = await fetchImpl("/api/admin/upload", { method: "POST", body: form })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok) throw new Error(data.error || "Upload failed")
  if (!data.url) throw new Error("Upload returned no URL")
  return data.url
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/inline-image-upload.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire paste/drop into the body textarea**

In `components/cms/AdminEditor.tsx`:

Add imports:

```ts
import { useRef } from "react"
import { insertAtCursor, replaceFirst } from "@/lib/cms/markdown-insert"
import { uploadInlineImage } from "@/lib/cms/inline-image-upload"
```

> If `useState`/`useTransition` are already imported from `"react"`, merge `useRef` into that existing import line instead of adding a second one.

Inside the component, after the existing `useState` hooks, add the ref + upload counter and handlers:

```tsx
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [uploads, setUploads] = useState(0)

  function imageFilesFrom(items: DataTransferItemList | null, files: FileList | null): File[] {
    const out: File[] = []
    if (items) {
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile()
          if (f) out.push(f)
        }
      }
    }
    if (out.length === 0 && files) {
      for (const f of Array.from(files)) if (f.type.startsWith("image/")) out.push(f)
    }
    return out
  }

  async function uploadFileIntoBody(file: File, atCursor: boolean) {
    const token = `![enviando…](#upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)})`
    // Insert placeholder via a functional update so concurrent uploads don't clobber.
    setContent((c) => {
      const body = c[activeLocale].body
      if (atCursor) {
        const el = bodyRef.current
        const start = el?.selectionStart ?? body.length
        const end = el?.selectionEnd ?? body.length
        return { ...c, [activeLocale]: { ...c[activeLocale], body: insertAtCursor(body, start, end, token).text } }
      }
      const sep = body.length === 0 || body.endsWith("\n") ? "" : "\n"
      return { ...c, [activeLocale]: { ...c[activeLocale], body: body + sep + token } }
    })
    setUploads((n) => n + 1)
    try {
      const url = await uploadInlineImage(file)
      setContent((c) => ({ ...c, [activeLocale]: { ...c[activeLocale], body: replaceFirst(c[activeLocale].body, token, `![](${url})`) } }))
    } catch (e) {
      setContent((c) => ({ ...c, [activeLocale]: { ...c[activeLocale], body: replaceFirst(c[activeLocale].body, token, "") } }))
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploads((n) => n - 1)
    }
  }

  async function uploadFilesIntoBody(files: File[]) {
    for (let i = 0; i < files.length; i++) await uploadFileIntoBody(files[i], i === 0)
  }

  function onBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imgs = imageFilesFrom(e.clipboardData.items, e.clipboardData.files)
    if (imgs.length === 0) return
    e.preventDefault()
    void uploadFilesIntoBody(imgs)
  }

  function onBodyDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const imgs = imageFilesFrom(e.dataTransfer.items, e.dataTransfer.files)
    if (imgs.length === 0) return
    e.preventDefault()
    void uploadFilesIntoBody(imgs)
  }
```

Attach the ref + handlers to the body `<Textarea>` (the one rendered when `tab === "write"`):

```tsx
            <Textarea ref={bodyRef} value={cur.body} onChange={(e) => setCur({ body: e.target.value })} rows={24}
              onPaste={onBodyPaste} onDrop={onBodyDrop}
              placeholder="# Heading&#10;&#10;Paste or drag an image, or write Markdown…" className="bg-zinc-900 font-mono text-sm text-zinc-100 border-zinc-700" />
```

Add an "uploading" hint just below the Write/Preview toggle row (or next to the body) and disable Save while uploading. In the Publish aside, change the Save/Publish/Submit buttons' `disabled={pending}` to `disabled={pending || uploads > 0}`, and add the hint under the Body block:

```tsx
        {uploads > 0 && <p className="text-xs text-sky-400">Enviando imagem…</p>}
```

- [ ] **Step 6: Typecheck + targeted tests**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/cms/inline-image-upload.test.ts tests/cms/admin-editor.test.tsx`
Expected: tsc 0 · tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/cms/inline-image-upload.ts components/cms/AdminEditor.tsx tests/cms/inline-image-upload.test.ts
git commit -m "feat(cms): paste/drag-drop image upload into the article body

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Fix image overflow + the preview that scrolls off-screen

**Files:**
- Modify: `app/globals.css` (`.ed-article-prose img`)
- Modify: `app/admin/articles/[id]/preview/page.tsx`

**Interfaces:** none (CSS + layout only). No unit test — CSS/layout doesn't unit-test meaningfully in happy-dom; verified by `next build` + live visual confirmation (Vitor, since `/admin` is login-gated).

- [ ] **Step 1: Fix the image CSS**

In `app/globals.css`, the `.ed-article-prose img` rule (around line 370):

```css
.ed-article-prose img {
  border-radius: 4px;
  max-width: 100%;
  height: auto;
}
```

(Was `width: 100%`, which stretched every image to the full column. `max-width: 100%; height: auto;` keeps aspect ratio and prevents overflow.)

- [ ] **Step 2: Reproduce + confirm the preview overflow mechanism (systematic-debugging)**

Re-read `app/admin/articles/[id]/preview/page.tsx` and `components/cms/AdminShell.tsx:74`. Confirm the mechanism in writing before changing anything:
- AdminShell's scroll container is `<main className="flex-1 overflow-y-auto p-5 md:p-8">`.
- The preview root is `<div className="flex min-h-screen flex-col">` with a `sticky top-0` header.
- `min-h-screen` (100vh) inside the already-shorter padded `<main>` forces the content taller than the visible area, and `sticky top-0` pins to the **padded** top of `<main>` (not the viewport) — so as you scroll the article the bar drifts and content runs past the frame ("sai da tela").

If a local dev instance with a seeded admin session is available, reproduce visually via the webapp-testing/browser tooling and capture a before screenshot. Otherwise rely on the structural analysis above (the `/admin` route is auth+DB-gated) and Vitor's screenshot.

- [ ] **Step 3: Apply the layout breakout (keep the admin sidebar)**

In `app/admin/articles/[id]/preview/page.tsx`, change the outer wrapper so the preview is full-bleed **within** `<main>` (cancels the `p-5 md:p-8` padding) and stops forcing 100vh — the admin sidebar stays, `<main>` remains the single scroll container, and the sticky bar pins to the real top:

```tsx
    <div className="-m-5 flex min-h-full flex-col md:-m-8">
```

(Was `flex min-h-screen flex-col`. The negative margins exactly offset AdminShell's `p-5`/`md:p-8`; `min-h-full` replaces `min-h-screen`.) Leave the `sticky top-0 … bg-zinc-950/90` header and the `EditorialThemeScope className="flex-1"` as-is.

- [ ] **Step 4: Build**

Run: `npx next build`
Expected: exit 0 (benign Windows `EINVAL` copy warnings on the standalone trace are fine).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css "app/admin/articles/[id]/preview/page.tsx"
git commit -m "fix(cms): stop body images stretching + preview scrolling off-screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (before opening the PR)

- [ ] **Full gates**

Run:
```bash
npx tsc --noEmit
CI=true npx vitest run
npx next build
```
Expected: tsc 0 · vitest green (all suites, including the new `markdown-insert`, `inline-image-upload`, `article-write`, `admin-editor` and the extended `translate*`/`article-view` tests) · build 0.

- [ ] **Open the PR** (do NOT merge or bump `newTag` without Vitor's go):

```bash
git push -u origin feat/article-editor-features
gh pr create --title "Article editor: separate Sources field, paste/drop image upload, image+preview fixes" --body "$(cat <<'EOF'
Three independent, additive article-editor improvements (spec + plan in docs/superpowers/).

1. **Sources** — new per-locale optional `ArticleTranslation.sources`, translated by Claude, rendered as a distinct section at the end of the article (omitted when empty).
2. **Image upload** — paste or drag-drop an image into the body; uploads via the existing `/api/admin/upload` (`kind=inline`) and inserts `![](url)`.
3. **Image/preview fixes** — body images no longer stretch (`max-width:100%;height:auto`); the full-page preview no longer scrolls off-screen (full-bleed within the admin frame, sidebar kept).

Schema change is additive (`sources String @default("")`) — applied by the existing `prisma db push` init container. Gates: tsc 0 · vitest green · build 0.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Live verification (post-merge + deploy — `/admin` is login-gated, Vitor confirms)
1. Sources field shows in the editor, saves, renders as a distinct end-section on preview + published, and **Translate** fills the Chinese sources too.
2. Pasting (screenshot) or dragging an image into the body inserts `![](url)` and the image uploads (shows "Enviando imagem…", Save disabled until done).
3. Body images don't stretch/overflow; the preview scrolls top-to-bottom without going off-screen, sidebar still visible.
