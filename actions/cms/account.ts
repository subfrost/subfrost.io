"use server"

import crypto from "crypto"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { ALL_PRIVILEGES, canManageRole, type Privilege, type Role } from "@/lib/cms/privileges"
import { createToken, consumeToken } from "@/lib/cms/tokens"
import { revokeAllUserSessions } from "@/lib/cms/session-store"
import { sendEmail, inviteEmail, passwordResetEmail } from "@/lib/cms/email"
import { audit } from "@/lib/cms/audit"

export type Result = { ok: true } | { ok: false; error: string }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

const ROLES = ["ADMIN", "EDITOR", "AUTHOR"] as const
const privilegeEnum = z.enum(ALL_PRIVILEGES as [Privilege, ...Privilege[]])

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional().default(""),
  role: z.enum(ROLES).default("AUTHOR"),
  privileges: z.array(privilegeEnum).optional().default([]),
})

/** Create a user with an unusable random password and email them an invite link
 *  to set their own. Requires MANAGE_USERS. */
export async function inviteUser(input: z.input<typeof inviteSchema>): Promise<Result> {
  const me = await currentUser()
  if (!me || !me.privileges.includes("MANAGE_USERS")) return { ok: false, error: "Insufficient privileges" }
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { email, name, role, privileges } = parsed.data

  if (!canManageRole(me.role, role)) return { ok: false, error: "You cannot create a user at or above your own role" }
  const overreach = privileges.filter((p) => !me.privileges.includes(p))
  if (overreach.length) return { ok: false, error: `You cannot grant privileges you lack: ${overreach.join(", ")}` }
  if (await prisma.user.findUnique({ where: { email: email.toLowerCase() } })) {
    return { ok: false, error: "A user with that email already exists" }
  }

  // Unguessable placeholder hash — the user must set a password via the invite link.
  const placeholder = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12)
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), name: name || null, passwordHash: placeholder, role, privileges },
  })

  const token = await createToken(user.email, "INVITE", user.id)
  const tpl = inviteEmail(token, user.name)
  const sent = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
  await audit("invite_user", { actorId: me.id, target: user.email, details: { role, emailSkipped: sent.skipped ?? false }, ip: await ip() })
  revalidatePath("/admin/users")
  if (!sent.ok) return { ok: false, error: `User created but the invite email failed: ${sent.error}` }
  return { ok: true }
}

const emailSchema = z.object({ email: z.string().email() })

/** Public: request a password-reset link. Always reports success to avoid
 *  leaking which emails are registered. */
export async function requestPasswordReset(email: string): Promise<Result> {
  const parsed = emailSchema.safeParse({ email })
  if (!parsed.success) return { ok: false, error: "Enter a valid email" }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
  if (user && user.active) {
    const token = await createToken(user.email, "PASSWORD_RESET", user.id)
    const tpl = passwordResetEmail(token, user.name)
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
    await audit("reset_password", { actorId: user.id, target: user.email, details: { requested: true }, ip: await ip() })
  }
  return { ok: true }
}

const setPwSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

/** Public: consume an INVITE or PASSWORD_RESET token and set the password. */
export async function setPasswordWithToken(token: string, password: string): Promise<Result> {
  const parsed = setPwSchema.safeParse({ token, password })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const consumed = await consumeToken(parsed.data.token)
  if (!consumed || (consumed.purpose !== "INVITE" && consumed.purpose !== "PASSWORD_RESET")) {
    return { ok: false, error: "This link is invalid or has expired. Request a new one." }
  }
  const user = consumed.userId
    ? await prisma.user.findUnique({ where: { id: consumed.userId } })
    : await prisma.user.findUnique({ where: { email: consumed.email } })
  if (!user) return { ok: false, error: "Account not found" }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      emailVerified: new Date(), // following the link proves email ownership
      tokenVersion: { increment: 1 }, // invalidate any prior sessions
    },
  })
  await revokeAllUserSessions(user.id)
  await audit("change_password", { actorId: user.id, target: user.email, details: { via: consumed.purpose }, ip: await ip() })
  return { ok: true }
}
