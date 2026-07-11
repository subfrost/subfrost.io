import { describe, it, expect } from "vitest"
import { niceTicks, projectX, projectY, linePath, areaPolygon, stackedAreaPolygons, donutArcs, ChartBody } from "@/lib/marketing/chart-draw"

// Pure-math tests for the /metrics "Copy chart" SVG drawing engine (Task 2). ChartBody itself is
// smoke-tested at the bottom (valid element, no throw) since it's JSX meant for satori, not DOM.

describe("niceTicks", () => {
  it("linear: covers [min,max] with a small, evenly-rounded, increasing set of ticks", () => {
    const ticks = niceTicks(0, 1, 5, "linear")
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks[0]).toBeLessThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
    // "nicely rounded" -> every step is the same, and that step is a 1/2/5 x 10^n multiple
    const step = ticks[1] - ticks[0]
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeCloseTo(step, 10)
  })

  it("log: returns exactly the powers of ten within [min,max]", () => {
    expect(niceTicks(1, 1000, 4, "log")).toEqual([1, 10, 100, 1000])
  })

  it("degenerate min===max still returns at least one tick", () => {
    expect(niceTicks(5, 5, 5, "linear")).toEqual([5])
  })
})

describe("projectX", () => {
  it("spreads n points evenly across width w, first at 0 and last at w", () => {
    expect(projectX(0, 5, 100)).toBe(0)
    expect(projectX(4, 5, 100)).toBe(100)
    expect(projectX(2, 5, 100)).toBeCloseTo(50, 10)
  })

  it("a single point sits at the left edge (no division by zero)", () => {
    expect(projectX(0, 1, 100)).toBe(0)
  })
})

describe("projectY", () => {
  it("linear: min maps to h (bottom), max maps to 0 (top)", () => {
    expect(projectY(10, 10, 50, 200, "linear")).toBe(200)
    expect(projectY(50, 10, 50, 200, "linear")).toBe(0)
  })

  it("log: min maps to h (bottom), max maps to 0 (top)", () => {
    expect(projectY(1, 1, 1000, 200, "log")).toBe(200)
    expect(projectY(1000, 1, 1000, 200, "log")).toBe(0)
  })
})

describe("linePath", () => {
  it("draws one continuous segment (a single M) when there are no nulls", () => {
    const d = linePath([1, 2, 3], 0, 3, 100, 50, "linear")
    expect((d.match(/M/g) ?? []).length).toBe(1)
    expect(d.startsWith("M")).toBe(true)
  })

  it("skips nulls, breaking the line into a new M subpath (fewer plotted points, more segments)", () => {
    const withGap = linePath([1, null, 2, 3], 0, 3, 100, 50, "linear")
    // 3 non-null values plotted (vs 4 total) -> 3 coordinate commands, split across 2 segments
    const commands = withGap.match(/[ML]-?\d/g) ?? []
    expect(commands.length).toBe(3)
    expect((withGap.match(/M/g) ?? []).length).toBe(2)
    // never plots the null as 0: no coordinate pair has y === projectY(0,...)
    const zeroY = projectY(0, 0, 3, 50, "linear")
    expect(withGap.includes(`,${zeroY}`)).toBe(false)
  })

  it("all-null input produces an empty path", () => {
    expect(linePath([null, null], 0, 1, 100, 50, "linear")).toBe("")
  })
})

describe("areaPolygon", () => {
  it("closes the shape back down to the baseline (first and last x repeated at y=h)", () => {
    const pts = areaPolygon([1, 2, 3], 0, 3, 100, 50, "linear")
    const pairs = pts.split(" ")
    expect(pairs.length).toBe(5) // 3 top points + 2 baseline closing points
    expect(pairs[3].endsWith(",50")).toBe(true)
    expect(pairs[4].endsWith(",50")).toBe(true)
  })
})

describe("stackedAreaPolygons", () => {
  it("returns one polygon per series, stacked so higher series sit on top of lower ones", () => {
    const polys = stackedAreaPolygons([[1, 1], [1, 1]], 0, 2, 100, 100, "linear")
    expect(polys.length).toBe(2)
    // second series' top edge should be higher on screen (smaller y) than the first's, since it stacks above
    const firstTopY = Number(polys[0].split(" ")[0].split(",")[1])
    const secondTopY = Number(polys[1].split(" ")[0].split(",")[1])
    expect(secondTopY).toBeLessThan(firstTopY)
  })
})

