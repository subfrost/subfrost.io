# Article editor — 3 improvements — design

**Date:** 2026-06-23
**Repo:** `subfrost.io` (Next.js 16 App Router, Prisma/Postgres, GKE/Flux)
**Branch:** `feat/article-editor-features`
**Status:** approved (brainstorm 2026-06-23)

Three independent, additive improvements to the `/admin` article editor + the public
article render. Requested by Vitor. Deploy as usual: branch → PR → merge → bump `newTag`
in `k8s/kustomization.yaml` → Flux. Schema changes are applied by the existing
`prisma db push` init container in `k8s/deployment.yaml` (no migrations folder); locally
`npx prisma db push` + `npx prisma generate`.

---

## Feature 1 — Separate "Sources" field (per-locale, optional, distinct section)

### Goal
Today an article's source/attribution (e.g. *"Sources: Bitcoin Block Space Weekly, Issue
#29 … window ending June 2026."*) is typed into the **end of the body Markdown**, mixed
with the prose. Give it its own field — like title/excerpt/body — rendered as a **distinct
section at the end** of the article so it doesn't blend into the text.

### Decisions (confirmed)
- **Per-locale**: `sources` lives in `ArticleTranslation` alongside title/excerpt/body, so
  the Claude translate step translates it too.
- **Optional**: empty `sources` → the section is **not rendered** (no empty header).
- **Markdown**: the field accepts Markdown so source links are clickable.
- **No migration of existing articles**: the field exists going forward; sources currently
  embedded in bodies are moved out manually when the author next edits. No risky parsing
  heuristic.

### Data path (all additive)
- **`prisma/schema.prisma`** (model `ArticleTranslation`, ~line 382): add
  `sources String @default("")`. Additive, default-valued → safe under `prisma db push`.
- **`lib/cms/article-write.ts`**:
  - `translationSchema`: add `sources: z.string().optional().default("")`.
  - `collect()`: carry `sources` into the collected translation objects.
  - `upsertArticle` create + update: write `sources` in the `articleTranslation`
    create/update payloads.
  - `Revision` is left unchanged (it already snapshots only title/body/locale, not excerpt;
    sources follows excerpt's precedent and is not snapshotted).
- **`lib/cms/articles.ts`**:
  - `baseSelect.translations.select`: add `sources: true`.
  - `TranslationRow`: add `sources?: string` (optional so the deploy-preview
    `previewFallbackArticles` literals need no edits; read as `t.sources ?? ""`).
  - `ArticleFull`: add `sources: string`.
  - `getPublishedArticle`: return `{ ...preview, body: t.body, sources: t.sources ?? "" }`.
- **`components/cms/ArticleView.tsx`**:
  - `ArticleViewData`: add `sources: string`.
  - After the body `<Markdown>`, render a **conditional** Sources section only when
    `sources.trim()` is non-empty: a hairline rule (`var(--ed-hair)`), a localized label
    (EN `Sources` / ZH `来源`) styled with `var(--ed-muted)`, and the sources text rendered
    via `<Markdown variant="article">` in a smaller/muted wrapper. Constrained to the same
    `max-w-[680px]` column as the body.
- **Pages that feed `ArticleView`**:
  - `app/articles/[slug]/page.tsx`: pass `sources: a.sources` (from `ArticleFull`).
  - `app/admin/articles/[id]/preview/page.tsx`: pass `sources: tr.sources` (raw translation
    row from the prisma `include`, has `sources` after the schema change).
- **`components/cms/AdminEditor.tsx`**:
  - `LocaleContent`: add `sources: string` (so `EditorInitial.en/zh` carry it).
  - UI: a new `<Textarea>` labeled "Sources (Markdown · optional)" in the main column, below
    the Body block, bound to the active locale via `setCur({ sources })` — per-locale like
    title/excerpt/body.
  - `submit()`: include `sources` in each locale's content (the existing
    `content.en/content.zh` objects already flow through once `LocaleContent` has the field).
  - `onTranslate`: `res.translation` now includes `sources`; the existing
    `setContent(...res.translation)` picks it up.
- **Editor load defaults**:
  - `app/admin/articles/[id]/page.tsx`: `empty` and `tr()` include `sources` (`t.sources`).
  - `app/admin/articles/new/page.tsx`: `empty` includes `sources: ""`.
- **`lib/cms/translate.ts`**:
  - `TranslationContent`: add `sources: string`.
  - `TRANSLATION_SCHEMA`: add `sources: { type: "string" }` to properties + `required`.
  - `buildTranslationRequest`: include `SOURCES:` in the user payload; extend the system
    prompt to translate the sources too while preserving URLs / proper nouns / ticker
    symbols (same rules already stated for the body).
  - `translate()` returns `parsed_output` including `sources`.
- **`actions/cms/articles.ts`**:
  - `translateArticleAction`: read `sourceRow.sources`, pass to `translate(...)`, and write
    `sources: out.sources` in the target `articleTranslation.upsert` (create + update).
  - `publishArticleAction`: when reconstructing `translations` from DB rows, include
    `sources: t.sources` so a publish from preview preserves the field.

