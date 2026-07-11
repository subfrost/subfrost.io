# Metrics Chart Export ("Copy chart") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy chart" action to every chart on `/metrics` that copies a canonical, branded PNG of the chart itself (not the stat card), so people can paste the chart straight into a discussion.

**Architecture:** A new server image route `app/metrics/chart/opreturn/route.tsx` (next/og `ImageResponse`, same infra as the existing stat-card route) renders a **canonical export frame** (SUBFROST header + the chart drawn from data + `subfrost.io/metrics · as of <date>` footer) at a fixed 1200×675 dark frame. It draws the chart in SVG (satori-compatible: polylines for lines, polygons for stacked areas, arcs for the donut) from a **chart spec** that maps each of the 21 `/metrics` charts to its series, colors, type, and scale. Series data is pulled from the SAME payload builder the page uses (`getPublicOpReturnData` / `public-opreturn`), so exports match the page exactly (DRY). The `ShareMenu` gains a `chartUrl` prop and a "Copy chart" item that reuses the existing `copyImageToClipboard(url)`.

**Tech Stack:** Next.js 16 App Router, `next/og` (`ImageResponse` / satori), React, TypeScript, Vitest. NO new runtime dependency (no html-to-image; we render server-side like the card).

## Global Constraints

- **No DOM screenshot.** The export is rendered from data on the server, never captured from the live page (avoids tooltip/hover/half-loaded/wrong-theme artifacts). Fixed aspect (1200×675) and fixed dark theme regardless of the page's current theme. (Fable.)
- **Always attributed.** Every exported image carries a footer `subfrost.io/metrics · as of <YYYY-MM-DD>`. The date is mandatory (anti-manipulation), never optional. (Fable.)
- **Finite, CDN-cacheable URL space.** Every query param is enum-validated (unknown → 400), exactly like `parseCardParams`. No free text ever reaches the renderer. Cache headers identical to the card route (`public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400`).
- **Append-only chart ids.** A chart id in the spec is an embed/share contract; never change an id's meaning. New definition = new id.
- **Copy rules:** SUBFROST in caps; zero em-dash (—) in any copy; labels in EN for the public image.
- **Menu labels by intent, not format:** "Copy chart" (the chart, first) and "Copy stat card" (the hero number). No toggles, no "with/without branding", no format picker. Both output branded PNG.
- **Gate before ship:** `node_modules/.bin/tsc --noEmit` (0 errors), `eslint` on edited files (0), `vitest run tests/marketing tests/share` (green). The full suite has 5 PRE-EXISTING failures (allow-listed: `tests/cms/admin-landing`, `tests/cms/admin-nav`, `tests/financials/frbtc-indexer`, + 2 network-flaky integration) — filter those, do not count them as regressions.

---

## File Structure

- **Create** `lib/marketing/chart-specs.ts` — the `ChartSpec` type + `CHART_SPECS` map (21 entries) + `parseChartParams()` + `chartImageUrl()`. One responsibility: describe each chart and validate its params. Pure, client-safe (importable by both the route and the page).
- **Create** `lib/marketing/chart-draw.tsx` — pure SVG-drawing helpers for satori: `niceTicks()`, `linePath()`, `areaPolygon()`, `donutArcs()`, and a `ChartBody` component that takes resolved series + spec and returns the axes+series SVG/JSX. One responsibility: turn numbers into an SVG chart. No data fetching, no framing.
- **Create** `app/metrics/chart/opreturn/route.tsx` — the image route. Validates params, fetches rows, resolves the spec's series from the payload, wraps `ChartBody` in the branded frame (header/footer), returns `ImageResponse`. Mirrors `app/metrics/card/opreturn/route.tsx`.
- **Modify** `components/share/ShareMenu.tsx` — add optional `chartUrl?: string`; render a "Copy chart" item (first, when present) that copies it; rename the existing image item to "Copy stat card" when a card `imageUrl` is present.
- **Modify** `components/data/OpReturnCharts.tsx` — pass `chartUrl={chartImageUrl(id, window, "dark")}` to every `Card`/`ShareMenu`; give the currently link-only charts a `chartUrl` too (they all get "Copy chart").
- **Modify** `lib/marketing/public-opreturn.ts` — ONLY if the per-chart series the specs need aren't already exposed by `getPublicOpReturnData`; prefer resolving from the existing payload. (Task 1 determines this.)
- **Tests:** `tests/marketing/chart-specs.test.ts`, `tests/marketing/chart-draw.test.ts`, `tests/marketing/chart-route.test.ts`, and additions to `tests/share/share-menu.test.tsx`.

