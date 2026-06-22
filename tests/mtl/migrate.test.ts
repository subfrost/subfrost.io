import { describe, it, expect, vi } from "vitest"
import { parseMtlDump, mapMtlStatus, migrateMtl, type MtlLoadRow } from "@/lib/mtl/migrate"

describe("mapMtlStatus", () => {
  it("maps every kebab status to the SCREAMING_SNAKE enum", () => {
    expect(mapMtlStatus("agent-of-stripe")).toBe("AGENT_OF_STRIPE")
    expect(mapMtlStatus("registered")).toBe("REGISTERED")
    expect(mapMtlStatus("filed-pending")).toBe("FILED_PENDING")
    expect(mapMtlStatus("exempt")).toBe("EXEMPT")
    expect(mapMtlStatus("not-yet-needed")).toBe("NOT_YET_NEEDED")
    expect(mapMtlStatus("needs-filing")).toBe("NEEDS_FILING")
  })
  it("throws on an unknown status", () => {
    expect(() => mapMtlStatus("bogus")).toThrow(/unknown MTL status/)
  })
})

describe("parseMtlDump", () => {
  it("reads the singleton array-of-one {entries:[]} and maps each entry", () => {
    const json = JSON.stringify([
      {
        entries: [
          { state: "TX", name: "Texas", status: "registered", nextFilingDue: "2026-12-31", portalUrl: "https://x.test", notes: "n" },
          { state: "CA", name: "California", status: "agent-of-stripe" },
        ],
      },
    ])
    expect(parseMtlDump(json)).toEqual([
      { state: "TX", name: "Texas", status: "REGISTERED", nextFilingDue: "2026-12-31", portalUrl: "https://x.test", notes: "n" },
      { state: "CA", name: "California", status: "AGENT_OF_STRIPE", nextFilingDue: null, portalUrl: null, notes: null },
    ])
  })
  it("also accepts the bare {entries:[]} object form", () => {
    const json = JSON.stringify({ entries: [{ state: "NY", name: "New York", status: "exempt" }] })
    expect(parseMtlDump(json)[0]).toMatchObject({ state: "NY", status: "EXEMPT" })
  })
  it("throws when there is no entries array", () => {
    expect(() => parseMtlDump(JSON.stringify({ foo: 1 }))).toThrow(/entries/)
  })
})

describe("migrateMtl", () => {
  it("upserts each row and returns the total (idempotent effect injected)", async () => {
    const rows: MtlLoadRow[] = [
      { state: "TX", name: "Texas", status: "REGISTERED", nextFilingDue: null, portalUrl: null, notes: null },
      { state: "CA", name: "California", status: "AGENT_OF_STRIPE", nextFilingDue: null, portalUrl: null, notes: null },
    ]
    const upsertRow = vi.fn(async (_r: MtlLoadRow) => {})
    const res = await migrateMtl(rows, { upsertRow })
    expect(upsertRow).toHaveBeenCalledTimes(2)
    expect(res).toEqual({ total: 2 })
  })
})
