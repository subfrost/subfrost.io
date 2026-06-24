import { describe, it, expect } from "vitest"
import { fmtUsd, fmtInt, fmtNum } from "@/lib/marketing/format"

it("formats with em-dash for null", () => {
  expect(fmtInt(null)).toBe("—")
  expect(fmtUsd(null)).toBe("—")
  expect(fmtNum(null)).toBe("—")
})
it("formats numbers", () => {
  expect(fmtInt(7891)).toBe("7,891")
  expect(fmtUsd(67.45)).toBe("$67.45")
  expect(fmtNum(885.19, 2)).toBe("885.19")
})
