import { describe, it, expect } from "vitest"
import { publishedCalendarDate } from "@/lib/cms/push-calendar"

describe("publishedCalendarDate", () => {
  it("prefers scheduledFor", () => {
    const d = publishedCalendarDate({ scheduledFor: new Date("2026-07-03T00:00:00.000Z"), publishedAt: new Date("2026-07-05T00:00:00.000Z") })
    expect(d?.toISOString().slice(0, 10)).toBe("2026-07-03")
  })
  it("falls back to publishedAt when no scheduledFor", () => {
    const d = publishedCalendarDate({ scheduledFor: null, publishedAt: new Date("2026-07-05T00:00:00.000Z") })
    expect(d?.toISOString().slice(0, 10)).toBe("2026-07-05")
  })
  it("returns null when both are null", () => {
    expect(publishedCalendarDate({ scheduledFor: null, publishedAt: null })).toBeNull()
  })
})
