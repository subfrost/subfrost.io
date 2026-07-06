# Theme-adaptive SVG figures for articles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make article chart figures adapt to the reader's actual site theme (light/dark, including the manual toggle) as single transparent SVG assets, rendered inline so their ink follows the theme.

**Architecture:** Charts are transparent SVGs whose ink uses `currentColor` and whose data marks use fixed brand hex. The **server** article renderer (`ArticleView`) pre-fetches + sanitizes the chart SVGs and passes them as an `inlinedSvgs` map to a still-synchronous `Markdown`; its `img` renderer inlines them into a themed `<figure>`. Client renderers (admin editor preview) receive no map and fall back to `<img>`. Non-SVG images are untouched.

**Tech Stack:** Next.js (RSC), react-markdown, DOMPurify+jsdom (`sanitizeSvg`), vitest + @testing-library/react. Generator: hand-rolled SVG in Python (`gen-fig-13.py`, lives in the `C:\Alkanes Learn` vault, not this repo).

## Global Constraints

- **Ink = `currentColor`** in chart SVGs (presentation-attribute safe); tiered by opacity. **Data marks = fixed brand hex**: Alkanes `#5dcaa5`, Runes `#f0997b`, neutral/other `#d3d1c7`. Never use `currentColor` for data marks.
- **Only inline SVGs from our bucket.** Bucket host = `https://storage.googleapis.com/${CMS_BUCKET||"subfrost-cms"}/` (the `HOST` const in `lib/cms/image-srcset.ts`).
- **Re-sanitize** every SVG at render with `sanitizeSvg` before `dangerouslySetInnerHTML`. Never inline unsanitized markup.
- **`Markdown` MUST stay synchronous** (it renders in client components too). All async work happens in the server caller.
- **Fallback-safe:** any fetch/parse failure or missing map entry → plain `<img src>` (today's behavior). No article ever breaks.
- Tests live in `tests/cms/`. Run a single file with `npx vitest run tests/cms/<file>`.

---

### Task 1: `isChartSvg` host+extension guard

**Files:**
- Modify: `lib/cms/image-srcset.ts`
- Test: `tests/cms/inline-svg.test.ts` (create)

**Interfaces:**
- Produces: `isChartSvg(src: string): boolean` — true iff `src` is under our bucket `HOST` and ends `.svg` (case-insensitive).

- [ ] **Step 1: Write the failing test**

```ts
// tests/cms/inline-svg.test.ts
import { describe, it, expect } from "vitest"
import { isChartSvg } from "@/lib/cms/image-srcset"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("isChartSvg", () => {
  it("accepts our-bucket .svg", () => {
    expect(isChartSvg(`${B}/inline/fig-13-x.svg`)).toBe(true)
    expect(isChartSvg(`${B}/inline/fig-13-x.SVG`)).toBe(true)
  })
  it("rejects our-bucket raster + external svg", () => {
    expect(isChartSvg(`${B}/inline/fig-13-x.opt.png`)).toBe(false)
    expect(isChartSvg("https://imgur.com/x.svg")).toBe(false)
    expect(isChartSvg("")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/inline-svg.test.ts`
Expected: FAIL — `isChartSvg` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/cms/image-srcset.ts` (reuse the existing `HOST` const already defined at the top of the file):

```ts
// True for SVG charts hosted on our own bucket — the only SVGs we inline into articles.
export function isChartSvg(src: string): boolean {
  return src.startsWith(HOST) && /\.svg$/i.test(src)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/inline-svg.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cms/image-srcset.ts tests/cms/inline-svg.test.ts
git commit -m "feat(cms): isChartSvg guard for our-bucket SVGs"
```

---

### Task 2: fetch + sanitize + cache, and URL extraction

**Files:**
- Create: `lib/cms/inline-svg.ts`
- Test: `tests/cms/inline-svg.test.ts` (extend)

**Interfaces:**
- Consumes: `sanitizeSvg` from `lib/cms/svg-sanitize.ts` — `sanitizeSvg(input: Buffer | string): string`. `isChartSvg` from Task 1.
- Produces:
  - `extractChartSvgUrls(md: string): string[]` — the distinct chart-SVG URLs referenced by markdown `![alt](url)` in `md`.
  - `prepareInlineSvg(src: string): Promise<string | null>` — sanitized `<svg>` markup, or `null` (caller falls back to `<img>`). Caches successes in-process.
  - `buildInlineSvgMap(md: string): Promise<Map<string, string>>` — map of url→sanitized-svg for every chart-SVG URL that resolved.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cms/inline-svg.test.ts`:

```ts
import { extractChartSvgUrls, prepareInlineSvg, buildInlineSvgMap } from "@/lib/cms/inline-svg"
import { vi, beforeEach, afterEach } from "vitest"

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="currentColor">hi</text></svg>'

describe("extractChartSvgUrls", () => {
  it("returns only our-bucket .svg urls, de-duplicated", () => {
    const md = `![a](${B}/inline/one.svg)\n![b](${B}/inline/two.svg)\n![c](${B}/inline/one.svg)\n![d](${B}/inline/r.opt.png)\n![e](https://x.com/y.svg)`
    expect(extractChartSvgUrls(md)).toEqual([`${B}/inline/one.svg`, `${B}/inline/two.svg`])
  })
})

