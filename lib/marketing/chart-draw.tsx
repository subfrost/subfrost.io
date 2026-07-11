import type { JSX } from "react"
import type { ChartScale, ChartSpec, SeriesRef } from "./chart-specs"

// Pure SVG chart-drawing engine for the /metrics "Copy chart" PNG export (app/metrics/chart/opreturn,
// a later task) rendered by next/og's ImageResponse (satori), NOT a browser. Satori only supports a
// limited SVG subset -- the proven pattern is sparkline() in app/metrics/card/opreturn/route.tsx: an
// inline <svg> containing leaf elements (polyline/polygon/path/line/text/rect) with inline
// presentation attributes. No CSS classes, no <g>/transform, no foreignObject; every non-leaf node
// needs an explicit style={{ display: "flex" }}.
//
// Because satori has no <g transform>, ChartBody bakes the left/bottom axis margin directly into
// absolute coordinates: linePath/areaPolygon/stackedAreaPolygons compute in a local 0..w / 0..h
// space (as specced) and shiftCoords() re-anchors that output into the plot rect. donutArcs already
// takes an absolute cx/cy so it needs no shifting.
//
// Pure + client-safe: no data fetching, no server-only imports, no ImageResponse here.

/** One row of chart data: `date` for the x-axis, plus one numeric field per `SeriesRef.key` /
 *  `donutSlices[].key` (null = no data that day; never coerced to 0). For type:"donut", ChartBody
 *  reads the LAST row as the single snapshot to slice up (mirrors the page's "latest day" donuts). */
export interface ChartRow {
  date: string
  [key: string]: number | string | null
}

// ---------------------------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------------------------

/** Rounded axis tick values. Linear: a "nice" 1/2/5 x 10^n step spanning [min,max]. Log: the
 *  powers of ten within [min,max] (matches the page's YAxis domain={[1, "auto"]} for log charts). */
export function niceTicks(min: number, max: number, count: number, scale: ChartScale): number[] {
  return scale === "log" ? niceLogTicks(min, max) : niceLinearTicks(min, max, count)
}

function niceLinearTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (lo === hi) return [lo]
  const n = Math.max(2, count)
  const rawStep = (hi - lo) / (n - 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = niceNormalized * magnitude
  const niceMin = Math.floor(lo / step) * step
  const niceMax = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2 && ticks.length < 50; v += step) {
    ticks.push(Number(v.toFixed(10)))
  }
  return ticks
}

function niceLogTicks(min: number, max: number): number[] {
  const lo = min > 0 ? min : 1
  const hi = Math.max(max, lo)
  const loExp = Math.floor(Math.log10(lo) + 1e-9)
  const hiExp = Math.ceil(Math.log10(hi) - 1e-9)
  const ticks: number[] = []
  for (let e = loExp; e <= hiExp; e++) {
    const v = Math.pow(10, e)
    if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) ticks.push(v)
  }
  return ticks.length ? ticks : [lo, hi]
}

/** X position for point `i` of `n`, spread evenly across width `w`. A single point sits at 0
 *  (no division by zero). */
export function projectX(i: number, n: number, w: number): number {
  if (n <= 1) return 0
  return (i / (n - 1)) * w
}

/** Y position for value `v` scaled onto height `h`: `min` -> `h` (bottom), `max` -> `0` (top). */
export function projectY(v: number, min: number, max: number, h: number, scale: ChartScale): number {
  if (scale === "log") {
    const lo = Math.log10(min > 0 ? min : Number.MIN_VALUE)
    const hi = Math.log10(max > 0 ? max : Number.MIN_VALUE)
    const val = Math.log10(v > 0 ? v : Number.MIN_VALUE)
    const span = hi - lo || 1
    return h - ((val - lo) / span) * h
  }
  const span = max - min || 1
  return h - ((v - min) / span) * h
}

/** SVG path `d` for a line, in local 0..w / 0..h space. Starts a new `M` subpath after each null
 *  so the line visibly BREAKS at a gap instead of interpolating through it or plotting it as 0. */
