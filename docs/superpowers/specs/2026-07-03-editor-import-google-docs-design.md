# Editor: Import from Google Docs — Design Spec

- **Date:** 2026-07-03
- **Branch:** `feat/editor-import-google-docs` (worktree `wt-editor-import-docs`, off `origin/main` @ `8dcc1ce`)
- **Requested by:** Vitor (relay from Gabe/CEO)
- **Status:** Approved design → implementation plan

## Problem

Gabe writes articles in Google Docs and can't move them into the `/admin` article
editor without losing all formatting. Pasting into the editor body drops headings,
bold, italic, lists, and links — he re-applies everything by hand. We want: paste the
Doc and have formatting configured automatically.

## Root cause (from the code)

The editor body ([`GhostBodyEditor`](../../../components/cms/AdminEditor.tsx) in
`components/cms/AdminEditor.tsx`) is a `contentEditable` surface bridged to markdown:

- **Load:** stored markdown → `markdownToEditorHtml()` → `innerHTML`.
- **Edit:** `onInput`/`onBlur` → `editorDomToMarkdown()` → markdown → `onChange`.
- **Paste today (`onPaste`, ~line 504):** deliberately reads only
  `clipboardData.getData("text/plain")` and inserts it via `plainTextToEditorHtml()`.
  The rich `text/html` that Google Docs *also* places on the clipboard is discarded —
  which is exactly why formatting is lost.

The markdown↔HTML bridge lives in `lib/cms/editor-markdown.ts` (the round-trip is
tested in `tests/cms/editor-markdown.test.ts`, shipped in #175 which fixed list line
breaks on save). Rendering on the public site is `react-markdown` + `remark-gfm` +
`rehype-sanitize`.

## Dependencies — RESOLVED

The two parallel editor investigations this feature depended on are **merged and
deployed on `main`**:

- **#175** (`fe830ec`) — save no longer eats list line breaks. Import is pointless
  without this: a perfect import would be destroyed on the next save. ✅ on main.
