import { describe, it, expect } from "vitest"
import { toDateKey, buildMonthGrid, bucketByDate } from "@/lib/cms/calendar-grid"

describe("toDateKey", () => {
  it("formats a UTC date as YYYY-MM-DD", () => {
    expect(toDateKey(new Date("2026-06-05T00:00:00.000Z"))).toBe("2026-06-05")
  })
})

describe("buildMonthGrid", () => {
  it("June 2026 starts on the Sunday before June 1 (Mon)", () => {
    const weeks = buildMonthGrid(2026, 5) // 5 = June
    expect(weeks[0][0].toISOString().slice(0, 10)).toBe("2026-05-31")
    expect(weeks[0].length).toBe(7)
    const flat = weeks.flat().map((d) => d.toISOString().slice(0, 10))
    expect(flat).toContain("2026-06-29")
    expect(flat).toContain("2026-06-30")
  })
})

describe("bucketByDate", () => {
  it("groups items by UTC date key and skips nulls", () => {
    const items = [
      { id: "a", at: new Date("2026-06-05T00:00:00Z") },
      { id: "b", at: new Date("2026-06-05T00:00:00Z") },
      { id: "c", at: null },
    ]
    const map = bucketByDate(items, (x) => x.at)
    expect(map.get("2026-06-05")?.map((x) => x.id)).toEqual(["a", "b"])
    expect([...map.keys()]).toEqual(["2026-06-05"])
  })
})
