"use server"

import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { SESSION_COOKIE, signSession } from "@/lib/cms/session"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type LoginResult = { ok: true } | { ok: false; error: string }

export async function login(email: string, password: string): Promise<LoginResult> {
  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password" }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  })
  if (!user || !user.active) return { ok: false, error: "Invalid email or password" }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!ok) return { ok: false, error: "Invalid email or password" }

  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "ADMIN" | "EDITOR" | "AUTHOR",
  })

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return { ok: true }
}

export async function logout() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
