import crypto from "crypto"
import * as OTPAuth from "otpauth"
import QRCode from "qrcode"

// TOTP helpers for the CMS, matching sprimage's parameters: SHA1, 6 digits,
// 30s period, ±1 step validation window. Secrets are 20-byte base32.

const ISSUER = "SUBFROST"
const DIGITS = 6
const PERIOD = 30
const WINDOW = 1

function totp(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  })
}

/** A fresh random base32 secret (160 bits). */
export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32
}

export function getUri(secretBase32: string, label: string): string {
  return totp(secretBase32, label).toString()
}

export async function generateQrDataUri(secretBase32: string, label: string): Promise<string> {
  return QRCode.toDataURL(getUri(secretBase32, label))
}

/** Validate a 6-digit code against the secret. Returns true if within window. */
export function validateCode(secretBase32: string, label: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "")
  if (!/^\d{6}$/.test(clean)) return false
  const delta = totp(secretBase32, label).validate({ token: clean, window: WINDOW })
  return delta !== null
}

// --- Recovery codes --------------------------------------------------------

/** Generate N single-use recovery codes (8 hex chars, upper-cased). */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase(),
  )
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.replace(/\s+/g, "").toUpperCase()).digest("hex")
}
