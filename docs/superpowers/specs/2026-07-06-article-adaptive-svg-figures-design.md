# Theme-adaptive SVG figures for articles — design

**Date:** 2026-07-06
**Status:** approved (design), pending implementation plan
**Author:** Claude (with Vitor)

## Context & goal

Public article pages (`/articles/*`) render under `[data-ed-theme]` and **follow the reader's
theme** — OS `prefers-color-scheme` by default, plus a manual `ThemeToggle` (footer, persisted in
`localStorage`). Light canvas is `#ffffff`, dark canvas is `#000000`.

Chart figures today are **light-baked PNGs** (white background implied, dark ink). They look great
in light mode and **glare as white blocks on the black dark-mode canvas**. This affects every
figure in the flagship article *"Alkanes by the Numbers"* (26 figures) and **every future article**
any author writes.

**Goal:** chart figures adapt to the reader's *actual* site theme (including the manual toggle) as a
**single SVG asset per chart**, transparent, crisp at any size, and reusable as the house
convention — no per-chart duplication, no per-article special-casing.

## Approach — 2b: inline SVG + `currentColor`

Charts become **transparent SVGs** whose *ink* (title, axes, labels, gridlines, source line, value
annotations) is drawn with **`currentColor`**, while *data marks* (lines, areas, bars, donut slices)
keep **fixed brand hex** colors (legible on both light and dark). The article renderer **inlines**
our chart SVGs into the themed DOM, so `currentColor` resolves from the theme's text color and flips
with `data-ed-theme`. Data hex stays constant.

