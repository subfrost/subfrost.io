# Article publishing flow — Claude translation + preview phase — Design

**Date:** 2026-06-23
**Status:** Approved (brainstorm) — pending written-spec review
**Branch:** `feat/article-translation-preview-flow`

## Context

The flex refined the bilingual-article demand into a **publishing flow with a preview phase**:

> Add the article preview phase of publishing so it can add the translation step. The translation is an explicit step where the article is translated into static text saved in the DB (not translated dynamically every time). When the article is in draft, a helper produces translations via the Claude API. The reviewer sees the draft — all translations — in a preview that shows the page exactly as it will appear published, and it should be shareable. Then it's one button to publish, creating the article with the slug exactly as the preview shows.

What already exists (verified): the bilingual editor ([AdminEditor.tsx](components/cms/AdminEditor.tsx), `Locale "en"|"zh"`, write/preview tabs — but "preview" is only the Markdown body, not the published page); the data model (`ArticleTranslation { articleId, locale, title, excerpt, body }`, `@@unique([articleId, locale])`, plus `Revision`); the publish action ([article-write.ts](lib/cms/article-write.ts) `upsertArticle`, with server-side own-vs-`edit_any` enforcement and `uniqueSlug`); the public article page ([/articles/[slug]](app/articles/[slug]/page.tsx), `force-dynamic`, serves only `PUBLISHED`, locale via `?lang=zh`). There is **no** Anthropic SDK in the repo.

## Goal

In `/admin`, let an author write in one language, click **one button** to translate the article into the other locale via Claude (saved statically to the DB), open a **full-page preview** that renders exactly like the published article (both locales, admin-only, shareable by URL), and **publish with one button** keeping the slug the preview shows.

## Non-goals

- No change to the `DRAFT → REVIEW → PUBLISHED → ARCHIVED` lifecycle — "preview phase" is a view mode, not a new status.
- **No Prisma migration** — `ArticleTranslation` already has `en`/`zh`; the preview is admin-only so it needs **no token model** (avoids overlap with other open PRs touching `schema.prisma`).
- No public/anonymous preview link — preview is gated to signed-in users with the articles privilege (the flex chose admin-only; "share" = send the `/admin` URL).
- Not translating dynamically on render; not auto-translating on save (translation is an explicit, human-triggered, persisted step).

## Global constraints

