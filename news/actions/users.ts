"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { currentUser } from "@/lib/authz"

export type UserActionResult = { ok: true } | { ok: false; error: string }

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional().default(""),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "EDITOR", "AUTHOR"]).default("AUTHOR"),
})

export async function createUser(input: z.input<typeof createSchema>): Promise<UserActionResult> {
  const me = await currentUser()
  if (!me || me.role !== "ADMIN") return { ok: false, error: "Admin only" }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { email, name, password, role } = parsed.data

  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (exists) return { ok: false, error: "A user with that email already exists" }

  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || null,
      passwordHash: await bcrypt.hash(password, 12),
      role,
    },
  })
  revalidatePath("/admin/users")
  return { ok: true }
}

export async function setUserRole(userId: string, role: "ADMIN" | "EDITOR" | "AUTHOR"): Promise<UserActionResult> {
  const me = await currentUser()
  if (!me || me.role !== "ADMIN") return { ok: false, error: "Admin only" }
  if (me.id === userId) return { ok: false, error: "You cannot change your own role" }
  await prisma.user.update({ where: { id: userId }, data: { role } })
  revalidatePath("/admin/users")
  return { ok: true }
}

export async function setUserActive(userId: string, active: boolean): Promise<UserActionResult> {
  const me = await currentUser()
  if (!me || me.role !== "ADMIN") return { ok: false, error: "Admin only" }
  if (me.id === userId) return { ok: false, error: "You cannot deactivate yourself" }
  await prisma.user.update({ where: { id: userId }, data: { active } })
  revalidatePath("/admin/users")
  return { ok: true }
}

export async function resetPassword(userId: string, password: string): Promise<UserActionResult> {
  const me = await currentUser()
  if (!me || me.role !== "ADMIN") return { ok: false, error: "Admin only" }
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters" }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  })
  return { ok: true }
}
