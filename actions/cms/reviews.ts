"use server"

import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import {
  createReviewLink,
  listReviewLinks,
  revokeReviewLink,
  authenticateReviewLink,
  resolveReviewSession,
  revokeReviewSession,
  REVIEW_COOKIE,
  REVIEW_SCOPES,
  type ReviewLinkRow,
  type ReviewScope,
  type CreatedReviewLink,
} from "@/lib/compliance/reviews"

const REVIEWS_PRIV = "compliance.reviews"
const PATH = "/admin/compliance/reviews"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(REVIEWS_PRIV)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

// ---------- Admin management -----------------------------------------

export type ListResult = { ok: true; links: ReviewLinkRow[] } | { ok: false; error: "unauthorized" }

export async function listReviewLinksAction(): Promise<ListResult> {
  const g = await gate()
  if (!g.ok) return g
  return { ok: true, links: await listReviewLinks() }
}

export type CreateResult =
  | { ok: true; created: CreatedReviewLink }
  | { ok: false; error: string }

export async function createReviewLinkAction(input: {
  reviewerLabel: string
  reviewerEmail?: string | null
  scope: ReviewScope
  ttlDays?: number
  notes?: string | null
}): Promise<CreateResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  if (!REVIEW_SCOPES.includes(input.scope)) return { ok: false, error: "Invalid scope" }
  try {
    const created = await createReviewLink({
      reviewerLabel: input.reviewerLabel,
      reviewerEmail: input.reviewerEmail,
      scope: input.scope,
      ttlDays: input.ttlDays,
      notes: input.notes,
      createdByUserId: g.me.id,
    })
    await audit("review_link_create", {
      actorId: g.me.id,
      target: created.link.reviewerLabel,
      ip: await ip(),
      details: { scope: input.scope, linkId: created.link.id },
    })
    revalidatePath(PATH)
    return { ok: true, created }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create link" }
  }
}

export type MutResult = { ok: true } | { ok: false; error: string }

export async function revokeReviewLinkAction(linkId: string): Promise<MutResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await revokeReviewLink(linkId, g.me.id)
    await audit("review_link_revoke", { actorId: g.me.id, target: linkId, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not revoke link" }
  }
}

// ---------- Reviewer-facing (no platform account) --------------------

export type ReviewLoginResult = { ok: true } | { ok: false; error: string }

export async function reviewLoginAction(token: string, password: string): Promise<ReviewLoginResult> {
  const h = await headers()
  const ua = h.get("user-agent")
  const clientIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
  const res = await authenticateReviewLink(token, password, { ua, ip: clientIp })
  if (!res) return { ok: false, error: "Invalid link or password." }
  const jar = await cookies()
  jar.set(REVIEW_COOKIE, res.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/compliance",
    maxAge: 24 * 3600,
  })
  await audit("review_login", { actorId: null, target: res.reviewerLabel })
  return { ok: true }
}

export async function reviewLogoutAction(): Promise<void> {
  const jar = await cookies()
  const cookie = jar.get(REVIEW_COOKIE)?.value
  const ctx = await resolveReviewSession(cookie)
  if (ctx) {
    await revokeReviewSession(ctx.sessionId)
    await audit("review_logout", { actorId: null, target: ctx.reviewerLabel })
  }
  jar.delete({ name: REVIEW_COOKIE, path: "/compliance" })
}