describe("donutArcs", () => {
  it("returns one d per slice, each starting with M, starting at 12 o'clock", () => {
    const slices = [
      { value: 1, color: "#111" },
      { value: 1, color: "#222" },
      { value: 2, color: "#333" },
    ]
    const arcs = donutArcs(slices, 50, 50, 40, 20)
    expect(arcs.length).toBe(3)
    for (const a of arcs) expect(a.d.startsWith("M")).toBe(true)
    // first slice starts at 12 o'clock: (cx, cy - rOuter) = (50, 10)
    expect(arcs[0].d.startsWith("M50,10")).toBe(true)
  })

  it("sweeps clockwise: for a 25% first slice, the SVG sweep-flag is 1 and the endpoint moves toward 3 o'clock", () => {
    // 25% / 75% split (pie wedges, rInner=0): first slice should run 12 o'clock -> 3 o'clock.
    // d = "M{cx},{cy} L{startX},{startY} A{r},{r} 0 {largeArc} {sweep} {endX},{endY} Z"
    const arcs = donutArcs(
      [
        { value: 1, color: "#111" }, // 25%
        { value: 3, color: "#222" }, // 75%
      ],
      50,
      50,
      40,
      0,
    )
    const match = arcs[0].d.match(/A[\d.]+,[\d.]+ 0 \d (\d) (-?[\d.]+),(-?[\d.]+)/)
    expect(match).not.toBeNull()
    const [, sweepFlag, endX] = match!
    // SVG sweep-flag=1 = positive-angle direction, i.e. clockwise in SVG's y-down coordinate space
    expect(sweepFlag).toBe("1")
    // 12 o'clock start is (cx, cy - r) = (50, 10); clockwise from there moves toward 3 o'clock (x increases past cx=50)
    expect(Number(endX)).toBeGreaterThan(50)
  })

  it("a lone full-circle slice (start === end at 12 o'clock) still renders a valid path", () => {
    const arcs = donutArcs([{ value: 1, color: "#111" }], 0, 0, 10, 0)
    expect(arcs[0].d).toMatch(/^M/)
  })

  it("colors pass through unchanged, in the same order as the input slices", () => {
    const arcs = donutArcs(
      [
        { value: 3, color: "#aaa" },
        { value: 1, color: "#bbb" },
      ],
      0,
      0,
      10,
      0,
    )
    expect(arcs.map((a) => a.color)).toEqual(["#aaa", "#bbb"])
  })
})

describe("ChartBody", () => {
  const lineSpec = {
    id: "test-line",
    title: "Test line",
    type: "line" as const,
    scale: "linear" as const,
    valueFormat: "pct" as const,
    series: [{ key: "a", label: "A", color: "#5dcaa5" }],
  }
  const rows = [
    { date: "2026-01-01", a: 0.1 },
    { date: "2026-01-02", a: 0.2 },
    { date: "2026-01-03", a: null },
    { date: "2026-01-04", a: 0.4 },
  ]

  it("renders a valid element for a line chart without throwing", () => {
    const el = ChartBody({ spec: lineSpec, rows, width: 800, height: 400, ink: "#fff", muted: "#aab8d6", grid: "#22304d" })
    expect(el).toBeTruthy()
    // Top-level wrapper is a <div> (position:relative), not a raw <svg> -- axis/tick text is
    // rendered as absolutely-positioned <div>s next to the <svg>, since satori rejects <text>
    // nodes embedded inside a raw <svg> subtree (see the comment above anchorTransform()).
    expect(el.type).toBe("div")
  })

  it("renders a valid element for an empty dataset without throwing", () => {
    const el = ChartBody({ spec: lineSpec, rows: [], width: 800, height: 400, ink: "#fff", muted: "#aab8d6", grid: "#22304d" })
    expect(el).toBeTruthy()
    expect(el.type).toBe("div")
  })

  it("renders a valid element for a donut chart without throwing", () => {
    const donutSpec = {
      id: "test-donut",
      title: "Test donut",
      type: "donut" as const,
      scale: "linear" as const,
      valueFormat: "count" as const,
      series: [],
      donutSlices: [
        { key: "alkanes", label: "Alkanes", color: "#5dcaa5" },
        { key: "other", label: "Other", color: "#4a4a52" },
      ],
    }
    const donutRows = [{ date: "2026-01-04", alkanes: 70, other: 30 }]
    const el = ChartBody({ spec: donutSpec, rows: donutRows, width: 800, height: 400, ink: "#fff", muted: "#aab8d6", grid: "#22304d" })
    expect(el).toBeTruthy()
    expect(el.type).toBe("div")
  })
})