---

## Task 1: Chart spec map + param validation

**Files:**
- Create: `lib/marketing/chart-specs.ts`
- Test: `tests/marketing/chart-specs.test.ts`

**Interfaces:**
- Produces:
  - `type ChartType = "line" | "area" | "stacked" | "donut"`
  - `type ChartScale = "linear" | "log"`
  - `interface SeriesRef { key: string; label: string; color: string; dashed?: boolean }` — `key` is a field on the public payload's per-chart series rows (or a donut slice key).
  - `interface ChartSpec { id: string; title: string; type: ChartType; scale: ChartScale; series: SeriesRef[]; valueFormat: "pct" | "count" | "usd" | "bytes"; /* donut only: */ donutSlices?: { key: string; label: string; color: string }[] }`
  - `const CHART_SPECS: Record<string, ChartSpec>` — one entry per `/metrics` chart id (ids match the existing `anchorId`s where present, e.g. `diesel-mints-per-day`, `byte-composition`; mint new stable kebab ids for the share-card charts that lack an anchor, e.g. `daily-alkanes-share`).
  - `function parseChartParams(sp: URLSearchParams): { spec: ChartSpec; window: WindowKey; theme: "dark" | "light" } | null` — `id` unknown → null; window/theme validated like `parseCardParams`.
  - `function chartImageUrl(id: string, window: WindowKey, theme?: "dark" | "light"): string` → `https://subfrost.io/metrics/chart/opreturn?id=<id>&window=<window>&theme=<theme>`.

**Deliverable detail:** derive the 21 entries by reading the current chart JSX in `components/data/OpReturnCharts.tsx` (the `<Card>`…`<SingleLineChart/>`/`<ToggleLineChart/>`/`<LabeledPie/>` blocks, ~lines 337–720) and the copy titles. Each chart's `series[].key` + `color` come straight from the props it passes today; `scale` from its `logScale`; `type` from Single/Toggle/area/stacked/Pie. Colors: copy the exact hex/vars the page uses, resolved to fixed hex for the dark frame.