### Rendering reference
Section sits after the body, separated from prose. Label small/uppercase-ish in
`var(--ed-muted)`; sources text in a muted, slightly smaller size; links inherit
`var(--ed-accent)`. Only renders when non-empty, in EN and ZH alike.

---

## Feature 2 — Paste / drag-drop image upload in the body

### Goal
Today body images only work by typing Markdown `![alt](url)` with an already-hosted URL.
Let the author **paste** (Ctrl+V of a screenshot/clipboard image) or **drag-drop** an image
file onto the body textarea; it uploads and a `![](url)` is inserted at the cursor.

### Decisions (confirmed)
- **Body only** this round (cover image stays a URL field).
- **Both paste and drop.**

### Existing infra (reused, unchanged)
- `app/api/admin/upload/route.ts`: session-auth POST, `multipart/form-data` with
  `file=<image>` + `kind=avatar|cover|inline`; returns `{ url }` on success or
  `{ error }` with a 4xx status. **`kind=inline` already exists** for body images.
- `lib/cms/gcs.ts` `uploadImage`: allows png/jpeg/webp/gif/avif, ≤8MB, returns a public URL.

### Plan
- A small **pure util** (e.g. `lib/cms/markdown-insert.ts`) for the cursor edit:
  `insertAtCursor(text, selStart, selEnd, snippet)` → `{ text, cursor }`, and a helper to
  replace a placeholder token with the final markdown. Pure → unit-testable without a DOM.
- In `AdminEditor.tsx`, add `onPaste` + `onDrop` handlers to the body `<Textarea>`:
  - Extract image `File`(s) from `clipboardData.items` (paste) or `dataTransfer.files`
    (drop); ignore non-image items; `preventDefault` only when an image is present (so normal
    text paste still works).
  - Insert a unique placeholder `![enviando…](#upload-N)` at the cursor, then
    `POST /api/admin/upload` (FormData `file`, `kind=inline`).
  - On `{ url }`: replace that placeholder with `![](url)`. On error: remove the placeholder
    and surface the endpoint's message via the existing `error` state.
  - Multiple dropped files: process sequentially, each with its own placeholder.
  - Track an `uploading` count to disable Save while an upload is in flight (avoid saving a
    body with a live placeholder).

### Notes
- Body state stays a controlled `<Textarea>`; all edits go through `setCur({ body })` so the
  placeholder→url swap is a normal state update.
- No new dependency; uses `fetch` + `FormData`.

---

## Feature 3 — Image overflow + preview "goes off-screen" on scroll

### 3a — CSS image fix (no reproduction needed)
- `app/globals.css` (~line 370): `.ed-article-prose img { … width: 100%; }` →
  `max-width: 100%; height: auto;` (keep `border-radius`). Stops images from being stretched
  to full column width / overflowing; lets them scale down responsively.

### 3b — Preview overflow on scroll
**Symptom (Vitor):** in the full-page preview (`/admin/articles/[id]/preview`), scrolling
the article down, "it ends up going off-screen" (overflows).

**Decision (confirmed):** keep the admin sidebar visible — just fix the scroll/overflow
(do **not** convert to a sidebar-less full-bleed page).

**Approach:** reproduce first (systematic-debugging), then apply the minimal layout fix.
Likely cause: the preview root `flex min-h-screen flex-col` + `sticky top-0` header renders
inside the AdminShell scroll container `<main className="flex-1 overflow-y-auto p-5 md:p-8">`
(`components/cms/AdminShell.tsx:74`). `min-h-screen` (100vh) inside an already-shorter padded
scroll area forces overflow, and `sticky top-0` pins to the padded top of `<main>` (not the
viewport), so the bar drifts as you scroll. Expected fix: replace `min-h-screen` with natural
height / `min-h-full`, neutralize the `<main>` padding for this preview (full-bleed *within*
`<main>`, e.g. a negative-margin breakout so the sticky bar pins to the very top of the
scroll area), and ensure a single scroll container. **Exact CSS confirmed during
reproduction** — the fix stays within the admin frame and must not regress the editorial
theme scope or the publish bar.

---

## Testing & gates
Per feature, before the PR:
- `npx tsc --noEmit` → 0
- `CI=true npx vitest run` → green (new tests: pure cursor-insert util for image upload;
  conditional Sources section render in `ArticleView`; `translate` payload/schema includes
  sources)
- `npx next build` → 0 (pre-existing Windows `EINVAL` copy warnings on the standalone trace
  are benign)
- Prisma: `npx prisma db push` (local) + `npx prisma generate` before `tsc` when the schema
  changes.

## Verification (live, post-deploy — /admin is login-gated, Vitor confirms)
1. Sources field appears in the editor, saves, renders as a distinct section on the
   preview/published page, and the Translate button translates it alongside the body.
2. Pasting or dragging an image into the body inserts `![](url)` and the image uploads.
3. Body images no longer stretch/overflow, and the preview scrolls without going off-screen.

## Out of scope
- Migrating sources already embedded in existing bodies.
- Cover-image upload button (stays a URL field).
- Sidebar-less full-bleed preview.