export function linePath(values: (number | null)[], min: number, max: number, w: number, h: number, scale: ChartScale): string {
  const n = values.length
  const parts: string[] = []
  let penDown = false
  for (let i = 0; i < n; i++) {
    const v = values[i]
    if (v === null || !Number.isFinite(v)) {
      penDown = false
      continue
    }
    const x = round(projectX(i, n, w))
    const y = round(projectY(v, min, max, h, scale))
    parts.push(`${penDown ? "L" : "M"}${x},${y}`)
    penDown = true
  }
  return parts.join(" ")
}

/** SVG `polygon` points for the filled area under one series, local 0..w / 0..h space: the top
 *  line's non-null points, then closed back down to the baseline (y=h) under the last and first. */
export function areaPolygon(values: (number | null)[], min: number, max: number, w: number, h: number, scale: ChartScale): string {
  const n = values.length
  const top: { x: number; y: number }[] = []
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return
    top.push({ x: round(projectX(i, n, w)), y: round(projectY(v, min, max, h, scale)) })
  })
  if (top.length === 0) return ""
  const first = top[0]
  const last = top[top.length - 1]
  const pts = top.map((p) => `${p.x},${p.y}`)
  pts.push(`${last.x},${h}`, `${first.x},${h}`)
  return pts.join(" ")
}

/** Stacked-area polygon points, one per series in `seriesValues` order (bottom to top). Each
 *  series' baseline is the running cumulative sum of the ones stacked below it; a null value
 *  contributes 0 to the stack (a gap in one series doesn't collapse the ones above it). */
export function stackedAreaPolygons(
  seriesValues: (number | null)[][],
  min: number,
  max: number,
  w: number,
  h: number,
  scale: ChartScale,
): string[] {
  if (seriesValues.length === 0) return []
  const n = seriesValues[0].length
  const cumulative = new Array<number>(n).fill(0)
  return seriesValues.map((vals) => {
    const topPts: string[] = []
    const basePts: string[] = []
    for (let i = 0; i < n; i++) {
      const raw = vals[i]
      const contribution = raw !== null && Number.isFinite(raw) ? raw : 0
      const base = cumulative[i]
      const top = base + contribution
      cumulative[i] = top
      const x = round(projectX(i, n, w))
      topPts.push(`${x},${round(projectY(top, min, max, h, scale))}`)
      basePts.unshift(`${x},${round(projectY(base, min, max, h, scale))}`)
    }
    return [...topPts, ...basePts].join(" ")
  })
}

/** SVG path `d` per donut/pie slice, ABSOLUTE cx/cy (unlike the line/area helpers above, which are
 *  local-space). 12 o'clock start, sweeping clockwise -- matches the page's LabeledPie (Recharts
 *  startAngle 90 / endAngle -270). `rInner` 0 draws a pie wedge to center instead of a donut band. */
