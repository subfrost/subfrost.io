import { describe, it, expect } from "vitest"
import {
  dueState, daysUntil, nextOccurrence, obligationHealth, parseISODate,
  OBLIGATION_SEED, ObligationUpsertSchema,
  type ObligationStatus,
} from "@/lib/compliance/obligations-schema"

// Fixed "now": 2026-07-14T00:00:00Z
const NOW = Date.parse("2026-07-14T00:00:00Z")

describe("parseISODate", () => {
  it("parses a date-only string to UTC midnight", () => {
    expect(parseISODate("2026-07-14")).toBe(NOW)
  })
  it("rejects junk", () => {
    expect(parseISODate("nope")).toBeNull()
    expect(parseISODate(null)).toBeNull()
    expect(parseISODate("2026/07/14")).toBeNull()
  })
})

describe("dueState", () => {
  it("flags a past date as overdue when not settled", () => {
    expect(dueState("2026-06-01", "NOT_STARTED", NOW)).toBe("overdue")
  })
  it("never flags a settled item as overdue", () => {
    for (const s of ["COMPLETE", "FILED", "NOT_APPLICABLE"] as ObligationStatus[]) {
      expect(dueState("2020-01-01", s, NOW)).toBe("none")
    }
  })
  it("flags within 30 days as due-soon", () => {
    expect(dueState("2026-08-01", "NOT_STARTED", NOW)).toBe("due-soon")
  })
  it("far future is upcoming", () => {
    expect(dueState("2027-01-01", "NOT_STARTED", NOW)).toBe("upcoming")
  })
  it("no date is none", () => {
    expect(dueState(null, "NOT_STARTED", NOW)).toBe("none")
  })
})

describe("daysUntil", () => {
  it("is negative for overdue, positive for future", () => {
    expect(daysUntil("2026-07-04", NOW)).toBe(-10)
    expect(daysUntil("2026-07-24", NOW)).toBe(10)
    expect(daysUntil(null, NOW)).toBeNull()
  })
})

describe("nextOccurrence", () => {
  it("advances by cadence", () => {
    expect(nextOccurrence("2026-03-01", "ANNUAL")).toBe("2027-03-01")
    expect(nextOccurrence("2026-12-31", "BIENNIAL")).toBe("2028-12-31")
    expect(nextOccurrence("2026-08-01", "MONTHLY")).toBe("2026-09-01")
    expect(nextOccurrence("2026-01-15", "QUARTERLY")).toBe("2026-04-15")
  })
  it("returns null for non-recurring cadences", () => {
    expect(nextOccurrence("2026-03-01", "ONE_TIME")).toBeNull()
    expect(nextOccurrence("2026-03-01", "AS_NEEDED")).toBeNull()
  })
})

describe("obligationHealth", () => {
  it("counts overdue, due-soon, blocked, settled and excludes N/A from tracked", () => {
    const rows = [
      { dueDate: "2026-06-01", status: "NOT_STARTED" as ObligationStatus }, // overdue
      { dueDate: "2026-08-01", status: "IN_PROGRESS" as ObligationStatus }, // due-soon + inProgress
      { dueDate: "2027-01-01", status: "NOT_STARTED" as ObligationStatus }, // upcoming
      { dueDate: "2026-01-01", status: "COMPLETE" as ObligationStatus },    // settled
      { dueDate: "2026-05-01", status: "BLOCKED" as ObligationStatus },     // overdue + blocked
      { dueDate: null, status: "NOT_APPLICABLE" as ObligationStatus },      // excluded
    ]
    const h = obligationHealth(rows, NOW)
    expect(h.total).toBe(6)
    expect(h.tracked).toBe(5) // N/A excluded
    expect(h.overdue).toBe(2)
    expect(h.dueSoon).toBe(1)
    expect(h.blocked).toBe(1)
    expect(h.inProgress).toBe(1)
    expect(h.settled).toBe(1)
    // on-track = tracked(5) - overdue(2) - blocked(1) = 2 → 40%
    expect(h.score).toBe(40)
  })
  it("is 100 with nothing tracked", () => {
    expect(obligationHealth([], NOW).score).toBe(100)
  })
})

describe("OBLIGATION_SEED", () => {
  it("has unique keys", () => {
    const keys = OBLIGATION_SEED.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it("every seed row validates against the upsert schema", () => {
    for (const s of OBLIGATION_SEED) {
      const res = ObligationUpsertSchema.safeParse({
        title: s.title, category: s.category, authority: s.authority,
        description: s.description, cadence: s.cadence, dueDate: s.dueDate,
        status: s.status, owner: s.owner, lastCompletedAt: s.lastCompletedAt ?? null,
        notes: s.notes ?? null,
      })
      expect(res.success, `${s.key}: ${res.success ? "" : JSON.stringify(res.error?.issues)}`).toBe(true)
    }
  })
  it("covers the core company obligation categories", () => {
    const cats = new Set(OBLIGATION_SEED.map((s) => s.category))
    for (const c of ["TAX", "CORPORATE", "AML_BSA", "LICENSING", "SECURITIES"]) {
      expect(cats.has(c as typeof OBLIGATION_SEED[number]["category"])).toBe(true)
    }
  })
})
