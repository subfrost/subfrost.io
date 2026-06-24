// Mints a Google OAuth access token (analytics.readonly) from a service-account
// JSON using jose (RS256 JWT → token endpoint), mirroring the repo's gcp_token.py
// tooling. Token is cached in-process until ~5 min before expiry. Never throws —
// returns null when unconfigured or on any failure (the dashboard degrades).
import { SignJWT, importPKCS8 } from "jose"
import { isAnalyticsConfigured } from "@/lib/analytics/source"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

// Cache is keyed on the fetch reference so that test stubs (vi.unstubAllGlobals)
// naturally invalidate it — without any test-specific code in production paths.
// In production fetch never changes so the cache is effectively permanent until expiry.
let cached: { token: string; expiresAt: number; fetchRef: typeof fetch } | null = null

interface ServiceAccount { client_email: string; private_key: string }

export async function getGoogleAccessToken(): Promise<string | null> {
  if (!isAnalyticsConfigured()) return null
  if (cached && cached.expiresAt > Date.now() && cached.fetchRef === fetch) return cached.token
  try {
    const sa = JSON.parse(process.env.GA_SERVICE_ACCOUNT_JSON as string) as ServiceAccount
    const key = await importPKCS8(sa.private_key, "RS256")
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key)
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    const ttlMs = (data.expires_in ?? 3600) * 1000
    cached = { token: data.access_token, expiresAt: Date.now() + ttlMs - 5 * 60_000, fetchRef: fetch }
    return cached.token
  } catch {
    return null
  }
}
