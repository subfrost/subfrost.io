import { describe, it, expect, vi, beforeEach } from "vitest"

const list = vi.fn()
vi.mock("@/lib/stripe/client", () => ({ getStripeClient: () => ({ identity: { verificationSessions: { list } } }) }))

import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"

beforeEach(() => vi.clearAllMocks())

describe("liveIdentityVerifications", () => {
  it("normalizes a verified session into our shape", async () => {
    list.mockResolvedValueOnce({
      has_more: false,
      data: [
        {
          id: "vs_1",
          status: "verified",
          created: 1781913600, // 2026-06-20T00:00:00Z
          last_error: null,
          metadata: { email: "ada@x.io" },
          verified_outputs: { first_name: "Ada", last_name: "Lovelace", dob: { year: 1815, month: 12, day: 10 } },
          last_verification_report: { document: { type: "passport", issuing_country: "US" } },
        },
      ],
    })
    const out = await liveIdentityVerifications()
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: "vs_1",
      verdict: "verified",
      email: "ada@x.io",
      document: { type: "passport", country: "US" },
      extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
    })
  })

  it("reads failure reason + document from the report when not verified", async () => {
    list.mockResolvedValueOnce({
      has_more: false,
      data: [
        {
          id: "vs_2",
          status: "requires_input",
          created: 1781913600,
          last_error: { code: "document_unverified", reason: "blurry" },
          metadata: {},
          verified_outputs: null,
          last_verification_report: {
            document: { type: "driving_license", issuing_country: "GB", first_name: "Grace", last_name: "Hopper", dob: { year: 1906, month: 12, day: 9 } },
          },
        },
      ],
    })
    const out = await liveIdentityVerifications()
    expect(out[0]).toMatchObject({
      id: "vs_2",
      verdict: "requires_input",
      lastError: { code: "document_unverified", reason: "blurry" },
      document: { type: "driving_license", country: "GB" },
      extracted: { firstName: "Grace", lastName: "Hopper", dob: "1906-12-09" },
      email: "",
    })
  })

  it("paginates via has_more/starting_after", async () => {
    list
      .mockResolvedValueOnce({ has_more: true, data: [{ id: "vs_a", status: "processing", created: 1, last_error: null, metadata: {}, verified_outputs: null, last_verification_report: null }] })
      .mockResolvedValueOnce({ has_more: false, data: [{ id: "vs_b", status: "canceled", created: 2, last_error: null, metadata: {}, verified_outputs: null, last_verification_report: null }] })
    const out = await liveIdentityVerifications()
    expect(out.map((v) => v.id)).toEqual(["vs_a", "vs_b"])
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[1][0]).toMatchObject({ starting_after: "vs_a" })
  })
})
