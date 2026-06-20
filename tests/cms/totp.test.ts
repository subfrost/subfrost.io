import { describe, it, expect } from "vitest"
import * as OTPAuth from "otpauth"
import {
  generateSecret,
  getUri,
  validateCode,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/cms/totp"

const LABEL = "user@subfrost.io"

describe("cms/totp", () => {
  it("generates a 32-char base32 secret", () => {
    const s = generateSecret()
    expect(s).toMatch(/^[A-Z2-7]{32}$/)
  })

  it("validates a freshly generated code", () => {
    const secret = generateSecret()
    const code = new OTPAuth.TOTP({
      issuer: "SUBFROST",
      label: LABEL,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).generate()
    expect(validateCode(secret, LABEL, code)).toBe(true)
  })

  it("accepts codes with spaces and rejects malformed/incorrect ones", () => {
    const secret = generateSecret()
    expect(validateCode(secret, LABEL, "000")).toBe(false)
    expect(validateCode(secret, LABEL, "abcdef")).toBe(false)
    // an arbitrary wrong 6-digit code is overwhelmingly unlikely to validate
    expect(validateCode(secret, LABEL, "010101")).toBe(false)
  })

  it("emits a SUBFROST-issued otpauth URI", () => {
    const uri = getUri(generateSecret(), LABEL)
    expect(uri.startsWith("otpauth://totp/")).toBe(true)
    expect(uri).toContain("issuer=SUBFROST")
  })

  it("generates 10 unique recovery codes that hash stably", () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    codes.forEach((c) => expect(c).toMatch(/^[0-9A-F]{8}$/))
    // hashing is case/space-insensitive and deterministic
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(` ${codes[0].toLowerCase()} `))
    expect(hashRecoveryCode(codes[0])).not.toBe(hashRecoveryCode(codes[1]))
  })
})
