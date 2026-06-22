import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const stripeWebhookEvent = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() }
  const client = { stripeWebhookEvent }
  return { prisma: client, default: client }
})

import { recordEvent, markProcessed, markIgnored, markFailed, listWebhookEvents } from "@/lib/stripe/webhooks/store"
import prisma from "@/lib/prisma"
import type Stripe from "stripe"
import type { WebhookEventSummary } from "@/lib/stripe/shapes"

const swe = (prisma as unknown as { stripeWebhookEvent: Record<string, ReturnType<typeof vi.fn>> }).stripeWebhookEvent
const event = { id: "evt_1", type: "charge.succeeded", api_version: "2026-05-27.dahlia", created: 1750000000, data: { object: {} } } as unknown as Stripe.Event
const summary: WebhookEventSummary = { objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 100, currency: "usd", reason: null }

beforeEach(() => vi.clearAllMocks())

describe("recordEvent", () => {
  it("creates a new row and returns 'process' for an unseen event", async () => {
    swe.findUnique.mockResolvedValueOnce(null)
    const r = await recordEvent(event, summary)
    expect(r).toBe("process")
    expect(swe.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: "evt_1", type: "charge.succeeded", status: "received", objectId: "ch_1" }) }))
  })

  it("returns 'replay' (no create) when the event was already processed", async () => {
    swe.findUnique.mockResolvedValueOnce({ id: "evt_1", status: "processed" })
    const r = await recordEvent(event, summary)
    expect(r).toBe("replay")
    expect(swe.create).not.toHaveBeenCalled()
  })

  it("returns 'process' (no create) for a prior failed event so it re-dispatches", async () => {
    swe.findUnique.mockResolvedValueOnce({ id: "evt_1", status: "failed" })
    const r = await recordEvent(event, summary)
    expect(r).toBe("process")
    expect(swe.create).not.toHaveBeenCalled()
  })

  it("treats a concurrent unique-violation as 'replay'", async () => {
    swe.findUnique.mockResolvedValueOnce(null)
    swe.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    const r = await recordEvent(event, summary)
    expect(r).toBe("replay")
  })
})

describe("status transitions", () => {
  it("markProcessed sets processed + handled", async () => {
    await markProcessed("evt_1")
    expect(swe.update).toHaveBeenCalledWith({ where: { id: "evt_1" }, data: { status: "processed", handled: true } })
  })
  it("markIgnored sets ignored", async () => {
    await markIgnored("evt_1")
    expect(swe.update).toHaveBeenCalledWith({ where: { id: "evt_1" }, data: { status: "ignored", handled: false } })
  })
  it("markFailed records the error", async () => {
    await markFailed("evt_1", "boom")
    expect(swe.update).toHaveBeenCalledWith({ where: { id: "evt_1" }, data: { status: "failed", error: "boom" } })
  })
})

describe("listWebhookEvents", () => {
  it("maps rows to ISO-string dates, newest first, filtered", async () => {
    swe.findMany.mockResolvedValueOnce([
      { id: "evt_1", type: "charge.succeeded", status: "processed", handled: true, error: null, stripeCreated: new Date("2026-06-22T00:00:00Z"), receivedAt: new Date("2026-06-22T00:00:01Z"), objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 100, currency: "usd", reason: null },
    ])
    const rows = await listWebhookEvents({ status: "processed" })
    expect(swe.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "processed" }, orderBy: { receivedAt: "desc" }, take: 200 }))
    expect(rows[0].stripeCreated).toBe("2026-06-22T00:00:00.000Z")
    expect(rows[0].receivedAt).toBe("2026-06-22T00:00:01.000Z")
  })

  it("uses a contains filter for type", async () => {
    swe.findMany.mockResolvedValueOnce([])
    await listWebhookEvents({ type: "identity" })
    expect(swe.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { type: { contains: "identity" } } }))
  })
})
