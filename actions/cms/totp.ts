"use server"

import { headers } from "next/headers"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import {
  generateSecret,
  generateQrDataUri,
  validateCode,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/cms/totp"
import { audit } from "@/lib/cms/audit"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

export type TotpResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/** Begin enrollment: generate (and store, but don't enable) a secret; return a QR. */
export async function setupTotp(): Promise<TotpResult<{ qrCodeDataUri: string; secret: string }>> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (me.totpEnabled) return { ok: false, error: "Two-factor is already enabled" }

  const secret = generateSecret()
  await prisma.user.update({ where: { id: me.id }, data: { totpSecret: secret } })
  const qrCodeDataUri = await generateQrDataUri(secret, me.email)
  await audit("totp_enabled", { actorId: me.id, target: me.email, details: { stage: "setup" }, ip: await ip() })
  return { ok: true, qrCodeDataUri, secret }
}

/** Confirm enrollment with a code; enable 2FA and return one-time recovery codes. */
export async function verifyTotp(code: string): Promise<TotpResult<{ recoveryCodes: string[] }>> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  const user = await prisma.user.findUnique({ where: { id: me.id } })
  if (!user?.totpSecret) return { ok: false, error: "Start setup first" }
  if (!validateCode(user.totpSecret, user.email, code)) {
    return { ok: false, error: "Incorrect code — check your authenticator and try again" }
  }

  const recoveryCodes = generateRecoveryCodes(10)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: me.id },
      data: { totpEnabled: true, totpVerifiedAt: new Date() },
    }),
    // Replace any prior codes.
    prisma.totpRecoveryCode.deleteMany({ where: { userId: me.id } }),
    prisma.totpRecoveryCode.createMany({
      data: recoveryCodes.map((c) => ({ userId: me.id, codeHash: hashRecoveryCode(c) })),
    }),
  ])
  await audit("totp_enabled", { actorId: me.id, target: me.email, ip: await ip() })
  return { ok: true, recoveryCodes }
}

/** Disable 2FA. Requires a current code (or a valid recovery code). */
export async function disableTotp(code: string): Promise<TotpResult> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  const user = await prisma.user.findUnique({ where: { id: me.id } })
  if (!user?.totpEnabled || !user.totpSecret) return { ok: false, error: "Two-factor is not enabled" }

  const codeOk = validateCode(user.totpSecret, user.email, code)
  let recoveryOk = false
  if (!codeOk) {
    const match = await prisma.totpRecoveryCode.findFirst({
      where: { userId: me.id, used: false, codeHash: hashRecoveryCode(code) },
    })
    recoveryOk = !!match
  }
  if (!codeOk && !recoveryOk) return { ok: false, error: "Incorrect code" }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: me.id },
      data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null },
    }),
    prisma.totpRecoveryCode.deleteMany({ where: { userId: me.id } }),
  ])
  await audit("totp_disabled", { actorId: me.id, target: me.email, ip: await ip() })
  return { ok: true }
}

/** Count remaining unused recovery codes (for the profile UI). */
export async function remainingRecoveryCodes(): Promise<number> {
  const me = await currentUser()
  if (!me) return 0
  return prisma.totpRecoveryCode.count({ where: { userId: me.id, used: false } })
}
