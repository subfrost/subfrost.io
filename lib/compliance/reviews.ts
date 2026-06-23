// Delegated external-reviewer links — Prisma-backed port of subfrost-admin's
// lib/reviews.ts. An AML reviewer with no platform account is handed a
// password-protected, scoped, expiring URL. They authenticate at
// /compliance/review/<token> and receive a separate review-session cookie that
// grants read-only access to the compliance surfaces named by `scope`.
//
// Server-only. Cookie reading/writing is done by the caller (server actions /
// route handlers) via Next's cookies() — this module only owns persistence and
// the scope policy.

import prisma from "@/lib/prisma"
import {
  hashPassword,
  verifyPassword,
  hashToken,
  randomToken,
  hashClient,
  generateReviewPassword,
} from "./passwords"
import {
  REVIEW_COOKIE,
  REVIEW_SCOPES,
  type ReviewScope,
  type ReviewLinkRow,
  type CreatedReviewLink,
  type ReviewSessionContext,
} from "./types"

// Re-export the client-safe surface so server callers can keep importing
// everything from "@/lib/compliance/reviews".
export {
  REVIEW_COOKIE,
  REVIEW_SCOPES,
  SCOPE_LABELS,
  scopeSurfaces,
  scopeAllows,
} from "./types"
export type {
  ReviewScope,
  ReviewLinkRow,
  CreatedReviewLink,
  ReviewSessionContext,
  ScopeSurface,
} from "./types"

const REVIEW_SESSION_TTL_MS = 24 * 3600 * 1000
const DEFAULT_TTL_DAYS = 30

function toRow(l: {
  id: string; token: string; reviewerLabel: string; reviewerEmail: string | null
  scope: string; notes: string | null; createdAt: Date; expiresAt: Date; revokedAt: Date | null
  _count?: { sessions: number }
}): ReviewLinkRow {
  const active = !l.revokedAt && l.expiresAt > new Date()
  return {
    id: l.id,
    token: l.token,
    reviewerLabel: l.reviewerLabel,
    reviewerEmail: l.reviewerEmail,
    scope: l.scope as ReviewScope,
    notes: l.notes,
    createdAt: l.createdAt.toISOString(),
    expiresAt: l.expiresAt.toISOString(),
    revokedAt: l.revokedAt?.toISOString() ?? null,
    active,
    sessionCount: l._count?.sessions ?? 0,
  }
}

// ---------- Admin-side CRUD ------------------------------------------

export interface CreateReviewLinkOpts {
  reviewerLabel: string
  reviewerEmail?: string | null
  scope: ReviewScope
  ttlDays?: number
  notes?: string | null
  createdByUserId: string
  password?: string
}

export async function createReviewLink(opts: CreateReviewLinkOpts): Promise<CreatedReviewLink> {
  const label = opts.reviewerLabel.trim()
  if (!label) throw new Error("Reviewer label is required")
  if (!REVIEW_SCOPES.includes(opts.scope)) throw new Error("Invalid scope")
  const password = opts.password?.trim() || generateReviewPassword()
  const passwordHash = await hashPassword(password)
  const token = randomToken(24)
  const ttlDays = opts.ttlDays && opts.ttlDays > 0 ? opts.ttlDays : DEFAULT_TTL_DAYS
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 3600 * 1000)

  const link = await prisma.reviewLink.create({
    data: {
      token,
      passwordHash,
      reviewerLabel: label,
      reviewerEmail: opts.reviewerEmail?.trim() || null,
      scope: opts.scope,
      notes: opts.notes?.trim() || null,
      createdByUserId: opts.createdByUserId,
      expiresAt,
    },
    include: { _count: { select: { sessions: true } } },
  })
  return { link: toRow(link), password, path: `/compliance/review/${token}` }
}

export async function listReviewLinks(): Promise<ReviewLinkRow[]> {
  const rows = await prisma.reviewLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sessions: true } } },
  })
  return rows.map(toRow)
}

export async function revokeReviewLink(linkId: string, revokedByUserId: string): Promise<void> {
  await prisma.reviewLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date(), revokedByUserId },
  })
  // Also kill any live sessions so revocation is immediate.
  await prisma.reviewSession.updateMany({
    where: { reviewLinkId: linkId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

// ---------- Reviewer-side auth ---------------------------------------

export interface AuthResult {
  sessionToken: string // raw cookie value to set
  reviewerLabel: string
  scope: ReviewScope
}

/** Verify token + password, mint a review session, return the raw cookie value.
 *  The caller sets REVIEW_COOKIE = sessionToken. Returns null on any failure
 *  (unknown token, revoked, expired, wrong password). */
export async function authenticateReviewLink(
  token: string,
  password: string,
  client: { ua?: string | null; ip?: string | null },
): Promise<AuthResult | null> {
  const link = await prisma.reviewLink.findUnique({ where: { token } })
  if (!link) return null
  if (link.revokedAt) return null
  if (link.expiresAt < new Date()) return null
  const ok = await verifyPassword(password, link.passwordHash)
  if (!ok) return null

  const sessionToken = randomToken()
  const tokenHash = hashToken(sessionToken)
  await prisma.reviewSession.create({
    data: {
      reviewLinkId: link.id,
      tokenHash,
      userAgent: client.ua ?? null,
      ipHash: hashClient(client.ip),
      expiresAt: new Date(Date.now() + REVIEW_SESSION_TTL_MS),
    },
  })
  return { sessionToken, reviewerLabel: link.reviewerLabel, scope: link.scope as ReviewScope }
}

/** Resolve a reviewer session from the raw cookie value. Enforces session +
 *  link revocation and expiry. Touches lastSeenAt. */
export async function resolveReviewSession(
  cookieValue: string | undefined,
): Promise<ReviewSessionContext | null> {
  if (!cookieValue) return null
  const tokenHash = hashToken(cookieValue)
  const sess = await prisma.reviewSession.findUnique({
    where: { tokenHash },
    include: { reviewLink: true },
  })
  if (!sess) return null
  if (sess.revokedAt) return null
  if (sess.expiresAt < new Date()) return null
  const link = sess.reviewLink
  if (link.revokedAt) return null
  if (link.expiresAt < new Date()) return null
  await prisma.reviewSession.update({ where: { id: sess.id }, data: { lastSeenAt: new Date() } })
  return {
    sessionId: sess.id,
    reviewLinkId: link.id,
    reviewerLabel: link.reviewerLabel,
    scope: link.scope as ReviewScope,
    token: link.token,
  }
}

export async function recordReviewPageView(sessionId: string, page: string): Promise<void> {
  const sess = await prisma.reviewSession.findUnique({ where: { id: sessionId }, select: { pagesViewed: true } })
  if (!sess) return
  const seen = new Set(sess.pagesViewed ?? [])
  if (seen.has(page)) return
  seen.add(page)
  await prisma.reviewSession.update({
    where: { id: sessionId },
    data: { pagesViewed: Array.from(seen), lastSeenAt: new Date() },
  })
}

export async function revokeReviewSession(sessionId: string): Promise<void> {
  await prisma.reviewSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => {})
}
