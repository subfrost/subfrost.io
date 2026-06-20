"use server"

import { cookies, headers } from "next/headers"
import bcrypt from "bcryptjs"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/cms/session"
import { createSession, newJti, revokeSessionByJti } from "@/lib/cms/session-store"
import { audit } from "@/lib/cms/audit"

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
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
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
