import { describe, it, expect, vi } from "vitest"
import {
  parseFincenDumps, mapFincenType, validateFincenDrafts, migrateFincen,
  type DraftLoadRow, type SubmissionLoadRow,
} from "@/lib/fincen/migrate"

describe("mapFincenType", () => {
  it("maps source kebab types to the enum", () => {
    expect(mapFincenType("form-107")).toBe("FORM107")
    expect(mapFincenType("sar")).toBe("SAR")
    expect(mapFincenType("ctr")).toBe("CTR")
  })
  it("throws on an unknown type", () => {
    expect(() => mapFincenType("xxx" as never)).toThrow(/unknown fincen type/)
  })
})

describe("parseFincenDumps", () => {
  it("merges form107 (singleton array) + sar + ctr into drafts and maps submissions, preserving ids", () => {
    const form107 = JSON.stringify([{ id: "f107_1", type: "form-107", data: { legalName: "X" }, updatedAt: "t", updatedBy: "a" }])
    const sar = JSON.stringify([{ id: "sar_1", type: "sar", data: { n: 1 }, updatedAt: "t", updatedBy: "a" }])
    const ctr = JSON.stringify([])
    const submissions = JSON.stringify([
      { id: "sub_1", draftId: "f107_1", type: "form-107", submittedAt: "t2", submittedBy: "b", trackingId: "LOCAL-AAA", status: "queued" },
    ])
    const { drafts, submissions: subs } = parseFincenDumps({ form107, sar, ctr, submissions })
    expect(drafts).toEqual([
      { id: "f107_1", type: "FORM107", data: { legalName: "X" }, updatedBy: "a" },
      { id: "sar_1", type: "SAR", data: { n: 1 }, updatedBy: "a" },
    ])
    expect(subs).toEqual([
      { id: "sub_1", draftId: "f107_1", type: "FORM107", trackingId: "LOCAL-AAA", status: "QUEUED", message: null, submittedBy: "b", submittedAt: "t2" },
    ])
  })
  it("treats missing/empty collection text as empty", () => {
    const { drafts, submissions } = parseFincenDumps({})
    expect(drafts).toEqual([])
    expect(submissions).toEqual([])
  })
  it("throws on an unknown submission status", () => {
    const submissions = JSON.stringify([
      { id: "sub_bad", draftId: "f107_1", type: "form-107", submittedAt: "t", submittedBy: "a", trackingId: "LOCAL-ZZZ", status: "bogus" },
    ])
    expect(() => parseFincenDumps({ submissions })).toThrow(/unknown submission status/)
  })
})

describe("validateFincenDrafts", () => {
  it("warns on a draft whose data fails its schema, by id", () => {
    const drafts: DraftLoadRow[] = [{ id: "sar_bad", type: "SAR", data: { nope: true }, updatedBy: "a" }]
    const warnings = validateFincenDrafts(drafts)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("sar_bad")
  })
})

describe("migrateFincen", () => {
  it("upserts drafts BEFORE submissions and returns counts", async () => {
    const order: string[] = []
    const drafts: DraftLoadRow[] = [{ id: "f107_1", type: "FORM107", data: {}, updatedBy: "a" }]
    const submissions: SubmissionLoadRow[] = [
      { id: "sub_1", draftId: "f107_1", type: "FORM107", trackingId: "LOCAL-AAA", status: "QUEUED", message: null, submittedBy: "b", submittedAt: "t" },
    ]
    const upsertDraft = vi.fn(async (_d: DraftLoadRow) => { order.push("draft") })
    const upsertSubmission = vi.fn(async (_s: SubmissionLoadRow) => { order.push("sub") })
    const res = await migrateFincen(drafts, submissions, { upsertDraft, upsertSubmission })
    expect(order).toEqual(["draft", "sub"])
    expect(res).toEqual({ drafts: 1, submissions: 1 })
  })
})
