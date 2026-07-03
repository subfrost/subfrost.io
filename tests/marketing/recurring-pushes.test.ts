import { describe, it, expect } from "vitest"
import { expandOccurrences, type RecurrenceRule } from "@/lib/cms/recurring-pushes"

const friday = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const weekly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: "WEEKLY", dayOfWeek: 5, startDate: friday("2026-06-01"), endDate: null, active: true, ...over,
})

describe("expandOccurrences", () => {
  it("returns every Friday in June 2026 within range", () => {
    const out = expandOccurrences(weekly(), friday("2026-06-01"), friday("2026-06-30"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-05", "2026-06-12", "2026-06-19", "2026-06-26",
    ])
  })

  it("respects the range bounds inclusively", () => {
    const out = expandOccurrences(weekly(), friday("2026-06-12"), friday("2026-06-19"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-06-12", "2026-06-19"])
  })

  it("returns [] when inactive", () => {
    expect(expandOccurrences(weekly({ active: false }), friday("2026-06-01"), friday("2026-06-30"))).toEqual([])
  })

  it("honors endDate", () => {
    const out = expandOccurrences(weekly({ endDate: friday("2026-06-12") }), friday("2026-06-01"), friday("2026-06-30"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-06-05", "2026-06-12"])
  })

  it("BIWEEKLY keeps parity from startDate", () => {
    const out = expandOccurrences(weekly({ frequency: "BIWEEKLY" }), friday("2026-06-01"), friday("2026-07-05"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-06-05", "2026-06-19", "2026-07-03"])
  })

  it("MONTHLY uses dayOfMonth, clamping to month length", () => {
    const rule = weekly({ frequency: "MONTHLY", dayOfMonth: 31, startDate: friday("2026-01-01") })
    const out = expandOccurrences(rule, friday("2026-02-01"), friday("2026-04-30"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"])
  })
})
