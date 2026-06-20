import crypto from "crypto"
import prisma from "@/lib/prisma"
import type { TokenPurpose } from "@prisma/client"

// Single-use, hashed, expiring tokens for emailed flows (invite / reset /
// verify). Only the sha-256 hash is stored; the raw token lives only in the
// emailed link.

const TTL_MS: Record<TokenPurpose, number> = {
  INVITE: 48 * 3_600_000,
  PASSWORD_RESET: 1 * 3_600_000,
  EMAIL_VERIFY: 24 * 3_600_000,
}

function hash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

/** Mint a token, invalidating any prior unused tokens of the same purpose for
 *  this email. Returns the raw token (for the email link). */
export async function createToken(
  email: string,
  purpose: TokenPurpose,
  userId?: string | null,
): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex")
  const lower = email.toLowerCase()
  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { email: lower, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.verificationToken.create({
      data: {
        email: lower,
        userId: userId ?? null,
        tokenHash: hash(raw),
        purpose,
        expiresAt: new Date(Date.now() + TTL_MS[purpose]),
      },
    }),
  ])
  return raw
}

export interface ConsumedToken {
  email: string
  userId: string | null
  purpose: TokenPurpose
}

/** Validate and burn a token. Returns null if missing/used/expired/wrong-purpose. */
export async function consumeToken(
  raw: string,
  expected?: TokenPurpose,
): Promise<ConsumedToken | null> {
  if (!raw) return null
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hash(raw) } })
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null
  if (expected && row.purpose !== expected) return null
  await prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return { email: row.email, userId: row.userId, purpose: row.purpose }
}

/** Inspect a token without burning it (to choose UI copy for invite vs reset). */
export async function peekToken(raw: string): Promise<TokenPurpose | null> {
  if (!raw) return null
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hash(raw) } })
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null
  return row.purpose
}
