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
import { audit } from "@/lib/cms/audit"

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
  | { ok: true }
  | { ok: false; error: string }

/** Captures client IP + user-agent for the session/audit records. */
async function reqMeta(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  return { ip, ua: h.get("user-agent") }
}

async function issueSession(user: {
  id: string
  email: string
  name: string | null
  role: string
  tokenVersion: number
}) {
  const jti = newJti()
  const { ip, ua } = await reqMeta()
  await createSession({ userId: user.id, jti, ip, userAgent: ua })
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

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  })
  if (!user || !user.active) {
    const { ip } = await reqMeta()
    await audit("login_failed", { target: parsed.data.email.toLowerCase(), ip })
    return { ok: false, error: "Invalid email or password" }
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!ok) {
    const { ip } = await reqMeta()
    await audit("login_failed", { actorId: user.id, target: user.email, ip })
    return { ok: false, error: "Invalid email or password" }
  }

  const ip = await issueSession(user)
  await audit("login", { actorId: user.id, target: user.email, ip })
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
