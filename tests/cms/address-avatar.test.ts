import { describe, it, expect } from "vitest"
import { avatarSpec, checksumHue, hashAddress } from "@/lib/avatar/address-avatar"

const A = "bc1pd8jmftgvpde3uynrsza2kz08x4h3wtf5trjp6ylgm52n2ug0xfgs959yfx"
const B = "bc1p06ycpfxds4ugymmnjq4qlvatzjssu6uumstdxa6xmeezq6tgps5qfy4ks7"

describe("address avatar", () => {
  it("is deterministic for the same address", () => {
    expect(avatarSpec(A)).toEqual(avatarSpec(A))
    expect(hashAddress(A)).toBe(hashAddress(A))
    expect(checksumHue(A)).toBe(checksumHue(A))
  })

  it("differs between addresses", () => {
    expect(avatarSpec(A)).not.toEqual(avatarSpec(B))
  })

  it("produces in-range feature indices and a valid hue", () => {
    const s = avatarSpec(A)
    expect(s.hairStyle).toBeGreaterThanOrEqual(0)
    expect(s.hairStyle).toBeLessThan(5)
    expect(s.eyes).toBeLessThan(3)
    expect(s.mouth).toBeLessThan(4)
    expect(checksumHue(A)).toBeGreaterThanOrEqual(0)
    expect(checksumHue(A)).toBeLessThan(360)
    expect(s.bg).toMatch(/^hsl\(/)
  })

  it("handles empty/whitespace input without throwing", () => {
    expect(() => avatarSpec("")).not.toThrow()
    expect(avatarSpec("  ")).toEqual(avatarSpec(""))
  })
})
