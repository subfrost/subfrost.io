import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock jose so we don't need a real RSA key in the test.
vi.mock("jose", () => ({
  importPKCS8: vi.fn().mockResolvedValue({} as never),
  SignJWT: class {
    setProtectedHeader() { return this }
    setIssuer() { return this }
    setSubject() { return this }
    setAudience() { return this }
    setIssuedAt() { return this }
    setExpirationTime() { return this }
    async sign() { return "signed.jwt.token" }
    constructor(_: unknown) {}
  },
}))

import { getGoogleAccessToken } from "@/lib/analytics/google-auth"

const SA = JSON.stringify({ client_email: "sa@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n" })

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.GA_SERVICE_ACCOUNT_JSON
  delete process.env.GA4_PROPERTY_ID
  vi.unstubAllGlobals()
})

it("returns null when unconfigured (no env)", async () => {
  expect(await getGoogleAccessToken()).toBeNull()
})

it("mints and returns an access token from the token endpoint", async () => {
  process.env.GA_SERVICE_ACCOUNT_JSON = SA
  process.env.GA4_PROPERTY_ID = "123456789"
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "ya29.fake", expires_in: 3600 }) })
  vi.stubGlobal("fetch", fetchMock)
  const tok = await getGoogleAccessToken()
  expect(tok).toBe("ya29.fake")
  expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST" }))
})

it("returns null on a token-endpoint error (never throws)", async () => {
  process.env.GA_SERVICE_ACCOUNT_JSON = SA
  process.env.GA4_PROPERTY_ID = "123456789"
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))
  expect(await getGoogleAccessToken()).toBeNull()
})
