# Editor: Import from Google Docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Gabe paste a Google Doc into the `/admin` article editor and keep its formatting (headings, bold, italic, lists, links, blockquote) automatically, instead of pasting as flat text.

**Architecture:** A new pure, DOM-only converter `lib/cms/import-html.ts` turns Google-Docs clipboard HTML into the site's markdown dialect. Two entry points feed it: (1) the editor's existing `onPaste` intercepts rich `text/html` before its plain-text fallback; (2) a new "Import from Doc" modal offers a paste-target + preview. Converted markdown is rendered into the editor via the existing, tested `markdownToEditorHtml()` bridge, so imported content becomes byte-identical to what the editor produces natively and survives the save round-trip (fixed in #175).

**Tech Stack:** TypeScript, React, Next.js (app router), `DOMParser` (happy-dom in tests), `dompurify` (already a dep), vitest + `@testing-library/react`. No new dependency.

## Global Constraints

- **No new dependency.** Hand-rolled converter in the style of `lib/cms/editor-markdown.ts`. No `turndown`, no markdown lib.
- **Additive only.** Must not write stored article data, add migrations, or change the public render path. The existing `text/plain` paste path stays behavior-identical.
- **Converter independence.** `lib/cms/import-html.ts` must NOT import `lib/cms/editor-markdown.ts`; they meet only at integration points. This keeps conflict surface with editor work near-zero.
- **Headings clamp to h3** (editor + `markdownToEditorHtml` support only h1–h3).
- **Gates:** `npx tsc --noEmit` clean and `npx vitest run tests/cms/` green before each commit that touches those areas.
- **io flow:** work on branch `feat/editor-import-google-docs`; PR to main; never push to main.
- **Base:** worktree `wt-editor-import-docs` off `origin/main` @ `8dcc1ce` (already includes #175 save fix + #173 upload fix).

---

## File Structure

- **Create** `lib/cms/import-html.ts` — the converter. Exports `htmlToMarkdown(html)`, `isRichHtml(html)`, `importedMarkdownFromClipboard(html)`.
- **Create** `tests/cms/import-html.test.ts` — converter unit + round-trip tests.
- **Create** `components/cms/ImportDocModal.tsx` — the "Import from Doc" modal (paste target + preview + Replace/Append/Cancel).
- **Create** `tests/cms/import-doc-modal.test.tsx` — modal component test.
- **Modify** `components/cms/AdminEditor.tsx` — `onPaste` hook (~line 504), a toolbar "Import from Doc" button (~line 550), and wiring the modal into `GhostBodyEditor`.

---

## Task 1: Converter module (`lib/cms/import-html.ts`)

**Files:**
- Create: `lib/cms/import-html.ts`
- Test: `tests/cms/import-html.test.ts`

**Interfaces:**
- Consumes: nothing (pure, DOM globals only).
- Produces:
  - `htmlToMarkdown(html: string): string`
  - `isRichHtml(html: string): boolean`
  - `importedMarkdownFromClipboard(html: string): string | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/cms/import-html.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { htmlToMarkdown, isRichHtml, importedMarkdownFromClipboard } from "@/lib/cms/import-html"

// Minimal reproductions of the HTML Google Docs actually puts on the clipboard.
const gdocsWrap = (inner: string) =>
  `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc">${inner}</b>`

describe("htmlToMarkdown — blocks", () => {
  it("converts paragraphs separated by blank lines", () => {
    const html = gdocsWrap(`<p dir="ltr"><span>First para.</span></p><p dir="ltr"><span>Second para.</span></p>`)
    expect(htmlToMarkdown(html)).toBe("First para.\n\nSecond para.")
  })

  it("maps headings and clamps below h3 to ###", () => {
    const html = gdocsWrap(`<h1><span>Title</span></h1><h2><span>Sub</span></h2><h4><span>Deep</span></h4>`)
    expect(htmlToMarkdown(html)).toBe("# Title\n\n## Sub\n\n### Deep")
  })

  it("converts unordered and ordered lists", () => {
    const html = gdocsWrap(`<ul><li><span>one</span></li><li><span>two</span></li></ul>`)
    expect(htmlToMarkdown(html)).toBe("- one\n- two")
    const ol = gdocsWrap(`<ol><li><span>a</span></li><li><span>b</span></li></ol>`)
    expect(htmlToMarkdown(ol)).toBe("1. a\n2. b")
  })

  it("indents a nested list", () => {
    const html = gdocsWrap(`<ul><li><span>parent</span><ul><li><span>child</span></li></ul></li></ul>`)
    expect(htmlToMarkdown(html)).toBe("- parent\n  - child")
  })

  it("converts a blockquote", () => {
    const html = gdocsWrap(`<blockquote><p><span>quoted line</span></p></blockquote>`)
    expect(htmlToMarkdown(html)).toBe("> quoted line")
  })
})

describe("htmlToMarkdown — inline & Google Docs quirks", () => {
  it("treats font-weight:700 spans as bold but NOT the normal-weight wrapper", () => {
    const html = gdocsWrap(`<p><span>plain </span><span style="font-weight:700">bold</span></p>`)
    expect(htmlToMarkdown(html)).toBe("plain **bold**")
  })

  it("does not double-wrap nested equal-weight spans", () => {
    const html = gdocsWrap(`<p><span style="font-weight:700"><span style="font-weight:700">x</span></span></p>`)
    expect(htmlToMarkdown(html)).toBe("**x**")
  })

  it("treats font-style:italic as italic", () => {
    const html = gdocsWrap(`<p><span style="font-style:italic">em</span></p>`)
    expect(htmlToMarkdown(html)).toBe("*em*")
  })

  it("combines bold+italic", () => {
    const html = gdocsWrap(`<p><span style="font-weight:700;font-style:italic">both</span></p>`)
    expect(htmlToMarkdown(html)).toBe("***both***")
  })

  it("unwraps the Google redirect from links", () => {
    const href = "https://www.google.com/url?q=https://subfrost.io/data&sa=D&source=editors"
    const html = gdocsWrap(`<p><a href="${href}"><span>data</span></a></p>`)
    expect(htmlToMarkdown(html)).toBe("[data](https://subfrost.io/data)")
  })

  it("keeps a plain href untouched", () => {
    const html = gdocsWrap(`<p><a href="https://subfrost.io"><span>site</span></a></p>`)
    expect(htmlToMarkdown(html)).toBe("[site](https://subfrost.io)")
  })
})

describe("isRichHtml / importedMarkdownFromClipboard", () => {
  it("returns false for empty or trivial html", () => {
    expect(isRichHtml("")).toBe(false)
    expect(isRichHtml("<div>just text</div>")).toBe(false)
    expect(importedMarkdownFromClipboard("")).toBeNull()
    expect(importedMarkdownFromClipboard("<div>just text</div>")).toBeNull()
  })

  it("returns markdown for rich Google Docs html", () => {
    const html = gdocsWrap(`<p><span style="font-weight:700">Hi</span></p>`)
    expect(isRichHtml(html)).toBe(true)
    expect(importedMarkdownFromClipboard(html)).toBe("**Hi**")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Alkanes Geral Dev/wt-editor-import-docs" && npx vitest run tests/cms/import-html.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/cms/import-html"`.

- [ ] **Step 3: Write the implementation**

Create `lib/cms/import-html.ts`:

```ts
// Google Docs (and general rich clipboard) HTML -> the site's markdown dialect.
//
// Paired with lib/cms/editor-markdown.ts (markdown <-> editor HTML): the article editor
// pastes rich clipboard HTML through here to markdown, then feeds that markdown to
// markdownToEditorHtml() so imported content becomes byte-identical to what the editor
// produces natively (and so survives the save round-trip fixed in #175). Hand-rolled and
// DOM-only so it unit-tests under happy-dom. Intentionally NOT importing editor-markdown.ts.
//
// Covers the block/inline types Gabe's Google Docs produce: paragraphs, headings,
// unordered/ordered (and nested) lists, blockquotes, bold, italic, links, inline code.

const BLOCK_CHILD_TAGS = new Set([
  "p", "div", "section", "article", "ul", "ol", "blockquote", "figure", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
])

interface Ctx { bold: boolean; italic: boolean }
const ROOT_CTX: Ctx = { bold: false, italic: false }

export function htmlToMarkdown(html: string): string {
  if (!html) return ""
  const doc = new DOMParser().parseFromString(html, "text/html")
  return serializeBlocks(doc.body).trim()
}

/** True when clipboard HTML carries structure worth converting rather than a trivial
 *  wrapper around plain text (keeps the plain-text paste path unchanged for e.g. a
 *  terminal copy). */
export function isRichHtml(html: string): boolean {
  if (!html) return false
  const doc = new DOMParser().parseFromString(html, "text/html")
  return !!doc.body.querySelector(
    "h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,b,strong,i,em,a,code,[style*='font-weight'],[style*='font-style']",
  )
}

/** Convenience for the paste path: markdown for rich html, or null to fall back to
 *  the caller's plain-text handling. */
export function importedMarkdownFromClipboard(html: string): string | null {
  if (!isRichHtml(html)) return null
  const md = htmlToMarkdown(html).trim()
  return md || null
}

function serializeBlocks(node: Node): string {
  return Array.from(node.childNodes)
    .map((child) => blockToMarkdown(child))
    .filter((s) => s.trim() !== "")
    .join("\n\n")
}

function blockToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? ""
  if (!(node instanceof HTMLElement)) return ""

  const tag = node.tagName.toLowerCase()

  const heading = tag.match(/^h([1-6])$/)
  if (heading) {
    const level = Math.min(Number(heading[1]), 3)
    return `${"#".repeat(level)} ${inlineChildren(node).trim()}`
  }

  if (tag === "ul") return listToMarkdown(node, false, 0)
  if (tag === "ol") return listToMarkdown(node, true, 0)

  if (tag === "blockquote") {
    const body = serializeBlocks(node).trim() || inlineChildren(node).trim()
    return body
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n")
  }

  if (tag === "pre") return "```\n" + (node.textContent?.replace(/\n+$/, "") ?? "") + "\n```"

  // A container that wraps block children — Google Docs' outer
  // <b style="font-weight:normal" id="docs-internal-guid-…"> wrapper, or a <div>/<p>
  // holding a list. Descend so inner blocks and their line breaks survive.
  if (hasBlockChild(node)) return serializeBlocks(node)

  return inlineChildren(node).trim()
}

function hasBlockChild(node: HTMLElement): boolean {
  return Array.from(node.children).some((child) => BLOCK_CHILD_TAGS.has(child.tagName.toLowerCase()))
}

function listToMarkdown(list: HTMLElement, ordered: boolean, depth: number): string {
  const indent = "  ".repeat(depth)
  const lines: string[] = []
  let index = 1
  for (const li of Array.from(list.children)) {
    if (li.tagName.toLowerCase() !== "li") continue
    const marker = ordered ? `${index}.` : "-"
    const sublists: string[] = []
    const inlineParts: string[] = []
    for (const child of Array.from(li.childNodes)) {
      const childTag = child instanceof HTMLElement ? child.tagName.toLowerCase() : ""
      if (childTag === "ul" || childTag === "ol") {
        sublists.push(listToMarkdown(child as HTMLElement, childTag === "ol", depth + 1))
      } else {
        inlineParts.push(inlineToMarkdown(child, ROOT_CTX))
      }
    }
    lines.push(`${indent}${marker} ${inlineParts.join("").trim()}`)
    for (const sub of sublists) lines.push(sub)
    index += 1
  }
  return lines.join("\n")
}

function inlineChildren(node: Node, ctx: Ctx = ROOT_CTX): string {
  return Array.from(node.childNodes).map((c) => inlineToMarkdown(c, ctx)).join("")
}

function inlineToMarkdown(node: ChildNode, ctx: Ctx): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (!(node instanceof HTMLElement)) return ""

  const tag = node.tagName.toLowerCase()
  if (tag === "br") return "\n"
  if (tag === "img") return "" // bulk-paste images are out of scope for v1

  if (isMonospace(node)) {
    const text = node.textContent ?? ""
    return text ? `\`${text}\`` : ""
  }

  if (tag === "a") {
    const inner = inlineChildren(node, ctx)
    const href = unwrapDocsHref(node.getAttribute("href") || "")
    return href ? `[${inner}](${href})` : inner
  }

  const bold = resolveWeight(node, ctx.bold)
  const italic = resolveStyle(node, ctx.italic)
  let inner = inlineChildren(node, { bold, italic })

  // Emit a marker only on the transition from parent context to this element, so nested
  // spans that each restate font-weight:700 (a Google Docs habit) don't double-wrap.
  if (inner.trim() !== "") {
    if (italic && !ctx.italic) inner = `*${inner}*`
    if (bold && !ctx.bold) inner = `**${inner}**`
  }
  return inner
}

function styleProp(el: HTMLElement, prop: string): string {
  const fromStyle = el.style?.getPropertyValue(prop)
  if (fromStyle) return fromStyle.toLowerCase().trim()
  const attr = el.getAttribute("style") || ""
  const m = attr.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i"))
  return m ? m[1].toLowerCase().trim() : ""
}

function resolveWeight(el: HTMLElement, inherited: boolean): boolean {
  const weight = styleProp(el, "font-weight")
  if (weight) {
    // The outer Google Docs wrapper is <b style="font-weight:normal"> — an explicit
    // normal/<600 overrides the tag and means NOT bold.
    if (weight === "normal" || (Number(weight) > 0 && Number(weight) < 600)) return false
    if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) return true
  }
  const tag = el.tagName.toLowerCase()
  if (tag === "b" || tag === "strong") return true
  return inherited
}

function resolveStyle(el: HTMLElement, inherited: boolean): boolean {
  const style = styleProp(el, "font-style")
  if (style) return style === "italic" || style === "oblique"
  const tag = el.tagName.toLowerCase()
  if (tag === "i" || tag === "em") return true
  return inherited
}

function isMonospace(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === "code" || tag === "tt" || tag === "kbd") return true
  return /courier|consolas|monaco|monospace/.test(styleProp(el, "font-family"))
}

function unwrapDocsHref(href: string): string {
  const match = href.match(/^https?:\/\/www\.google\.com\/url\?q=([^&]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }
  return href
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Alkanes Geral Dev/wt-editor-import-docs" && npx vitest run tests/cms/import-html.test.ts`
Expected: PASS (all cases in the file).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/cms/import-html.ts tests/cms/import-html.test.ts
git commit -m "feat(cms): Google Docs HTML -> markdown converter for the editor"
```

---

## Task 2: Round-trip idempotence test

Proves imported markdown survives the editor's save round-trip (`markdownToEditorHtml` → `editorDomToMarkdown`), which is the whole point and relies on #175.

**Files:**
- Test: `tests/cms/import-html.test.ts` (append)

**Interfaces:**
- Consumes: `htmlToMarkdown` (Task 1); `markdownToEditorHtml`, `editorDomToMarkdown` from `@/lib/cms/editor-markdown`.
- Produces: nothing (test only).

- [ ] **Step 1: Write the failing test**

Append to `tests/cms/import-html.test.ts`:

```ts
import { markdownToEditorHtml, editorDomToMarkdown } from "@/lib/cms/editor-markdown"

describe("import survives the editor round-trip", () => {
  const gwrap = (inner: string) =>
    `<b style="font-weight:normal" id="docs-internal-guid-x">${inner}</b>`

  function roundTrip(markdown: string): string {
    const host = document.createElement("div")
    host.innerHTML = markdownToEditorHtml(markdown)
    return editorDomToMarkdown(host)
  }

  it("is idempotent for a mixed document", () => {
    const html = gwrap(
      `<h2><span>Section</span></h2>` +
        `<p><span>Intro with </span><span style="font-weight:700">bold</span><span> and </span><span style="font-style:italic">italic</span><span>.</span></p>` +
        `<ul><li><span>first</span></li><li><span>second</span></li></ul>`,
    )
    const md = htmlToMarkdown(html)
    expect(roundTrip(md)).toBe(md)
  })

  it("preserves list line breaks after a round-trip", () => {
    const html = gwrap(`<ul><li><span>alpha</span></li><li><span>beta</span></li><li><span>gamma</span></li></ul>`)
    const md = htmlToMarkdown(html)
    expect(md).toBe("- alpha\n- beta\n- gamma")
    expect(roundTrip(md)).toBe("- alpha\n- beta\n- gamma")
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/cms/import-html.test.ts`
Expected: PASS. If the mixed-document case fails on a whitespace/heading nuance, adjust `htmlToMarkdown` (Task 1) minimally so its output is a stable fixed point of `markdownToEditorHtml`∘`editorDomToMarkdown`, then re-run. Do not weaken the assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/cms/import-html.test.ts lib/cms/import-html.ts
git commit -m "test(cms): imported markdown is a fixed point of the editor round-trip"
```

---

## Task 3: Paste interception in the editor

Hook the converter into `GhostBodyEditor.onPaste` before its plain-text fallback.

**Files:**
- Modify: `components/cms/AdminEditor.tsx` (imports near top; `onPaste` ~line 504)

**Interfaces:**
- Consumes: `importedMarkdownFromClipboard` (Task 1); existing `markdownToEditorHtml`, `insertHtml`, `plainTextToEditorHtml` in the file.
- Produces: no new exports.

- [ ] **Step 1: Add the import**

In `components/cms/AdminEditor.tsx`, find the import from `@/lib/cms/editor-markdown` (it already brings in `markdownToEditorHtml`, `plainTextToEditorHtml`, etc.). Directly below it, add:

```ts
import { importedMarkdownFromClipboard } from "@/lib/cms/import-html"
```

- [ ] **Step 2: Update `onPaste`**

Replace the body of `onPaste` (currently: image check, then `text/plain` → `plainTextToEditorHtml`) with:

```ts
  async function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"))
    if (image) {
      event.preventDefault()
      await insertImage(image)
      return
    }

    const imported = importedMarkdownFromClipboard(event.clipboardData.getData("text/html"))
    if (imported) {
      event.preventDefault()
      insertHtml(markdownToEditorHtml(imported))
      return
    }

    const text = event.clipboardData.getData("text/plain")
    if (!text) return
    event.preventDefault()
    insertHtml(plainTextToEditorHtml(text))
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify existing converter tests still green**

Run: `npx vitest run tests/cms/`
Expected: PASS (Task 1 + Task 2 cover the conversion; this step guards against import breakage).

- [ ] **Step 5: Commit**

```bash
git add components/cms/AdminEditor.tsx
git commit -m "feat(cms): editor paste imports Google Docs formatting via text/html"
```

---

## Task 4: "Import from Doc" modal + toolbar button

A reliable fallback UI: a paste target, a live preview, and Replace/Append/Cancel.

**Files:**
- Create: `components/cms/ImportDocModal.tsx`
- Test: `tests/cms/import-doc-modal.test.tsx`
- Modify: `components/cms/AdminEditor.tsx` (toolbar in `GhostBodyEditor` ~line 550; add modal state + wiring)

**Interfaces:**
- Consumes: `htmlToMarkdown` (Task 1); `Markdown` from `@/lib/cms/markdown`.
- Produces:
  - `ImportDocModal({ open, onClose, onImport })` where
    `onImport(markdown: string, mode: "replace" | "append"): void`.

- [ ] **Step 1: Write the failing modal test**

Create `tests/cms/import-doc-modal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"
import { ImportDocModal } from "@/components/cms/ImportDocModal"

beforeEach(() => cleanup())

const docHtml = `<b style="font-weight:normal" id="docs-internal-guid-x"><h2><span>Heading</span></h2><p><span style="font-weight:700">bold</span></p></b>`

function pasteInto(el: Element, html: string) {
  fireEvent.paste(el, {
    clipboardData: { getData: (t: string) => (t === "text/html" ? html : "") },
  })
}

describe("ImportDocModal", () => {
  it("renders nothing when closed", () => {
    const { queryByRole } = render(<ImportDocModal open={false} onClose={() => {}} onImport={() => {}} />)
    expect(queryByRole("dialog")).toBeNull()
  })

  it("converts pasted Google Docs html into a markdown preview", () => {
    const { getByLabelText, getByText } = render(
      <ImportDocModal open onClose={() => {}} onImport={() => {}} />,
    )
    pasteInto(getByLabelText("Paste your Google Doc here"), docHtml)
    // Preview renders the converted markdown; the heading text is present.
    expect(getByText("Heading")).toBeTruthy()
  })

  it("calls onImport with converted markdown and the chosen mode", () => {
    const onImport = vi.fn()
    const { getByLabelText, getByText } = render(
      <ImportDocModal open onClose={() => {}} onImport={onImport} />,
    )
    pasteInto(getByLabelText("Paste your Google Doc here"), docHtml)
    fireEvent.click(getByText("Replace body"))
    expect(onImport).toHaveBeenCalledWith("## Heading\n\n**bold**", "replace")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/cms/import-doc-modal.test.tsx`
Expected: FAIL — cannot resolve `@/components/cms/ImportDocModal`.

- [ ] **Step 3: Implement the modal**

Create `components/cms/ImportDocModal.tsx`:

```tsx
"use client"

import { useRef, useState } from "react"
import { X } from "lucide-react"
import { htmlToMarkdown } from "@/lib/cms/import-html"
import { Markdown } from "@/lib/cms/markdown"

export function ImportDocModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean
  onClose: () => void
  onImport: (markdown: string, mode: "replace" | "append") => void
}) {
  const [markdown, setMarkdown] = useState("")
  const pasteRef = useRef<HTMLDivElement>(null)

  if (!open) return null

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const html = event.clipboardData.getData("text/html")
    const md = html ? htmlToMarkdown(html) : event.clipboardData.getData("text/plain")
    event.preventDefault()
    setMarkdown(md.trim())
    if (pasteRef.current) pasteRef.current.textContent = ""
  }

  function done(mode: "replace" | "append") {
    if (!markdown.trim()) return
    onImport(markdown.trim(), mode)
    setMarkdown("")
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import from Doc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[10px] bg-[color:var(--ed-canvas,#fff)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--ed-hair)] px-5 py-3">
          <h2 className="text-sm font-medium text-[color:var(--ed-ink)]">Import from Doc</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]">
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-[color:var(--ed-muted)]">Paste your Google Doc (Ctrl/Cmd+V)</p>
            <div
              ref={pasteRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Paste your Google Doc here"
              onPaste={onPaste}
              className="min-h-[40vh] w-full rounded-[8px] border border-dashed border-[color:var(--ed-hair)] p-3 text-sm outline-none"
            />
          </div>
          <div>
            <p className="mb-2 text-xs text-[color:var(--ed-muted)]">Preview</p>
            <div className="min-h-[40vh] rounded-[8px] border border-[color:var(--ed-hair)] p-3">
              {markdown.trim() ? <Markdown variant="article">{markdown}</Markdown> : (
                <span className="text-sm text-[color:var(--ed-muted)]">Converted article appears here.</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--ed-hair)] px-5 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-[6px] px-3 text-sm text-[color:var(--ed-body)] hover:bg-[color:var(--ed-surface)]">Cancel</button>
          <button type="button" onClick={() => done("append")} disabled={!markdown.trim()} className="h-9 rounded-[6px] px-3 text-sm text-[color:var(--ed-body)] hover:bg-[color:var(--ed-surface)] disabled:opacity-45">Append to body</button>
          <button type="button" onClick={() => done("replace")} disabled={!markdown.trim()} className="h-9 rounded-[6px] bg-[color:var(--ed-ink)] px-3 text-sm text-[color:var(--ed-canvas,#fff)] disabled:opacity-45">Replace body</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the modal test to verify it passes**

Run: `npx vitest run tests/cms/import-doc-modal.test.tsx`
Expected: PASS. If the preview assertion is flaky because `Markdown` renders asynchronously, assert on `onImport`'s argument instead (the deterministic path) — but prefer keeping the preview assertion if green.

- [ ] **Step 5: Wire the modal into `GhostBodyEditor`**

In `components/cms/AdminEditor.tsx`:

(a) Add the import near the other component imports:

```ts
import { ImportDocModal } from "@/components/cms/ImportDocModal"
import { FileText } from "lucide-react"
```

(b) Inside `GhostBodyEditor`, add modal state next to the other hooks (near `const editorRef = useRef(...)`):

```ts
  const [importOpen, setImportOpen] = useState(false)

  function applyImport(markdown: string, mode: "replace" | "append") {
    const next = mode === "append" && value.trim() ? `${value}\n\n${markdown}` : markdown
    onChange(next)
  }
```

Ensure `useState` is imported from `react` at the top of the file (it is used elsewhere in the file already; if the local import list lacks it, add it).

(c) Add a toolbar button. After the "Add image" `EditorTool` (~line 550), add:

```tsx
        <span className="mx-1 h-5 w-px bg-[color:var(--ed-hair)]" />
        <EditorTool label="Import from Doc" onClick={() => setImportOpen(true)}><FileText size={15} /></EditorTool>
```

(d) Render the modal just before the closing `</div>` of `GhostBodyEditor`'s returned root:

```tsx
      <ImportDocModal open={importOpen} onClose={() => setImportOpen(false)} onImport={applyImport} />
```

- [ ] **Step 6: Typecheck + full editor test sweep**

Run: `npx tsc --noEmit && npx vitest run tests/cms/`
Expected: no type errors; all `tests/cms/` green.

- [ ] **Step 7: Commit**

```bash
git add components/cms/ImportDocModal.tsx tests/cms/import-doc-modal.test.tsx components/cms/AdminEditor.tsx
git commit -m "feat(cms): 'Import from Doc' modal with preview and replace/append"
```

---

## Task 5: Verify in the running app + open PR

**Files:** none (verification + PR).

- [ ] **Step 1: Run the full test suite + typecheck once more**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green (or, for unrelated pre-existing failures, confirm they exist on `origin/main` too and are not caused by this branch — note them in the PR).

- [ ] **Step 2: Preview the editor**

Start the dev server (preview tooling) and open `/admin/articles/new`. Verify:
  - Paste real Google Docs content (headings, bold, italic, a bulleted and a numbered list, a link) → formatting appears in the editor body.
  - Save as DRAFT, reopen → formatting persists (round-trip).
  - Toolbar "Import from Doc" → modal opens, paste shows a preview, "Replace body" fills the editor, "Append to body" appends.
  - Paste plain text (no rich html) → still inserted as before (unchanged).
Capture a screenshot for the PR.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/editor-import-google-docs
gh pr create --title "feat(cms): import Google Docs formatting into the article editor" \
  --body "Paste-interception + 'Import from Doc' modal that convert Google Docs clipboard HTML to the site's markdown so Gabe's formatting (headings, bold, italic, lists, links, blockquote) survives instead of being dropped. Hand-rolled DOM converter (lib/cms/import-html.ts), reuses markdownToEditorHtml; additive (no schema, preserves plain-text paste). Depends on #175 (already on main). Spec: docs/superpowers/specs/2026-07-03-editor-import-google-docs-design.md"
```

Never push to main directly. Deploy (image bump) is a separate step after merge, per the io flow.

---

## Self-Review

**Spec coverage:**
- Converter module + Google-Docs quirks (bold/wrapper/italic/lists/links/blockquote) → Task 1. ✅
- Reuse `markdownToEditorHtml`, converter independence → Tasks 1 & 3. ✅
- Round-trip survives save (#175) → Task 2. ✅
- Paste interception preserving `text/plain` path → Task 3. ✅
- "Import from Doc" modal (preview, Replace/Append) → Task 4. ✅
- No stored-data writes / no migration / additive → holds across all tasks (only editor client code + a pure lib). ✅
- Out of scope (embedded images, tables) → not implemented; images explicitly dropped in `inlineToMarkdown` (`img` → ""). ✅
- Gates tsc/vitest, PR flow → Tasks 3–5. ✅

**Placeholder scan:** no TBD/TODO; every code step has complete code. ✅

**Type consistency:** `htmlToMarkdown`, `isRichHtml`, `importedMarkdownFromClipboard` (Task 1) are consumed with matching signatures in Tasks 2–4; `ImportDocModal`'s `onImport(markdown, mode)` matches its consumer `applyImport(markdown, mode)` in Task 4. ✅
