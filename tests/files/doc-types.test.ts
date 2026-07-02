import { describe, it, expect } from "vitest"
import {
  DOC_TYPES, DOC_TYPE_GROUPS, DOC_TYPE_SLUGS, DOC_TYPE_LABEL, DOC_STATUS_SLUGS,
  isDocType, isDocStatus,
} from "@/lib/files/doc-types"

describe("doc-types taxonomy", () => {
  it("has unique slugs and a label for each type", () => {
    expect(new Set(DOC_TYPE_SLUGS).size).toBe(DOC_TYPE_SLUGS.length)
    for (const d of DOC_TYPES) expect(DOC_TYPE_LABEL[d.slug]).toBe(d.label)
  })

  it("assigns every type to a declared group", () => {
    for (const d of DOC_TYPES) expect(DOC_TYPE_GROUPS).toContain(d.group)
  })

  it("keeps residual + new buckets present", () => {
    for (const s of ["other", "nda", "media_asset", "safe", "token_rights", "valuation_409a"]) {
      expect(DOC_TYPE_SLUGS).toContain(s)
    }
  })

  it("validates slugs via guards", () => {
    expect(isDocType("safe")).toBe(true)
    expect(isDocType("not_a_type")).toBe(false)
    expect(isDocType(null)).toBe(false)
    expect(isDocStatus("executed")).toBe(true)
    expect(isDocStatus("bogus")).toBe(false)
    expect(DOC_STATUS_SLUGS).toContain("na")
  })
})