- **#173** (`a7f799a`) — cover image upload restored (sharp in runtime image). ✅ on main.
- (#176 `aa8a1b6` — inline upload errors — also on `origin/main`, our base.)

This branch is based on `origin/main` @ `8dcc1ce`, so it already includes all of the
above. No WIP snapshotting or rebase coordination is needed.

## Non-negotiable constraint

**Must not disturb existing articles.** The feature is additive editor UX. It only
affects *newly pasted* content. It writes no stored data, adds no migration, and
preserves the current `text/plain` paste path unchanged. Articles already in the DB
load and serialize identically.

## Architecture

### New module: `lib/cms/import-html.ts`

Pure, DOM-only, in the same hand-rolled style as `editor-markdown.ts` (no new
dependency — the codebase has no `turndown` and prefers small testable converters).

```ts
/** Convert clipboard/Google-Docs HTML to the site's markdown dialect. */
export function htmlToMarkdown(html: string): string

/** True when clipboard HTML carries real structure worth converting
 *  (vs. a trivial wrapper around plain text). Used to decide paste path. */
export function isRichHtml(html: string): boolean
```

The converter parses `html` into a detached document (`DOMParser`), walks the DOM,
and emits markdown. It is a sibling of the editor's serializer, not a consumer of it:
the two only meet at the paste integration point.

### Pipeline

```
clipboard text/html
   → htmlToMarkdown()              (this module: normalize Google-Docs-isms → markdown)
   → markdownToEditorHtml()        (existing, tested — canonical editor HTML)
   → insertHtml()                  (existing execCommand path)
   → syncFromDom()                 (existing — reserializes clean markdown)
```

Converting to markdown first (rather than Docs-HTML → editor-HTML directly) reuses the
tested `markdownToEditorHtml` and guarantees the pasted content becomes byte-identical
to what the editor produces natively, so the round-trip on save is clean.

### Google Docs quirks the converter must handle

| Source (Google Docs) | Markdown out | Notes |
|---|---|---|
| `<b>`, `<strong>`, `style="font-weight:700\|bold\|≥600"` | `**text**` | **Gotcha #1:** Docs wraps the whole paste in `<b style="font-weight:normal" id="docs-internal-guid-…">`. That outer `<b>` is **not** bold — only spans with explicit weight ≥600 are. Compute effective weight; ignore the wrapper. |
| `<i>`, `<em>`, `style="font-style:italic"` | `*text*` | |
| `<h1>`–`<h6>` | `#`–`###` | Clamp to h3 (editor + `markdownToEditorHtml` support h1–h3). |
| `<ul>/<ol>/<li>` | `-` / `1.` | Nested lists → indented. Docs uses proper `<ul><li>`. |
| `<a href>` | `[text](href)` | **Unwrap** the Docs redirect `https://www.google.com/url?q=<real>&sa=…` back to `<real>`. |
| `<blockquote>` | `> ` | |
| `<p>`, `<br>` | paragraphs / soft break | Drop Docs' empty `<p><span></span></p>` paragraphs. |
| monospace font-family (Courier/Consolas/…) | `` `code` `` | Best-effort inline code. Low priority; safe to defer if noisy. |
| underline (`text-decoration:underline`) | (drop styling, keep text) | Markdown has no underline. |

### Security

Input HTML is parsed with `DOMParser` (does not execute scripts) and the converter
only *reads* nodes to emit markdown (plain text) — no HTML is injected from the
clipboard. The produced markdown is rendered through the site's existing
`rehype-sanitize`. As defense in depth, run the parsed fragment through `DOMPurify`
(already a dependency) before walking, configured to keep the `style`/`href`
attributes the converter needs.

## UI — two entry points, one converter

### 1. Paste interception (primary)

In `onPaste`, before the `text/plain` fallback:

```
const html = event.clipboardData.getData("text/html")
if (html && isRichHtml(html)) {
  event.preventDefault()
  insertHtml(markdownToEditorHtml(htmlToMarkdown(html)))
  return
}
// else: existing text/plain path, unchanged
```

Plain-text paste (no `text/html`, or trivial HTML) keeps today's exact behavior.

### 2. "Import from Doc" modal (fallback)

A new `EditorTool` button in the toolbar (next to the image tool, ~line 550) opens a
modal containing:

- A `contentEditable` paste target ("Paste your Google Doc here").
- A live **preview** of the converted result (rendered via the existing `Markdown`
  component, `variant="article"`).
- Buttons: **Replace body** / **Append to body** / **Cancel**.

The modal lives inside `GhostBodyEditor` so it has `value`/`onChange`:
Replace → `onChange(md)`; Append → `onChange(value ? value + "\n\n" + md : md)`.
This is the reliable path for browsers/contexts where paste-into-editor doesn't expose
`text/html`.

## Testing (TDD)

New: `tests/cms/import-html.test.ts` (vitest, `happy-dom` — DOM available).

1. **Converter unit tests** against real Google Docs HTML fixtures:
   - bold via `font-weight:700`; the outer `<b style="font-weight:normal">` guid wrapper
     is *not* treated as bold;
   - italic spans;
   - unordered + ordered lists, including one nested level;
   - `<h1>`/`<h2>`/`<h4>` heading level mapping (h4 clamps to `###`);
   - link with the `google.com/url?q=` redirect → unwrapped href;
   - blockquote;
   - a mixed document → asserts exact markdown.
2. **Round-trip idempotence:** `htmlToMarkdown(docsHtml)` → `markdownToEditorHtml` →
   `editorDomToMarkdown` is stable (proves the import survives a save — the whole point;
   relies on #175).
3. **Regression:** `isRichHtml` returns false for plain-text-only / trivial clipboard
   HTML, so the existing `text/plain` path is preserved.

## Out of scope (v1)

- **Embedded images** inside a Doc (arrive as `googleusercontent`/base64 URLs; would
  need GCS upload). Single-image paste already works via the existing files path;
  bulk-paste images are dropped for v1 (keep alt text if present).
- **Tables.** `markdownToEditorHtml` doesn't parse tables, so a pasted table would show
  as raw markdown inside the `contentEditable` (though it *would* render on the
  published article via `remark-gfm`). The mismatch isn't worth it for v1 — deferred.

## Rollout

Standard io flow: spec-lite → this branch → PR (never push to main) → gates
(`tsc` + `vitest`) → merge. Subagents on Sonnet 5. No schema, no migration, no deploy
coupling beyond the normal image bump after merge.