- [ ] **Step 1:** Write `tests/marketing/chart-specs.test.ts`: (a) `CHART_SPECS` has an entry for each of the 21 known ids (assert a hardcoded id list), every entry has ≥1 series (or `donutSlices` for `type:"donut"`), and all colors are `#`-hex; (b) `parseChartParams` returns null for unknown id, unknown window, unknown theme; returns the spec for a known id with defaults; (c) `chartImageUrl("diesel-mints-per-day","full")` equals the exact expected URL.
- [ ] **Step 2:** Run `node_modules/.bin/vitest run tests/marketing/chart-specs.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement `lib/marketing/chart-specs.ts` with the full 21-entry map + the two functions.
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit `feat(metrics): chart spec map + param validation for chart export`.

## Task 2: SVG drawing helpers (pure)

**Files:**
- Create: `lib/marketing/chart-draw.tsx`
- Test: `tests/marketing/chart-draw.test.ts`

**Interfaces:**
- Consumes: `ChartSpec`, `SeriesRef` from Task 1.
- Produces:
  - `function niceTicks(min: number, max: number, count: number, scale: ChartScale): number[]` — rounded tick values; log scale returns powers of ten within range.
  - `function projectX(i: number, n: number, w: number): number` and `projectY(v: number, min: number, max: number, h: number, scale: ChartScale): number`.
  - `function linePath(values: (number|null)[], min, max, w, h, scale): string` — SVG polyline `points` string, skipping nulls (breaks the line).
  - `function areaPolygon(...)` and stacked variant.
  - `function donutArcs(slices: {value:number;color:string}[], cx,cy,rOuter,rInner): {d:string;color:string}[]` — SVG path `d` per slice, 12 o'clock start, clockwise.
  - `ChartBody({ spec, rows, width, height, ink, muted, grid }): JSX` — the axes + gridlines + series, sized to fit inside the frame's content area. Pure; no ImageResponse, no fetch.

- [ ] **Step 1:** Write `tests/marketing/chart-draw.test.ts` covering the pure math: `niceTicks(0,1,5,"linear")` shape; `niceTicks(1,1000,4,"log")` = `[1,10,100,1000]`; `projectY(min)===h` and `projectY(max)===0`; `linePath` skips nulls (fewer segments); `donutArcs` returns one `d` per slice and the `d` strings start with `M`.
- [ ] **Step 2:** Run the test — expect FAIL.
- [ ] **Step 3:** Implement `lib/marketing/chart-draw.tsx`. `ChartBody` renders an inline `<svg>` (satori supports `polyline`, `polygon`, `path`, `line`, `text`, `rect`) with: left Y-axis tick labels + gridlines, bottom X-axis first/mid/last date labels, and the series. For `type:"donut"` it renders `donutArcs` + a legend row. Use `strokeWidth` ~3–4 so it reads at 1200px.
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit `feat(metrics): pure SVG chart-drawing helpers for export`.

## Task 3: The image route

**Files:**
- Create: `app/metrics/chart/opreturn/route.tsx`
- Test: `tests/marketing/chart-route.test.ts`

**Interfaces:**
- Consumes: `parseChartParams`, `CHART_SPECS` (Task 1); `ChartBody` (Task 2); `listOpReturnDaily` (`lib/marketing/opreturn-store`); the payload/series builder from `lib/marketing/public-opreturn` (reuse it to resolve each spec's `series[].key` to `{date,value}[]`); `loadOgLogomark`, `loadOgFont` (`lib/og-assets`); `WINDOW_LABELS` (`opreturn-types`).
- Produces: `GET(req)` → `ImageResponse` 1200×675, or `400` on bad params.

**Frame (copy verbatim from the card route's outer JSX):** dark bg `#0b1220`, padding 72, `fontFamily: "Geist"`; header row = logomark + `SUBFROST` + `WINDOW_LABELS[window]` (right); middle = `<ChartBody>` filling the space with the chart title above it (`spec.title`, `fontSize` ~40, `ink`); footer = `subfrost.io/metrics · as of ${asOf}`. Reuse `#0b1220/#fff/#aab8d6/#5dcaa5` and the light-theme values from the card route.

