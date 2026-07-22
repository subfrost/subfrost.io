import { describe, it, expect } from "vitest"
import { isMeaningfulStat } from "@/lib/ecosystem/stat-visibility"

describe("isMeaningfulStat", () => {
  it("accepts positive numbers and positive numeric strings", () => {
    expect(isMeaningfulStat(1)).toBe(true)
    expect(isMeaningfulStat(0.0001)).toBe(true)
    expect(isMeaningfulStat(8383)).toBe(true)
    expect(isMeaningfulStat("66916515276188")).toBe(true)
  })

  it("rejects zero — zero means 'no market' or 'unknown', never 'worth nothing'", () => {
    // The bug this guard exists for: priceUsd was 0 (not null) on 5 of 8 projects,
    // slipped past a `!= null` check, and rendered as "$0.0000".
    expect(isMeaningfulStat(0)).toBe(false)
    expect(isMeaningfulStat("0")).toBe(false)
  })

  it("rejects absent values", () => {
    expect(isMeaningfulStat(null)).toBe(false)
    expect(isMeaningfulStat(undefined)).toBe(false)
    expect(isMeaningfulStat("")).toBe(false)
  })

  it("rejects negatives and non-numeric strings", () => {
    expect(isMeaningfulStat(-1)).toBe(false)
    expect(isMeaningfulStat("n/a")).toBe(false)
    expect(isMeaningfulStat(Number.NaN)).toBe(false)
    expect(isMeaningfulStat(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