export function donutArcs(
  slices: { value: number; color: string }[],
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
): { d: string; color: string }[] {
  const total = slices.reduce((s, sl) => s + Math.max(0, sl.value), 0)
  const TAU = Math.PI * 2
  let angle = -Math.PI / 2 // 12 o'clock: (cx, cy - r)
  const point = (r: number, a: number) => ({ x: round(cx + r * Math.cos(a)), y: round(cy + r * Math.sin(a)) })
  return slices.map((slice) => {
    const frac = total > 0 ? Math.max(0, slice.value) / total : 0
    const start = angle
    const end = angle + frac * TAU
    angle = end
    const largeArc = end - start > Math.PI ? 1 : 0
    const outerStart = point(rOuter, start)
    const outerEnd = point(rOuter, end)
    if (rInner > 0) {
      const innerStart = point(rInner, start)
      const innerEnd = point(rInner, end)
      const d =
        `M${outerStart.x},${outerStart.y} A${rOuter},${rOuter} 0 ${largeArc} 1 ${outerEnd.x},${outerEnd.y} ` +
        `L${innerEnd.x},${innerEnd.y} A${rInner},${rInner} 0 ${largeArc} 0 ${innerStart.x},${innerStart.y} Z`
      return { d, color: slice.color }
    }
    const d = `M${round(cx)},${round(cy)} L${outerStart.x},${outerStart.y} A${rOuter},${rOuter} 0 ${largeArc} 1 ${outerEnd.x},${outerEnd.y} Z`
    return { d, color: slice.color }
  })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** Re-anchors a linePath/areaPolygon/stackedAreaPolygons output (local 0..w/0..h space) into the
 *  plot rect: every comma-joined number pair in either a point-list ("x,y x,y") or a path
 *  ("M x,y L x,y") string is a coordinate. Do NOT use on donutArcs output -- its `d` also has
 *  comma-joined "rx,ry" radius pairs that are not coordinates (donutArcs takes absolute cx/cy
 *  instead, so it never needs shifting). */
function shiftCoords(s: string, dx: number, dy: number): string {
  if (!s) return s
  return s.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${round(Number(x) + dx)},${round(Number(y) + dy)}`)
}

// ---------------------------------------------------------------------------------------------
// ChartBody helpers
// ---------------------------------------------------------------------------------------------

function collectValues(rows: ChartRow[], key: string): (number | null)[] {
  return rows.map((r) => {
    const v = r[key]
    return typeof v === "number" && Number.isFinite(v) ? v : null
  })
}

/** Log scale can't plot <= 0 (matches the page's own guard in SingleLineChart: `d.value != null &&
 *  d.value > 0 ? d.value : null`) -- a zero/negative day becomes a gap, not a crash on log10(0). */
function sanitizeForScale(values: (number | null)[], scale: ChartScale): (number | null)[] {
  if (scale !== "log") return values
  return values.map((v) => (v !== null && v > 0 ? v : null))
}

function computeDomain(seriesValues: (number | null)[][], scale: ChartScale, stacked: boolean): { min: number; max: number } {
  if (stacked) {
    const n = seriesValues[0]?.length ?? 0
    let max = 0
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (const vals of seriesValues) sum += vals[i] ?? 0
      if (sum > max) max = sum
    }
    return { min: 0, max: max || 1 }
  }
  let min = Infinity
  let max = -Infinity
  for (const vals of seriesValues) {
    for (const v of vals) {
      if (v === null) continue
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
  if (scale === "log") return { min: 1, max: Math.max(max, 10) }
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    return { min: min - pad, max: max + pad }
  }
  return { min, max }
}

function round1(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? `${r}` : r.toFixed(1)
}

function formatTickLabel(v: number, format: ChartSpec["valueFormat"]): string {
  const abs = Math.abs(v)
  const compact = (n: number): string => {
    if (abs >= 1_000_000) return `${round1(n / 1_000_000)}M`
    if (abs >= 1_000) return `${round1(n / 1_000)}K`
    return Number.isInteger(n) ? `${n}` : n.toFixed(2)
  }
  if (format === "pct") return `${round1(v * 100)}%`
  if (format === "usd") return `$${compact(v)}`
  if (format === "bytes") return `${compact(v)}B`
  return compact(v)
}

// ---------------------------------------------------------------------------------------------
// ChartBody
// ---------------------------------------------------------------------------------------------

const LEFT_AXIS_W = 76
const BOTTOM_AXIS_H = 40
const TOP_PAD = 16
const RIGHT_PAD = 16
const TICK_COUNT = 5
const LINE_WIDTH = 3.5
const AXIS_FONT = 20

/**
 * satori (next/og's renderer) rejects literal `<text>` nodes embedded inside a raw `<svg>`
 * subtree -- confirmed directly against the bundled renderer (node_modules/next/dist/compiled/
 * @vercel/og/index.node.js): any SVG-tree node of type "text" throws `<text> nodes are not
 * currently supported, please convert them to <path>` at PNG-ENCODE time, not at JSX-construction
 * time -- so a smoke test that only inspects the returned element (never actually consuming the
 * ImageResponse body) doesn't catch it; this was found via the Task 3 route test, which does. Every
 * axis/legend/total label below is therefore rendered as an absolutely positioned `<div>` OUTSIDE
 * the `<svg>` (satori's own div/span text layout DOES support text; only its raw-SVG-embed path
 * doesn't) using `transform: translate(...)` to emulate SVG's textAnchor start/middle/end and
 * vertical centering -- satori supports `position: absolute`/`relative` and `transform` on div
 * nodes (its bundled Tailwind-utility compiler maps "absolute"/"relative" classes to exactly this,
 * confirmed in the same bundle). Only `<line>`/`<polygon>`/`<path>`/`<rect>` (no text) remain
 * inside the `<svg>` now.
 */
type Anchor = "start" | "middle" | "end"
const anchorTransform = (anchor: Anchor): string =>
  anchor === "start" ? "translate(0, -50%)" : anchor === "end" ? "translate(-100%, -50%)" : "translate(-50%, -50%)"

/** The axes + gridlines + series for one chart, sized to fit inside the frame's content area
 *  (`width`/`height` are the full area ChartBody draws into -- the caller's outer frame already
 *  accounts for its own title/logo/footer padding). Pure; no ImageResponse, no fetch. */
export function ChartBody({
  spec,
  rows,
  width,
  height,
  ink,
  muted,
  grid,
}: {
  spec: ChartSpec
  rows: ChartRow[]
  width: number
  height: number
  ink: string
  muted: string
  grid: string
}): JSX.Element {
  if (rows.length === 0) {
    return (
      <div style={{ display: "flex", width, height, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", color: muted, fontSize: 22 }}>No data</div>
      </div>
    )
  }

  if (spec.type === "donut") {
    return DonutBody({ spec, rows, width, height, ink, muted })
  }

  const plotX0 = LEFT_AXIS_W
  const plotY0 = TOP_PAD
  const plotW = Math.max(1, width - LEFT_AXIS_W - RIGHT_PAD)
  const plotH = Math.max(1, height - TOP_PAD - BOTTOM_AXIS_H)

  const rawSeries = spec.series.map((s) => sanitizeForScale(collectValues(rows, s.key), spec.scale))
  const domain = computeDomain(rawSeries, spec.scale, spec.type === "stacked")
  const ticks = niceTicks(domain.min, domain.max, TICK_COUNT, spec.scale)

  // niceTicks rounds UP/DOWN to a "nice" round number, which can land outside [domain.min,
  // domain.max] (e.g. data maxing at 102% rounds its top gridline to 150%). If the actual scaling
  // below kept using the un-widened domain, that overrun tick would project to a negative y (above
  // the plot's own top edge) and, since it's no longer clipped by an enclosing <svg> viewBox now
  // that labels are absolutely-positioned <div>s (see the satori <text> note above), it visibly
  // bled into the header/title above the chart -- caught by inspecting an actual rendered PNG, not
  // by any status/type assertion. Widening (never narrowing) the plotted range to also cover the
  // ticks' own min/max keeps every tick AND all data inside [0, plotH].
  const plotMin = Math.min(domain.min, ticks[0] ?? domain.min)
  const plotMax = Math.max(domain.max, ticks[ticks.length - 1] ?? domain.max)

  const n = rows.length
  const midIdx = Math.floor((n - 1) / 2)

  const gridLines = ticks.map((t) => {
    const y = round(plotY0 + projectY(t, plotMin, plotMax, plotH, spec.scale))
    return <line key={`grid-${t}`} x1={plotX0} y1={y} x2={plotX0 + plotW} y2={y} stroke={grid} strokeWidth={1} />
  })

  const tickLabels = ticks.map((t) => {
    const y = round(plotY0 + projectY(t, plotMin, plotMax, plotH, spec.scale))
    return (
      <div
        key={`tick-${t}`}
        style={{ position: "absolute", left: plotX0 - 10, top: y, transform: anchorTransform("end"), display: "flex", color: muted, fontSize: AXIS_FONT }}
      >
        {formatTickLabel(t, spec.valueFormat)}
      </div>
    )
  })

  const xLabelY = plotY0 + plotH + 28
  const xLabelIdx = [0, midIdx, n - 1].filter((i, idx, arr) => arr.indexOf(i) === idx)
  const xLabels = xLabelIdx.map((i, idx) => {
    const anchor: Anchor = idx === 0 ? "start" : idx === xLabelIdx.length - 1 ? "end" : "middle"
    return (
      <div
        key={`x-${i}`}
        style={{
          position: "absolute",
          left: round(plotX0 + projectX(i, n, plotW)),
          top: xLabelY,
          transform: anchorTransform(anchor),
          display: "flex",
          color: ink,
          fontSize: AXIS_FONT,
        }}
      >
        {rows[i].date}
      </div>
    )
  })

  let seriesNodes: JSX.Element[] = []
  if (spec.type === "stacked") {
    const polys = stackedAreaPolygons(rawSeries, plotMin, plotMax, plotW, plotH, spec.scale)
    seriesNodes = spec.series.map((s: SeriesRef, idx) => (
      <polygon key={s.key} points={shiftCoords(polys[idx] ?? "", plotX0, plotY0)} fill={s.color} fillOpacity={0.75} stroke="none" />
    ))
  } else if (spec.type === "area") {
    seriesNodes = spec.series.flatMap((s: SeriesRef, idx) => {
      const values = rawSeries[idx]
      const area = shiftCoords(areaPolygon(values, plotMin, plotMax, plotW, plotH, spec.scale), plotX0, plotY0)
      const line = shiftCoords(linePath(values, plotMin, plotMax, plotW, plotH, spec.scale), plotX0, plotY0)
      return [
        <polygon key={`${s.key}-fill`} points={area} fill={s.color} fillOpacity={0.22} stroke="none" />,
        <path key={`${s.key}-line`} d={line} fill="none" stroke={s.color} strokeWidth={LINE_WIDTH} />,
      ]
    })
  } else {
    seriesNodes = spec.series.map((s: SeriesRef, idx) => {
      const values = rawSeries[idx]
      const d = shiftCoords(linePath(values, plotMin, plotMax, plotW, plotH, spec.scale), plotX0, plotY0)
      return (
        <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={LINE_WIDTH} {...(s.dashed ? { strokeDasharray: "12 9" } : {})} />
      )
    })
  }

  return (
    <div style={{ display: "flex", position: "relative", width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "flex" }}>
        {gridLines}
        {seriesNodes}
      </svg>
      {tickLabels}
      {xLabels}
    </div>
  )
}

function DonutBody({
  spec,
  rows,
  width,
  height,
  ink,
  muted,
}: {
  spec: ChartSpec
  rows: ChartRow[]
  width: number
  height: number
  ink: string
  muted: string
}): JSX.Element {
  const donutSlices = spec.donutSlices ?? []
  const row = rows[rows.length - 1]
  const values = donutSlices.map((s) => {
    const v = row[s.key]
    return typeof v === "number" && Number.isFinite(v) ? v : 0
  })
  const total = values.reduce((a, b) => a + Math.max(0, b), 0)

  const legendH = 56
  const plotH = Math.max(1, height - legendH)
  const cx = width / 2
  const cy = plotH / 2
  const rOuter = Math.max(1, Math.min(width, plotH) / 2 - 12)
  const rInner = rOuter * 0.55

  const arcs = donutArcs(
    donutSlices.map((s, i) => ({ value: values[i], color: s.color })),
    cx,
    cy,
    rOuter,
    rInner,
  )

  const legendGap = width / Math.max(1, donutSlices.length)
  const legendSwatches = donutSlices.map((s, i) => {
    const x = legendGap * i + 12
    const swatchY = plotH + legendH / 2 - 10
    return <rect key={`${s.key}-swatch`} x={x} y={swatchY} width={16} height={16} fill={s.color} />
  })
  const legendLabels = donutSlices.map((s, i) => {
    const pct = total > 0 ? (Math.max(0, values[i]) / total) * 100 : 0
    const label = `${s.label} ${round1(pct)}%`
    const x = legendGap * i + 12
    const textY = plotH + legendH / 2 + 6
    return (
      <div
        key={`${s.key}-label`}
        style={{ position: "absolute", left: x + 22, top: textY, transform: "translate(0, -50%)", display: "flex", color: muted, fontSize: AXIS_FONT }}
      >
        {label}
      </div>
    )
  })

  return (
    <div style={{ display: "flex", position: "relative", width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "flex" }}>
        {arcs.map((a, i) => (
          <path key={donutSlices[i]?.key ?? i} d={a.d} fill={a.color} stroke="none" />
        ))}
        {legendSwatches}
      </svg>
      {rInner > 20 && (
        <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%, -50%)", display: "flex", color: ink, fontSize: 28 }}>
          {formatTickLabel(total, spec.valueFormat)}
        </div>
      )}
      {legendLabels}
    </div>
  )
}