- [ ] **Step 1:** Write `tests/marketing/chart-route.test.ts`: mock `listOpReturnDaily` to return a small rows fixture; call `GET` with `?id=diesel-mints-per-day&window=full` → status 200, `content-type` `image/png`, and a `Cache-Control` header equal to the card route's `CACHE`; call with `?id=__nope__` → 400; call with `?id=byte-composition` (stacked) and `?id=bytes-donut` (donut) → 200 (exercises all three draw paths).
- [ ] **Step 2:** Run the test — expect FAIL.
- [ ] **Step 3:** Implement the route mirroring `app/metrics/card/opreturn/route.tsx` (runtime nodejs, force-dynamic). Resolve series from the payload builder; if a series key is missing/empty the line just breaks (null), never throws — a stats failure must not 500 (return the frame with an empty plot area, consistent with the page's graceful-empty behavior).
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit `feat(metrics): /metrics/chart/opreturn canonical chart image route`.

## Task 4: ShareMenu — "Copy chart" + relabel

**Files:**
- Modify: `components/share/ShareMenu.tsx`
- Test: `tests/share/share-menu.test.tsx`

**Interfaces:**
- Consumes: `copyImageToClipboard` (already imported).
- Produces: `ShareMenu` accepts new optional `chartUrl?: string`. When set, a "Copy chart" / "复制图表" menu item appears FIRST (before "Copy stat card"), calling `copyImageToClipboard(chartUrl)` with the same success/fallback + "paste it" hint behavior as the card image. When `imageUrl` (card) is also present, its item label becomes "Copy stat card" / "复制数据卡" (was "Copy image"). "Post on X" copies `chartUrl` if present, else `imageUrl`.

- [ ] **Step 1:** Add tests to `tests/share/share-menu.test.tsx`: with `chartUrl` set, a "Copy chart" item renders and clicking it calls the clipboard write (mock `navigator.clipboard` with `Object.defineProperty` per the existing pattern); with both `chartUrl` and `imageUrl`, both items render and "Copy chart" is before "Copy stat card"; the old label "Copy image" no longer renders when a card is present (now "Copy stat card").
- [ ] **Step 2:** Run `vitest run tests/share/share-menu.test.tsx` — expect FAIL.
- [ ] **Step 3:** Implement: add `chartUrl` to props + COPY strings (`copyChart`/`chartCopied`, and rename `copyImage`→ keep for stat card but new `copyStatCard` label), a `copyChart()` handler, and the menu item ordering. Keep pointerdown-dismiss + status handling intact.
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit `feat(share): Copy chart item + stat-card relabel in ShareMenu`.

## Task 5: Wire every /metrics chart to Copy chart

**Files:**
- Modify: `components/data/OpReturnCharts.tsx`
- Test: extend `tests/marketing/*` or add a small structural test asserting each chart id resolves to a spec.

**Interfaces:**
- Consumes: `chartImageUrl` (Task 1); `windowMode`→`WindowKey` mapping already in the file (`cardWindow`).
- Produces: every `<Card>` passes `chartUrl={chartImageUrl(id, cardWindow, "dark")}`; the `Card`/`ShareMenu` render "Copy chart" for ALL 21 (including the 13 that today only have a link or a card). Cumulative/since-genesis charts pass `window:"full"` like their cards.

- [ ] **Step 1:** Write a test asserting: for every chart id used in `OpReturnCharts`, `CHART_SPECS[id]` exists (guards against a wired id with no spec). If a render test is impractical, assert the id set equals `Object.keys(CHART_SPECS)`.
- [ ] **Step 2:** Run — expect FAIL (ids not wired / mismatched).
- [ ] **Step 3:** Thread `chartUrl` through `Card` (add prop) and every call site; align ids with `CHART_SPECS`.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit `feat(metrics): expose Copy chart on all OP_RETURN charts`.

## Task 6: Local visual proof + ship

**Files:** none new (verification + deploy).

- [ ] **Step 1:** Render sample PNGs locally to eyeball the three draw types. Since the route needs a DB, use the card-route's known-good pattern OR a tiny harness: a script that imports `ChartBody` with the live `history.csv` rows and rasterizes via `@resvg/resvg-js` (already a dep, used by the banner kit) to `scratchpad/*.png`. Produce: a 1-series line (`diesel-mints-per-day`), a 2-series (`runes-vs-alkanes-share`), a stacked (`byte-composition`), and the donut (`bytes-donut`). Confirm: title present, axes+ticks legible, footer `subfrost.io/metrics · as of <date>` present, dark theme, no clipped legend. **Share these PNGs with the user before deploying** (no preview env; this is the sign-off).
- [ ] **Step 2:** Gate: `tsc --noEmit` (0), `eslint` edited files (0), `vitest run tests/marketing tests/share` (green), and a worktree build check (`rmdir node_modules` junction + `pnpm install --prefer-offline` + `prisma generate` + `pnpm build`, per the Next 16 Turbopack junction gotcha).
- [ ] **Step 2b:** After user sign-off on the PNGs: push branch, open PR.
- [ ] **Step 3:** Merge squash; watch "Deploy to GCP" for the image; confirm the image tag in Artifact Registry; bump `k8s/kustomization.yaml` `newTag` (FULL SHA, QUOTED) in a `deploy(io):` commit direct to main; poll the deployment image then `rollout status`.
- [ ] **Step 4:** Verify prod: `curl -s -o /dev/null -w "%{http_code}" "https://subfrost.io/metrics/chart/opreturn?id=diesel-mints-per-day&window=full"` → 200 `image/png`; bad id → 400. Confirm on `/metrics` the share menu shows "Copy chart".

---

## Self-Review notes
- **Coverage:** spec (frame/attribution/no-DOM-shot/enum/labels/gate) maps to Global Constraints + Tasks 1–6. The "all 21" scope is Task 1 (spec map) + Task 5 (wiring); donut+stacked draw paths are exercised in Task 3 Step 1.
- **Open item for Task 1/3:** confirm whether `getPublicOpReturnData` already exposes every series a spec needs (it feeds the page's 21 charts, so it should). If a series is page-computed inline (not in the payload), add it to the payload builder rather than recomputing in the route (DRY) — noted in File Structure.
- **Type consistency:** `chartImageUrl(id, window, theme)` / `parseChartParams` / `ChartSpec` names are used identically in Tasks 1, 3, 5.
