import crypto from "crypto"
import prisma from "@/lib/prisma"

// Server-side session records backing the signed cookie. The cookie JWT carries
// a random `jti`; sha-256(jti) keys the Session row. This makes "sign out
// everywhere", admin force-logout, and password-change invalidation take effect
// immediately — the stateless JWT alone can't be revoked.

const SESSION_TTL_DAYS = 30
const TOUCH_THROTTLE_MS = 60_000 // only rewrite lastSeenAt at most once/minute

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex")
}

export function newJti(): string {
  return crypto.randomBytes(24).toString("hex")
}

export async function createSession(opts: {
  userId: string
  jti: string
  ip?: string | null
  userAgent?: string | null
  tlsFingerprint?: string | null
}): Promise<Date> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)
  await prisma.session.create({
    data: {
      userId: opts.userId,
      tokenHash: sha256(opts.jti),
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      tlsFingerprint: opts.tlsFingerprint ?? null,
      expiresAt,
    },
  })
  return expiresAt
}

/** Validate a session by jti and (throttled) bump presence timestamps. Returns
 *  true if the session row exists, is not revoked, and is not expired. */
export async function validateAndTouchSession(jti: string): Promise<boolean> {
  const tokenHash = sha256(jti)
  const s = await prisma.session.findUnique({ where: { tokenHash } })
  if (!s || s.revoked || s.expiresAt.getTime() < Date.now()) return false
  if (Date.now() - s.lastSeenAt.getTime() > TOUCH_THROTTLE_MS) {
    const now = new Date()
    // presence: session row + user row (best-effort, don't block auth on it)
    await Promise.allSettled([
      prisma.session.update({ where: { tokenHash }, data: { lastSeenAt: now } }),
      prisma.user.update({ where: { id: s.userId }, data: { lastSeenAt: now } }),
    ])
  }
  return true
}

export async function revokeSessionByJti(jti: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: sha256(jti) },
    data: { revoked: true },
  })
}

/** Revoke a specific session row, scoped to its owner (self-service). */
export async function revokeSessionById(id: string, userId: string): Promise<void> {
  await prisma.session.updateMany({ where: { id, userId }, data: { revoked: true } })
}

/** Revoke all of a user's sessions, optionally keeping the current one. */
export async function revokeAllUserSessions(
  userId: string,
  exceptJti?: string,
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revoked: false,
      ...(exceptJti ? { tokenHash: { not: sha256(exceptJti) } } : {}),
    },
    data: { revoked: true },
  })
}

export interface SessionInfo {
  id: string
  ip: string | null
  userAgent: string | null
  tlsFingerprint: string | null
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
  current: boolean
}

export async function listUserSessions(
  userId: string,
  currentJti?: string,
): Promise<SessionInfo[]> {
  const currentHash = currentJti ? sha256(currentJti) : null
  const rows = await prisma.session.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  })
  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.userAgent,
    tlsFingerprint: r.tlsFingerprint,
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    expiresAt: r.expiresAt,
    current: currentHash != null && r.tokenHash === currentHash,
  }))
}
