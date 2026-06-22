import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: vi.fn(() => ({ identity: { verificationSessions: { retrieve: vi.fn() } } })),
}))

import { liveIdentityVerification } from "@/lib/stripe/source/live/identity"
import { getStripeClient } from "@/lib/stripe/client"

beforeEach(() => vi.clearAllMocks())

describe("liveIdentityVerification", () => {
  it("normalizes a single session (no image data)", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "vs_1", status: "verified", last_error: null,
      verified_outputs: { first_name: "Ada", last_name: "Lovelace", dob: { year: 1815, month: 12, day: 10 }, email: "ada@x.io" },
      last_verification_report: { document: { type: "passport", issuing_country: "US" } },
      metadata: {}, created: 1750000000,
    })
    vi.mocked(getStripeClient).mockReturnValueOnce({ identity: { verificationSessions: { retrieve } } } as never)
    const v = await liveIdentityVerification("vs_1")
    expect(retrieve).toHaveBeenCalledWith("vs_1", { expand: ["last_verification_report"] })
    expect(v).toMatchObject({ id: "vs_1", verdict: "verified", document: { type: "passport", country: "US" }, extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" }, email: "ada@x.io" })
  })

  it("returns null when retrieve yields nothing", async () => {
    const retrieve = vi.fn().mockResolvedValue(null)
    vi.mocked(getStripeClient).mockReturnValueOnce({ identity: { verificationSessions: { retrieve } } } as never)
    expect(await liveIdentityVerification("vs_x")).toBeNull()
  })
})
