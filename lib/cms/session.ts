import { SignJWT, jwtVerify } from "jose"

// Lightweight signed-cookie session for the /admin CMS. Edge-compatible (used
// by middleware) — no Node-only deps here. Password hashing/verification lives
// in the Node-runtime login action.

export const SESSION_COOKIE = "subfrost_admin_session"
const ALG = "HS256"

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error("AUTH_SECRET is not set")
  return new TextEncoder().encode(s)
}

export interface SessionPayload {
  sub: string // user id
  email: string
  name?: string | null
  role: "ADMIN" | "EDITOR" | "AUTHOR"
  jti?: string // session id; sha-256(jti) keys the Session row (server-side revocation)
  ver?: number // User.tokenVersion at issue; mismatch invalidates the session
  pending2fa?: boolean // short-lived token issued between password + TOTP steps
}

export async function signSession(payload: SessionPayload, expiresIn = "30d"): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      name: (payload.name as string) ?? null,
      role: (payload.role as SessionPayload["role"]) ?? "AUTHOR",
      jti: payload.jti ? String(payload.jti) : (payload.sid ? String(payload.sid) : undefined),
      ver: typeof payload.ver === "number" ? payload.ver : undefined,
      pending2fa: payload.pending2fa === true,
    }
  } catch {
    return null
  }
}
