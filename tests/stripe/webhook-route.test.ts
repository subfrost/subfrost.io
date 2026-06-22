import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/webhooks/verify", () => ({ constructWebhookEvent: vi.fn() }))
vi.mock("@/lib/stripe/webhooks/summary", () => ({ summarizeEvent: vi.fn(() => ({ objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 1, currency: "usd", reason: null })) }))
vi.mock("@/lib/stripe/webhooks/store", () => ({ recordEvent: vi.fn(), markProcessed: vi.fn(), markIgnored: vi.fn(), markFailed: vi.fn() }))
vi.mock("@/lib/stripe/webhooks/dispatch", () => ({ dispatchEvent: vi.fn() }))

import { POST } from "@/app/api/webhooks/stripe/route"
import { constructWebhookEvent } from "@/lib/stripe/webhooks/verify"
import { recordEvent, markProcessed, markIgnored, markFailed } from "@/lib/stripe/webhooks/store"
import { dispatchEvent } from "@/lib/stripe/webhooks/dispatch"

const req = (body = "{}", sig: string | null = "sig") =>
  new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }) as never

beforeEach(() => vi.clearAllMocks())

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 on an invalid signature", async () => {
    vi.mocked(constructWebhookEvent).mockImplementationOnce(() => { throw new Error("bad sig") })
    const res = await POST(req())
    expect(res.status).toBe(400)
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it("processes a handled event → markProcessed + 200", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_1", type: "identity.verification_session.verified" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("process")
    vi.mocked(dispatchEvent).mockResolvedValueOnce({ handled: true })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(markProcessed).toHaveBeenCalledWith("evt_1")
    expect(await res.json()).toEqual({ received: true })
  })

  it("ignores a log-only event → markIgnored + 200", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_2", type: "charge.succeeded" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("process")
    vi.mocked(dispatchEvent).mockResolvedValueOnce({ handled: false })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(markIgnored).toHaveBeenCalledWith("evt_2")
  })

  it("short-circuits a replay without dispatching", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_1", type: "charge.succeeded" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("replay")
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(dispatchEvent).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ received: true, replay: true })
  })

  it("marks failed + returns 500 when the handler throws", async () => {
    vi.mocked(constructWebhookEvent).mockReturnValueOnce({ id: "evt_3", type: "identity.verification_session.verified" } as never)
    vi.mocked(recordEvent).mockResolvedValueOnce("process")
    vi.mocked(dispatchEvent).mockRejectedValueOnce(new Error("boom"))
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(markFailed).toHaveBeenCalledWith("evt_3", "boom")
  })
})
