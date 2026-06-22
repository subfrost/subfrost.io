"use server"

import { cookies, headers } from "next/headers"
import bcrypt from "bcryptjs"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/cms/session"
import {
  createSession,
  newJti,
  revokeAllUserSessions,
  revokeSessionByJti,
} from "@/lib/cms/session-store"
import { validateCode, hashRecoveryCode } from "@/lib/cms/totp"
import { audit } from "@/lib/cms/audit"

// Short-lived cookie holding the pending-2FA token between login steps.
const PENDING_2FA_COOKIE = "subfrost_admin_2fa"

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

async function writeSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, COOKIE_OPTS)
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type LoginResult =
  | { ok: true; twofa?: boolean }
  | { ok: false; error: string }

// Brute-force throttle: DB-backed (works across pods, reuses the audit trail).
const RL_WINDOW_MS = 15 * 60_000
const RL_MAX_PER_EMAIL = 5
const RL_MAX_PER_IP = 20

async function tooManyAttempts(email: string, ip: string | null): Promise<boolean> {
  const auditLog = (prisma as unknown as {
    auditLog?: {
      count: (args: {
        where: {
          action: string
          target?: string
          ip?: string
          createdAt: { gt: Date }
        }
      }) => Promise<number>
    }
  }).auditLog

  // During local dev, a stale generated Prisma client (or hot-reload race)
  // can momentarily miss a model delegate. Fail open for rate-limiting instead
  // of crashing the entire login flow.
  if (!auditLog?.count) return false

  const since = new Date(Date.now() - RL_WINDOW_MS)
  const [byEmail, byIp] = await Promise.all([
    auditLog.count({ where: { action: "login_failed", target: email, createdAt: { gt: since } } }),
    ip
      ? auditLog.count({ where: { action: "login_failed", ip, createdAt: { gt: since } } })
      : Promise.resolve(0),
  ])
  return byEmail >= RL_MAX_PER_EMAIL || byIp >= RL_MAX_PER_IP
}

/** Captures client IP, user-agent, and (when the fingerprint-capable tlsd ingress
 *  is in front) the TLS JA4 fingerprint for the session/audit records. */
async function reqMeta(): Promise<{ ip: string | null; ua: string | null; fp: string | null }> {
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  // Injected by the tlsd ingress at TLS termination; absent behind the current
  // Google-managed LB, so this stays null until that cutover.
  const fp = h.get("x-tls-ja4") || h.get("x-tls-fingerprint") || null
  return { ip, ua: h.get("user-agent"), fp }
}

async function issueSession(user: {
  id: string
  email: string
  name: string | null
  role: string
  tokenVersion: number
}) {
  const jti = newJti()
  const { ip, ua, fp } = await reqMeta()
  await createSession({ userId: user.id, jti, ip, userAgent: ua, tlsFingerprint: fp })
  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "ADMIN" | "EDITOR" | "AUTHOR",
    jti,
    ver: user.tokenVersion,
  })
  await writeSessionCookie(token)
  return ip
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password" }
  const lowerEmail = parsed.data.email.toLowerCase()

  const { ip: clientIp } = await reqMeta()
  if (await tooManyAttempts(lowerEmail, clientIp)) {
    return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." }
  }

  const user = await prisma.user.findUnique({ where: { email: lowerEmail } })
  if (!user || !user.active) {
    await audit("login_failed", { target: lowerEmail, ip: clientIp })
    return { ok: false, error: "Invalid email or password" }
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!ok) {
    await audit("login_failed", { actorId: user.id, target: user.email, ip: clientIp })
    return { ok: false, error: "Invalid email or password" }
  }

  // Second factor required: stash a short-lived pending token, don't issue a
  // real session until the TOTP step succeeds.
  if (user.totpEnabled) {
    const pending = await signSession(
      { sub: user.id, email: user.email, role: user.role as "ADMIN" | "EDITOR" | "AUTHOR", pending2fa: true },
      "5m",
    )
    const jar = await cookies()
    jar.set(PENDING_2FA_COOKIE, pending, { ...COOKIE_OPTS, maxAge: 300 })
    return { ok: true, twofa: true }
  }

  const ip = await issueSession(user)
  await audit("login", { actorId: user.id, target: user.email, ip })
  return { ok: true }
}

/** Second login step: verify a TOTP code or recovery code against the pending
 *  token, then issue the real session. */
export async function loginVerify2fa(code: string): Promise<LoginResult> {
  const jar = await cookies()
  const pending = await verifySession(jar.get(PENDING_2FA_COOKIE)?.value)
  if (!pending?.pending2fa || !pending.sub) {
    return { ok: false, error: "Your login session expired — please sign in again" }
  }
  const user = await prisma.user.findUnique({ where: { id: pending.sub } })
  if (!user || !user.active || !user.totpEnabled || !user.totpSecret) {
    return { ok: false, error: "Two-factor is not available for this account" }
  }

  const { ip: clientIp } = await reqMeta()
  if (await tooManyAttempts(user.email, clientIp)) {
    return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." }
  }

  const clean = code.replace(/\s+/g, "")
  let verified = validateCode(user.totpSecret, user.email, clean)
  if (!verified) {
    // Try a single-use recovery code.
    const match = await prisma.totpRecoveryCode.findFirst({
      where: { userId: user.id, used: false, codeHash: hashRecoveryCode(clean) },
    })
    if (match) {
      await prisma.totpRecoveryCode.update({ where: { id: match.id }, data: { used: true } })
      verified = true
    }
  }
  if (!verified) {
    await audit("login_failed", { actorId: user.id, target: user.email, details: { stage: "2fa" }, ip: clientIp })
    return { ok: false, error: "Incorrect code" }
  }

  jar.delete(PENDING_2FA_COOKIE)
  const ip = await issueSession(user)
  await audit("login_2fa", { actorId: user.id, target: user.email, ip })
  return { ok: true }
}

export async function logout() {
  const jar = await cookies()
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value)
  if (session?.jti) {
    await revokeSessionByJti(session.jti)
    await audit("logout", { actorId: session.sub })
  }
  jar.delete(SESSION_COOKIE)
}

const changePwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
})

/** Self-service password change. Verifies the current password, rotates
 *  tokenVersion to invalidate every other session, and re-issues the cookie for
 *  the current session so the user stays signed in here. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  const parsed = changePwSchema.safeParse({ currentPassword, newPassword })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const user = await prisma.user.findUnique({ where: { id: me.id } })
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return { ok: false, error: "Current password is incorrect" }
  }

  const newVer = user.tokenVersion + 1
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), tokenVersion: newVer },
  })
  // Drop every other session; keep this one alive by re-issuing its cookie.
  await revokeAllUserSessions(user.id, me.jti ?? undefined)
  if (me.jti) {
    const token = await signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "ADMIN" | "EDITOR" | "AUTHOR",
      jti: me.jti,
      ver: newVer,
    })
    await writeSessionCookie(token)
  }
  const { ip } = await reqMeta()
  await audit("change_password", { actorId: user.id, target: user.email, ip })
  return { ok: true }
}
