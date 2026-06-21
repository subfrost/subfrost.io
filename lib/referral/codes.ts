/**
 * Referral / invite-code domain logic. subfrost.io owns the referral graph
 * (codes + redemptions keyed by taproot address). Ported from subfrost-app's
 * `app/api/invite-codes/*`, minus the wallet-`User` creation (graph only — Q1).
 */
import prisma from "@/lib/prisma"
import { cacheGet, cacheSet, cacheDel } from "@/lib/redis"

const VALIDATE_CACHE_TTL = 60 // seconds — matches the old subfrost-app behavior

const validKey = (code: string) => `invite:valid:${code}`

/** Codes are matched case-insensitively; stored and compared uppercased. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/** Drop the 60s validation cache for a code. Call after the admin surface
 *  deactivates or deletes a code so the public validate/redeem path can't keep
 *  serving a stale `valid:true`. Owns the cache-key format so callers don't. */
export async function invalidateCodeValidation(rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode)
  if (code) await cacheDel(validKey(code))
}

export interface ValidateResult {
  valid: boolean
  error?: string
}

/** Is this code real and active? Cached for 60s (Redis + memory fallback). */
export async function validateCode(rawCode: string): Promise<ValidateResult> {
  const code = normalizeCode(rawCode)
  if (!code) return { valid: false, error: "Code is required" }

  const cached = await cacheGet<boolean>(validKey(code))
  if (cached === true) return { valid: true }

  const inviteCode = await prisma.inviteCode.findUnique({
    where: { code },
    select: { isActive: true },
  })
  if (!inviteCode) return { valid: false, error: "Invalid invite code" }
  if (!inviteCode.isActive) return { valid: false, error: "This invite code is no longer active" }

  await cacheSet(validKey(code), true, VALIDATE_CACHE_TTL)
  return { valid: true }
}

export interface RedeemInput {
  code: string
  taprootAddress: string
  segwitAddress?: string
  taprootPubkey?: string
}

export interface RedeemResult {
  success: boolean
  error?: string
  redemptionId?: string
}

/** Records that an address redeemed a code. Idempotent per (code, address). */
export async function redeemCode(input: RedeemInput): Promise<RedeemResult> {
  const code = normalizeCode(input.code ?? "")
  const { taprootAddress, segwitAddress, taprootPubkey } = input

  const inviteCode = await prisma.inviteCode.findUnique({
    where: { code },
    select: { id: true, isActive: true },
  })
  if (!inviteCode) return { success: false, error: "Invalid invite code" }
  if (!inviteCode.isActive) return { success: false, error: "This invite code is no longer active" }

  const redemption = await prisma.inviteCodeRedemption.upsert({
    where: { codeId_taprootAddress: { codeId: inviteCode.id, taprootAddress } },
    update: {
      segwitAddress: segwitAddress || undefined,
      taprootPubkey: taprootPubkey || undefined,
    },
    create: { codeId: inviteCode.id, taprootAddress, segwitAddress, taprootPubkey },
  })

  // A new redemption can't change validity, but keep the cache honest.
  await cacheDel(validKey(code))
  return { success: true, redemptionId: redemption.id }
}

export interface LookupResult {
  found: boolean
  code?: string
  codeDescription?: string | null
  parentCode?: string | null
}

/** Most recent code a taproot address redeemed, plus its parent (if any). */
export async function lookupByAddress(taprootAddress: string): Promise<LookupResult> {
  const redemption = await prisma.inviteCodeRedemption.findFirst({
    where: { taprootAddress },
    include: { code: { include: { parentCode: true } } },
    orderBy: { redeemedAt: "desc" },
  })
  if (!redemption) return { found: false }

  return {
    found: true,
    code: redemption.code.code,
    codeDescription: redemption.code.description,
    parentCode: redemption.code.parentCode?.code ?? null,
  }
}
