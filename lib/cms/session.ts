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
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
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
    }
  } catch {
    return null
  }
}