- Translation must be **graceful**: only active when `ANTHROPIC_API_KEY` is set. Absent → the action returns an `unavailable` result and the button is disabled; the build must not depend on the key. (Mirror the optional-secret pattern of Resend/Stripe.)
- Use the official **`@anthropic-ai/sdk`** (new dependency); server-side only (key never reaches the client).
- **Model:** default `claude-opus-4-8` (per the `claude-api` skill — don't downgrade for cost unilaterally). The model id is a single exported constant so it can be changed in one place. *(Open question for the user: use `claude-sonnet-4-6` instead to cut cost on a high-volume, mechanical task? Decided at spec review.)*
- Translate **title + excerpt + body**; `body` is Markdown → the prompt instructs Claude to preserve Markdown structure exactly (headings, lists, links, code fences). Use **structured outputs** (`messages.parse()` + a schema) so the response is validated `{title, excerpt, body}` with no preamble/prefill.
- branch → PR → merge → Cloud Build → bump `newTag` via PR → Flux. Windows + Git Bash. Verify: `tsc` 0 · `vitest` green · `next build` 0.

## Design

### 1. Translation engine — `lib/cms/translate.ts` (pure prompt + thin SDK call)

- `LOCALE_NAME: Record<Locale, string>` (`en → "English"`, `zh → "Simplified Chinese (中文)"`).
- `TRANSLATE_MODEL = "claude-opus-4-8"` (single source of truth).
- **Pure, testable** `buildTranslationRequest(source: {title; excerpt; body}, from: Locale, to: Locale): { system: string; userText: string }` — composes the system instruction (professional translator, preserve Markdown exactly, keep code/URLs/proper nouns intact, output only the translation) and the user payload. No SDK import → unit-testable without network.
- `translationUnavailable(): boolean` → `!process.env.ANTHROPIC_API_KEY`.
- `async translate(source, from, to): Promise<{ title; excerpt; body }>` — constructs `new Anthropic()`, calls `client.messages.parse({ model: TRANSLATE_MODEL, max_tokens: 16000, output_config: { format: zodOutputFormat(TranslationSchema) }, system, messages: [{ role: "user", content: userText }] })`, returns `response.parsed_output`. `TranslationSchema = z.object({ title, excerpt, body })`. Throws on null parse / API error (caller maps to a friendly result).

### 2. Server action — `translateArticleAction` in `actions/cms/articles.ts`

```ts
translateArticleAction(articleId: string, from: Locale, to: Locale):
  Promise<{ ok: true; translation: {title;excerpt;body} } | { ok: false; error: string; unavailable?: boolean }>
```

- `currentUser()`; require `articles.write` (else `{ ok:false, error:"Not allowed" }`). Same author-vs-`edit_any` guard as editing (reuse the check shape in `upsertArticle`).
- If `translationUnavailable()` → `{ ok:false, error:"Translation service not configured", unavailable:true }`.
- Load the `from`-locale `ArticleTranslation` for `articleId`; if missing/empty → `{ ok:false, error:"Nothing to translate in <from>" }`.
- `translate(...)` → on success **upsert** the `to`-locale `ArticleTranslation` (static persist) **and** write a `Revision` (mirrors `upsertArticle`), then return the translation so the editor can reflect it without a reload. On thrown error → `{ ok:false, error:"Translation failed" }` (log server-side).

### 3. "Translate with Claude" button in `AdminEditor.tsx`

- Shown once the draft is saved (needs `initial.id`); pass a new `canTranslate: boolean` prop (`= articleService configured`, computed server-side in the page from `!translationUnavailable()`), and disable with a tooltip when false.
- Click translates **active locale → the other**; if the target already has content, `confirm()` before overwriting. On success, patch the target locale into editor state (`setContent`) for immediate human review; the DB is already updated by the action.

### 4. Shared render component — `components/cms/ArticleView.tsx`

- Extract the published-article markup from [/articles/[slug]/page.tsx:130-163](app/articles/[slug]/page.tsx) into `ArticleView({ article, locale }: { article: { title; excerpt; body; publishedAt; tags; ... }; locale: CmsLocale })` (header: date + primary tag, `<h1>`, excerpt, `<Markdown variant="article">`). The public page renders `<ArticleView>` (no visual change — same DOM/classes); the preview renders the **same** component so it is guaranteed identical to published.

### 5. Preview route — `app/admin/articles/[id]/preview/page.tsx`

- `currentUser()` else `redirect("/admin/login")`; load the article by `id` with translations/tags; gate exactly like the edit page (`articles.publish` OR author) — admin-only, no token.
- Render `<ArticleView>` for the chosen locale with an **EN / 中文 switcher** (`?lang=` searchParam, default `primaryLocale`); only offer locales that have a translation. Show the **real slug** and the eventual public path `/articles/<slug>`. A "Copy preview link" affordance copies the current `/admin/.../preview` URL (admin-only share).
- A small bar links back to the editor and (next section) holds the publish button.
- Add an "Open preview" link from the editor and the articles list ([app/admin/articles/[id]/page.tsx](app/admin/articles/[id]/page.tsx), [app/admin/articles/page.tsx](app/admin/articles/page.tsx)).

### 6. One-button publish from the preview

- `PreviewActions` client component with a single **Publish** button gated `articles.publish`; calls a thin `publishArticleAction(id)` that loads the article and calls `upsertArticle(actor, { id, status: "PUBLISHED", ...existing fields })` — slug unchanged (already set on the draft, so "exactly as the preview shows" holds). Users without `articles.publish` see **"Submit for review"** (status `REVIEW`), consistent with the editor today. On success → redirect to `/articles/<slug>`.

## Data flow

Author saves draft → `translateArticleAction` (Claude → DB upsert + Revision) → preview route reads the draft and renders `<ArticleView>` (both locales) → `publishArticleAction` flips status via `upsertArticle`, slug preserved → public `/articles/[slug]` serves it via the same `<ArticleView>`. No schema change; no new server surface beyond two gated actions.

## Error handling / edge cases

- No API key → button disabled + action `unavailable`; never throws into the build or UI.
- API/parse error → `{ ok:false, error:"Translation failed" }`; draft untouched; editor shows the message.
- Empty source locale → explicit "nothing to translate" message.
- Overwrite target → client `confirm()` first.
- Preview of unknown id, or non-author without `edit_any`/`publish` → 404 / redirect.
- Publishing an already-`PUBLISHED` article → no-op re-publish (idempotent; slug unchanged).
- Markdown integrity → covered by the prompt + a unit test asserting the prompt instructs MD preservation (no live API in tests).

## Testing

- **Pure** (`tests/cms/translate.test.ts`): `buildTranslationRequest` includes both language names, the source title/excerpt/body, and an explicit "preserve Markdown" instruction; `translationUnavailable()` reflects the env var.
- **Action** (`tests/cms/translate-action.test.ts`): `translateArticleAction` with `lib/cms/translate` mocked — gating (no `articles.write` → not allowed), `unavailable` path (no key → no SDK call), success path upserts the target `ArticleTranslation` + `Revision` (prisma mocked) and returns the translation. No real Anthropic call.
- **Component** (`tests/cms/article-view.test.tsx`, RTL): `<ArticleView>` renders title, excerpt, and Markdown body; the public page and preview import the same component (guard against drift).
- Regression: existing article tests stay green (public page output unchanged after extraction).

## Verification

`npx tsc --noEmit` 0 (run `npx prisma generate` first only if schema changes — it does not here) · `CI=true npx vitest run` green · `npx next build` 0. Live (post-deploy, **only if `ANTHROPIC_API_KEY` is set** in k8s via ESO): write EN, click "Translate with Claude" → ZH fills (Markdown preserved) and persists; open preview → page matches published layout, switcher works, slug shown; one button publishes at that slug. Without the key: button disabled, no errors.

## Rollout

branch → PR → merge → Cloud Build (short-sha) → bump `newTag` via PR → Flux. New dep `@anthropic-ai/sdk` (lockfile updated). `ANTHROPIC_API_KEY` added later as an **optional** ExternalSecret (lane of the flex / ESO) — the feature ships dormant until then, exactly like the flex's "if the Claude service is available" framing.