describe("prepareInlineSvg", () => {
  afterEach(() => vi.restoreAllMocks())
  it("returns sanitized svg on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SVG) }))
    const out = await prepareInlineSvg(`${B}/inline/ok.svg`)
    expect(out).toContain("<svg")
    expect(out).toContain("currentColor")
  })
  it("strips <script> from the svg", async () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>'
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(evil) }))
    const out = await prepareInlineSvg(`${B}/inline/evil.svg`)
    expect(out).not.toBeNull()
    expect(out).not.toContain("<script")
  })
  it("returns null when the body is not an svg", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<html>nope</html>") }))
    expect(await prepareInlineSvg(`${B}/inline/nope.svg`)).toBeNull()
  })
  it("returns null (never throws) when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")))
    expect(await prepareInlineSvg(`${B}/inline/fail-once.svg`)).toBeNull()
  })
})

describe("buildInlineSvgMap", () => {
  afterEach(() => vi.restoreAllMocks())
  it("resolves each chart svg in the markdown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SVG) }))
    const md = `![a](${B}/inline/m1.svg)\n![b](${B}/inline/m2.svg)`
    const map = await buildInlineSvgMap(md)
    expect([...map.keys()].sort()).toEqual([`${B}/inline/m1.svg`, `${B}/inline/m2.svg`])
    expect(map.get(`${B}/inline/m1.svg`)).toContain("<svg")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cms/inline-svg.test.ts`
Expected: FAIL — `@/lib/cms/inline-svg` not found.

- [ ] **Step 3: Implement**

```ts
// lib/cms/inline-svg.ts
import { sanitizeSvg } from "./svg-sanitize"
import { isChartSvg } from "./image-srcset"

// Successes are immutable per URL — cache them in-process to avoid re-fetch/re-sanitize on every
// render. Failures are NOT cached (a transient bucket blip should retry next render).
const cache = new Map<string, string>()

const SVG_RE = /<svg[\s>]/i
const IMG_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g

/** Distinct chart-SVG URLs referenced by markdown image syntax. */
export function extractChartSvgUrls(md: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of md.matchAll(IMG_RE)) {
    const url = m[1]
    if (isChartSvg(url) && !seen.has(url)) { seen.add(url); out.push(url) }
  }
  return out
}

/** Fetch + sanitize a chart SVG for inline embedding. Returns null → caller renders <img>. */
export async function prepareInlineSvg(src: string): Promise<string | null> {
  const hit = cache.get(src)
  if (hit !== undefined) return hit
  try {
    const res = await fetch(src, { cache: "force-cache" })
    if (!res.ok) return null
    const text = await res.text()
    if (!SVG_RE.test(text)) return null
    const clean = sanitizeSvg(text)
    if (!SVG_RE.test(clean)) return null
    cache.set(src, clean)
    return clean
  } catch {
    return null
  }
}

/** Resolve every chart-SVG URL in the markdown to sanitized inline markup. */
export async function buildInlineSvgMap(md: string): Promise<Map<string, string>> {
  const urls = extractChartSvgUrls(md)
  const map = new Map<string, string>()
  await Promise.all(
    urls.map(async (url) => {
      const svg = await prepareInlineSvg(url)
      if (svg) map.set(url, svg)
    }),
  )
  return map
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cms/inline-svg.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/inline-svg.ts tests/cms/inline-svg.test.ts
git commit -m "feat(cms): fetch+sanitize+cache inline chart SVGs"
```

---

### Task 3: `InlineFigure` + `Markdown` `inlinedSvgs` routing

**Files:**
- Create: `components/articles/InlineFigure.tsx`
- Modify: `lib/cms/markdown.tsx`
- Test: `tests/cms/article-markdown-img.test.tsx` (extend)

**Interfaces:**
- Consumes: `isChartSvg` (Task 1).
- Produces: `InlineFigure({ svg, alt }: { svg: string; alt?: string })` — a synchronous themed `<figure>` with the svg injected. `Markdown` gains optional prop `inlinedSvgs?: ReadonlyMap<string, string>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cms/article-markdown-img.test.tsx`:

```ts
const B2 = "https://storage.googleapis.com/subfrost-cms"
const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="currentColor">hi</text></svg>'

describe("Markdown inline chart SVGs", () => {
  it("inlines an our-bucket .svg when a map entry exists", () => {
    const map = new Map([[`${B2}/inline/c.svg`, SAMPLE]])
    const { container } = render(
      <Markdown inlinedSvgs={map}>{`![chart](${B2}/inline/c.svg)`}</Markdown>,
    )
    expect(container.querySelector("figure.ed-figure svg")).not.toBeNull()
    expect(container.querySelector("figure.ed-figure")?.getAttribute("aria-label")).toBe("chart")
    expect(container.querySelector("img")).toBeNull()
  })
  it("falls back to <img> for a chart .svg with no map entry (client context)", () => {
    const { container } = render(<Markdown>{`![c](${B2}/inline/c.svg)`}</Markdown>)
    expect(container.querySelector("figure.ed-figure")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(`${B2}/inline/c.svg`)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cms/article-markdown-img.test.tsx`
Expected: FAIL — `inlinedSvgs` prop unsupported / no `figure.ed-figure`.

- [ ] **Step 3: Implement `InlineFigure`**

```tsx
// components/articles/InlineFigure.tsx
// Synchronous, context-agnostic: the async fetch/sanitize happened on the server (buildInlineSvgMap).
// color:var(--ed-ink) makes the SVG's currentColor ink follow the article theme (incl. toggle).
export function InlineFigure({ svg, alt = "" }: { svg: string; alt?: string }) {
  return (
    <figure
      className="ed-figure"
      role="img"
      aria-label={alt}
      style={{ color: "var(--ed-ink)" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
```

- [ ] **Step 4: Wire into `Markdown`**

In `lib/cms/markdown.tsx`: add imports and the prop, and branch the `img` renderer.

```tsx
import { isChartSvg } from "@/lib/cms/image-srcset"
import { InlineFigure } from "@/components/articles/InlineFigure"
```

Change the signature to accept the map:

```tsx
export function Markdown({
  children,
  variant = "article",
  inlinedSvgs,
}: {
  children: string
  variant?: "article" | "compact"
  inlinedSvgs?: ReadonlyMap<string, string>
}) {
```

Replace the `img` component with:

```tsx
          img: ({ src, alt }) => {
            const s = typeof src === "string" ? src : ""
            const a = typeof alt === "string" ? alt : ""
            const inlined = isChartSvg(s) ? inlinedSvgs?.get(s) : undefined
            if (inlined) return <InlineFigure svg={inlined} alt={a} />
            if (isChartSvg(s)) {
              // chart svg with no pre-fetched entry (client preview / fetch miss) → plain image
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={s} alt={a} loading="lazy" decoding="async" />
            }
            return <SmartPicture src={s} alt={a} />
          },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/cms/article-markdown-img.test.tsx`
Expected: PASS (new + the two existing SmartPicture/external tests still green).

- [ ] **Step 6: Commit**

```bash
git add components/articles/InlineFigure.tsx lib/cms/markdown.tsx tests/cms/article-markdown-img.test.tsx
git commit -m "feat(cms): inline themed chart SVGs via Markdown inlinedSvgs map"
```

---

### Task 4: `ArticleView` server pre-fetch

**Files:**
- Modify: `components/cms/ArticleView.tsx:33` (the `ArticleView` function) and its `<Markdown variant="article">{article.body}</Markdown>` at line ~69
- Test: `tests/cms/article-view-inline-svg.test.tsx` (create)

**Interfaces:**
- Consumes: `buildInlineSvgMap` (Task 2).
- Produces: `ArticleView` becomes `async`; body `Markdown` receives `inlinedSvgs`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/cms/article-view-inline-svg.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest"
import { render } from "@testing-library/react"

vi.mock("@/lib/cms/inline-svg", async (orig) => ({
  ...(await orig<typeof import("@/lib/cms/inline-svg")>()),
  buildInlineSvgMap: vi.fn(),
}))

import { ArticleView } from "@/components/cms/ArticleView"
import { buildInlineSvgMap } from "@/lib/cms/inline-svg"

const B = "https://storage.googleapis.com/subfrost-cms"
const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="currentColor">hi</text></svg>'

const article = {
  slug: "t", title: "T", body: `![c](${B}/inline/c.svg)`, sources: "",
  coverImage: null, publishedAt: new Date("2026-07-06"), author: null, tags: [], coAuthors: [],
} as unknown as Parameters<typeof ArticleView>[0]["article"]

describe("ArticleView inline svg", () => {
  afterEach(() => vi.restoreAllMocks())
  it("pre-fetches chart svgs and inlines them", async () => {
    ;(buildInlineSvgMap as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([[`${B}/inline/c.svg`, SAMPLE]]),
    )
    const el = await ArticleView({ article, locale: "en" })
    const { container } = render(el)
    expect(container.querySelector("figure.ed-figure svg")).not.toBeNull()
  })
})
```

Note: adjust the `article` literal fields to match `ArticleViewData` if the type complains — read `components/cms/ArticleView.tsx` top for the exact shape and fill required fields with minimal valid values. Keep `body` as the chart-svg markdown.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/article-view-inline-svg.test.tsx`
Expected: FAIL — `ArticleView` is not async / no inline figure.

- [ ] **Step 3: Implement**

In `components/cms/ArticleView.tsx`:

```tsx
import { buildInlineSvgMap } from "@/lib/cms/inline-svg"
```

Make the function async and build the map:

```tsx
export async function ArticleView({ article, locale }: { article: ArticleViewData; locale: CmsLocale }) {
  const inlinedSvgs = await buildInlineSvgMap(article.body)
```

Pass it to the body Markdown (line ~69):

```tsx
        <Markdown variant="article" inlinedSvgs={inlinedSvgs}>{article.body}</Markdown>
```

(Leave the `sources` Markdown unchanged — sources hold attribution text, not charts.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/article-view-inline-svg.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify callers await ArticleView**

Run: `npx tsc --noEmit`
Expected: 0 errors. If a caller renders `<ArticleView .../>` in a server component, RSC awaits it automatically. If tsc flags a non-async caller, that caller is a server component and needs no change; a client caller would error — there should be none (public article pages are server-rendered). Fix any surfaced type error by confirming the caller is a server component.

- [ ] **Step 6: Commit**

```bash
git add components/cms/ArticleView.tsx tests/cms/article-view-inline-svg.test.tsx
git commit -m "feat(articles): ArticleView pre-fetches + inlines theme-adaptive chart SVGs"
```

---

### Task 5: `.ed-figure` CSS

**Files:**
- Modify: `app/globals.css` (near the existing `.ed-article-prose img` rule at line ~884, still under `[data-ed-theme]` scope)

- [ ] **Step 1: Add the styles**

```css
.ed-figure {
  margin: 28px 0;
  text-align: center;
}
.ed-figure svg {
  max-width: 100%;
  height: auto;
  display: inline-block;
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit` then `pnpm build`
Expected: `✓ Compiled successfully` (the `EINVAL` standalone copy warning on Windows is noise).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style(articles): .ed-figure sizing for inlined chart SVGs"
```

---

### Task 6: Adapt the chart generator to the ink contract (VAULT artifact — not this repo)

**Files (in the `C:\Alkanes Learn` vault, executed separately from the repo build):**
- Modify: `C:\Alkanes Learn\Projetos\Subfrost-Articles\figures\gen-fig-13.py`

This task is a self-contained edit of the hand-rolled SVG generator. It produces the contract SVGs the site inlines. It is committed/handled in the vault workflow, not the repo PR.

- [ ] **Step 1: Read the full generator** so every emitter is covered (`gen-fig-13.py` is ~400–500 lines; the ink is applied in helper functions: `header`, `xaxis`, `line_pct`, `multiline_pct`, `stacked_area`, `funnel`, the donut/pie emitter, and any log/bar emitters below).

- [ ] **Step 2: Replace the ink color constants** (lines ~13) with `currentColor` attribute fragments; keep the DATA colors (`GREEN`, `ORANGE`, `NEUT`, `GREEN_D/L`, `ORANGE_D`, `CHAR`) unchanged:

```python
# ink — theme-adaptive: currentColor + opacity tiers (was fixed greys)
INK_STRONG = 'fill="currentColor" fill-opacity="0.92"'   # was T_DARK  #2c2c2a
INK_MID    = 'fill="currentColor" fill-opacity="0.62"'   # was T_LABEL #5f5e5a
INK_SOFT   = 'fill="currentColor" fill-opacity="0.5"'    # was T_MUTE  #888780
GRID_LINE  = 'stroke="currentColor" stroke-opacity="0.12"'  # was GRID  #e7e5dd
AXIS_LINE  = 'stroke="currentColor" stroke-opacity="0.32"'  # was NEUT_D baseline
```

- [ ] **Step 3: Replace ink usages** across every emitter, per this exact mapping (token → token):
  - `fill="{T_DARK}"`  → `{INK_STRONG}`
  - `fill="{T_LABEL}"` → `{INK_MID}`
  - `fill="{T_MUTE}"`  → `{INK_SOFT}`
  - gridline/baseline lines that emit `stroke="{col}"` where `col=NEUT_D if base else GRID`: replace the line-emit with a `currentColor` version, e.g. in `line_pct`/`multiline_pct`:

```python
        base = lab == "0%"
        stroke_attr = AXIS_LINE if base else GRID_LINE
        dash = "" if base else " " + GDASH
        s += f'<line x1="{x0}" y1="{yy:.1f}" x2="{x1}" y2="{yy:.1f}" {stroke_attr} stroke-width="1"{dash}/>\n'
```

- [ ] **Step 4: Fix the donut `#fff`** (the pie emitter): inner hole `fill="#fff"` → `fill="none"`; slice separator `stroke="#fff"` → `stroke="currentColor" stroke-opacity="0.18"`.

- [ ] **Step 5: Confirm no background rect** is emitted (already the case) and keep SVGs transparent. Do NOT touch data-mark `fill=`/`stroke=` that use `GREEN`/`ORANGE`/`NEUT`/`CHAR`/`*_D`.

- [ ] **Step 6: Regenerate and verify one chart is contract-clean**

```bash
cd "C:/Alkanes Learn/Projetos/Subfrost-Articles/figures" && python gen-fig-13.py
grep -c "currentColor" fig-13-alkanes-tx-share-60d.svg     # > 0
grep -Ec "#2c2c2a|#5f5e5a|#888780|#e7e5dd" fig-13-alkanes-tx-share-60d.svg   # 0 (no baked ink)
grep -Ec "#5dcaa5|#f0997b" fig-13-bytes-composition-60d.svg  # > 0 (data hex preserved)
```
Expected: currentColor present, baked ink hexes gone, data hexes preserved.

- [ ] **Step 7: (do NOT bulk-upload yet)** Leave upload/`src`-swap for after Task 7 proves adaptation end-to-end. Produce just the sample(s) needed for Task 7.

---

### Task 7: End-to-end visual verification (adaptation proof)

**Files:**
- Temp harness (remove before finishing): a preview page under `app/` that renders `<InlineFigure>` with a Task-6 sample SVG inside `[data-ed-theme]`.

- [ ] **Step 1: Copy a Task-6 sample SVG** into the worktree (e.g. `app/_fig-preview/sample.svg`) and create a temp page rendering it twice — once in a `data-ed-theme="light"` wrapper, once `="dark"` — via `InlineFigure` (read the file server-side with `fs`, pass to `InlineFigure`).

- [ ] **Step 2: Run the harness** with a `.claude/launch.json` config (`pnpm --dir <worktree> exec next dev --port <N>`), `preview_start`, navigate to the page.

- [ ] **Step 3: Assert adaptation via `preview_eval`** (NOT screenshot — it hangs with SVG-heavy pages):

```js
(() => {
  const q = (sel) => getComputedStyle(document.querySelector(sel));
  // an ink <text> uses currentColor → its resolved fill must differ light vs dark
  const lightInk = q('[data-ed-theme="light"] .ed-figure text').fill;
  const darkInk  = q('[data-ed-theme="dark"] .ed-figure text').fill;
  // a data mark keeps its fixed hex → identical in both
  const lightData = q('[data-ed-theme="light"] .ed-figure polyline, [data-ed-theme="light"] .ed-figure path[fill-opacity]').fill;
  const darkData  = q('[data-ed-theme="dark"] .ed-figure polyline, [data-ed-theme="dark"] .ed-figure path[fill-opacity]').fill;
  return { lightInk, darkInk, inkAdapts: lightInk !== darkInk, dataConstant: lightData === darkData };
})()
```
Expected: `inkAdapts: true`, `dataConstant: true`.

- [ ] **Step 4: Remove the temp harness** (page + sample + launch config entry) and confirm `git status` shows only the intended files.

- [ ] **Step 5: Full gate + commit-free checkpoint**

Run: `npx tsc --noEmit` (0) · `npx vitest run tests/cms` (green) · `pnpm build` (`Compiled successfully`).

---

## Post-plan rollout (outside the code PR)

1. Merge the site-side PR (Tasks 1–5) — nothing breaks; existing PNG figures keep rendering via `SmartPicture`.
2. Bulk-regenerate the 26 figures with the adapted `gen-fig-13.py`, upload the `.svg`s to `subfrost-cms/inline/`, and switch the article body image `src`s from `.png`/`.svg`-local-path to the uploaded `.svg` URLs.
3. Verify the published article in light + dark + with the manual `ThemeToggle`.

## Self-review notes (done)

- **Spec coverage:** contract (Task 6), inline render + routing (Tasks 3–4), guard (Task 1), fetch/sanitize/cache (Task 2), CSS (Task 5), security re-sanitize (Task 2/3), fallback (Tasks 3–4), tests + visual proof (all + Task 7). Client-context fallback covered (Task 3 second test).
- **Types:** `isChartSvg`, `prepareInlineSvg`, `extractChartSvgUrls`, `buildInlineSvgMap`, `InlineFigure({svg,alt})`, `Markdown({inlinedSvgs})` — consistent across tasks.
- **Non-goals:** no `<img>`+@media, no PNG pairs, no rehype-sanitize schema change, no standalone-download theming.