Rejected alternatives (recorded so we don't relitigate):
- **`<img>` + internal `@media (prefers-color-scheme)`** — one asset, but follows the **OS** scheme,
  not the site toggle. Since a `ThemeToggle` exists, a user who toggles against their OS sees
  mismatched charts. Rejected for the flagship.
- **Light + dark PNG pairs swapped by theme** — perfect fidelity but **2× assets** per chart forever.
- **Transparent PNG alone** — fixes the background but the ink stays baked → dark labels vanish on
  black. (This is the naive version of 2b; `currentColor` is what makes it actually work.)

## Findings that de-risk this (all verified this session)

- `lib/cms/image-srcset.ts::pictureSources` matches only `.opt.(png|jpe?g|webp)` → **returns null for
  `.svg`**, so SVGs already render as a raw `<img src>` (no AVIF/WebP rasterization).
- The chart SVGs from the generator have **no full-canvas background rect** — they are **already
  transparent**; the white in the PNGs came from `svg2png` compositing on white. (`grep` of
  `gen-fig-13.py` finds `#fff` only in the donut hole + slice separators.)
- `figures/gen-fig-13.py` is **hand-rolled SVG** (Python string templates with `fill="{VAR}"`), not
  matplotlib. Colors are variables: ink (`T_DARK`, `T_LABEL`, `T_MUTE`, `GRID`) vs data (`GREEN`,
  `ORANGE`, `NEUT`). Swapping ink → `currentColor` is a **1:1 variable change** (and `currentColor`
  is valid in presentation attributes, unlike `var()`).
- `lib/cms/svg-sanitize.ts` uses **DOMPurify 3.4.11** (the repo's pinned version). Verified in an
  isolated sandbox on that exact version: sanitizing an SVG **preserves `<style>`,
  `@media (prefers-color-scheme)`, and `currentColor`** — so our ink survives sanitization.
- `ThemeToggle` exists (`components/articles/ThemeToggle.tsx`), which is *why* we need site-theme
  fidelity (inline) rather than OS-only (`<img>`+@media).

## The chart SVG contract (generator side)

Any theme-adaptive chart SVG MUST:

1. **Transparent background** — no full-canvas `<rect>` fill.
2. **Ink via `currentColor`**, tiered by opacity (not by different greys):
   - title: `fill="currentColor"` (opacity 1.0)
   - axis lines, tick labels, legends: `currentColor` at ~`0.62`
   - gridlines: `stroke="currentColor"` at ~`0.10`–`0.14`
   - source/footnote line: `currentColor` at ~`0.5`
3. **Data marks keep fixed brand hex** (constant across themes): Alkanes `#5dcaa5`, Runes `#f0997b`,
   neutral/other `#d3d1c7` (+ their area fills / darker variants). These read on both `#fff` and
   `#000`, so they must NOT use `currentColor`.
4. **Donut specials:** inner hole `fill="none"` (was `#fff`); slice separators become a low-opacity
   `currentColor` hairline (was `stroke="#fff"`).
5. Keep `width`/`height`/`viewBox`; the render wrapper adds `max-width:100%; height:auto`.
6. Keep the existing `Arial, Helvetica, sans-serif` stack (renders fine in inline SVG via the page).
7. **Emit SVG directly** for article figures; **drop the `svg2png` step**.

Standalone use (download to X / docx): `currentColor` with no color context defaults to **black →
still readable on white**, which is the standalone default. Full standalone theming is a non-goal here.

## The site render (this repo)

### `InlineSvg` — server component (`components/articles/InlineSvg.tsx`)

- Props: `{ src: string; alt?: string }`.
- Fetches the SVG text from our CMS bucket **server-side at render**.
- **Re-sanitizes** with the existing `sanitizeSvg` (defense-in-depth; upload already sanitizes).
- **Caches** the sanitized markup by URL in-process (immutable per URL; a small `Map` with a soft
  cap). Figures per article are few and URLs are stable, so this avoids re-fetch/re-sanitize on
  every render.
- Renders `<figure class="ed-figure">` with the sanitized `<svg>` injected via
  `dangerouslySetInnerHTML`, wrapper `style={{ color: "var(--ed-ink)" }}` so `currentColor` resolves
  to the themed ink; wrapper gets `role="img"` + `aria-label={alt}`.
- **Graceful fallback:** if the fetch fails or the payload is not a valid `<svg>`, render a plain
  `<img src={src} alt={alt}>` (= today's behavior). No article ever breaks.
- **Context:** `Markdown` is a server component, so `InlineSvg` (async server fetch) works on the
  **published article page and any server-rendered preview**. In a *client-rendered* surface (the
  in-editor live preview as you type), the async server fetch isn't available → it falls back to the
  plain `<img>` (non-adaptive, black ink — acceptable for a draft preview; the published page adapts).

### Routing (`lib/cms/markdown.tsx`)

The existing `img` component branches:
- `isInlineChartSvg(src)` → `<InlineSvg src alt/>`
- otherwise → `<SmartPicture .../>` (unchanged).

`isInlineChartSvg(src)` = `src` starts with our bucket `HOST` **and** ends with `.svg`
(case-insensitive). External SVGs and all raster images are untouched.

### CSS (`app/globals.css`, under `[data-ed-theme]`)

`.ed-figure` centers the figure with vertical rhythm; the inlined `<svg>` gets
`max-width:100%; height:auto; display:block`. Minimal addition; mirrors the existing
`.ed-article-prose img` rules.

## Data flow

1. Author embeds `![alt](https://storage.googleapis.com/subfrost-cms/inline/foo.svg)`.
2. `markdown.tsx` `img` handler → `InlineSvg` → fetch + sanitize (cached) + inline in a themed
   `<figure>`.
3. Browser resolves `currentColor` from the figure's `color` (= `var(--ed-ink)`), which flips with
   `data-ed-theme` via `SystemThemeSync`. Data hex is constant → the chart adapts to light/dark
   **including the manual toggle**.

## Security

- Upload sanitizes SVG (`svg-sanitize.ts`). Render **re-sanitizes** before `dangerouslySetInnerHTML`.
- Only inline SVGs from **our bucket** (`HOST` allowlist) — never arbitrary external SVG.
- `script` / `foreignObject` / `on*` handlers forbidden (existing config). The only network call is a
  server-side fetch of our own bucket.

## Testing

- **Unit (vitest):**
  - `isInlineChartSvg`: our-bucket `.svg` → true; external `.svg` → false; `.png` → false.
  - `InlineSvg`: a sample `currentColor` SVG is inlined into the output; an injected `<script>` is
    stripped; a fetch failure falls back to `<img>`.
  - Sanitize-preserves-`currentColor`/`<style>`/`@media` regression lock (matches the verified
    DOMPurify behavior, guards against a future dep bump silently breaking adaptivity).
- **Visual (harness):** render a sample chart SVG inside `[data-ed-theme="light"]` and `[="dark"]`;
  assert (via `getComputedStyle`) that an ink element's resolved color **differs** between themes
  while a data-mark hex is **constant**.
- **Regression:** non-SVG images and external images still route to `SmartPicture` / plain `<img>`.

## Rollout (fallback-safe, incremental)

1. Ship the site-side first. Until a figure is re-exported as a contract SVG, existing PNGs keep
   rendering via `SmartPicture` — nothing breaks.
2. Adapt `gen-fig-13.py` to the contract (ink → `currentColor`, donut `#fff` fix, drop `svg2png`).
3. Re-export the 26 figures as SVG, upload, and switch the article's image `src`s to `.svg`.
4. Verify the published article in **light and dark** (and with the toggle) shows adaptive charts.

## Division of work

- **This repo (Claude):** `InlineSvg` + routing + CSS + tests.
- **Generator (Claude can do it — hand-rolled SVG, vault is editable on request; or Vitor):** adapt
  `gen-fig-13.py` to the contract.
- **Re-export + upload + swap `src`s to `.svg`:** Vitor's publish workflow (or scripted).

## Non-goals / YAGNI

- No `<img>`+`@media` variant, no light/dark PNG pairs (see rejected alternatives).
- No change to the `rehype-sanitize` schema — we inline via a React component, not raw markdown HTML.
- No standalone-download theming (X/docx) beyond the black-on-white default.
- No `svgo`/build-time SVG optimization pass now.

## Locked decisions

- Ink = `currentColor` (presentation-attribute safe) tiered by opacity; wrapper `color: var(--ed-ink)`.
  (Chosen over `var(--ed-*)` in the SVG, which does **not** work in presentation attributes.)
- In-process memo cache of sanitized SVG by URL.
