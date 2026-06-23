import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma + audit so the store module imports without a live DB. The pure
// state-machine helpers don't touch prisma; the webhook-apply test drives the
// mocked client directly.
vi.mock("@/lib/prisma", () => {
  const envelope = { findFirst: vi.fn(), update: vi.fn() }
  const client = { envelope }
  return { prisma: client, default: client }
})
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))

import prisma from "@/lib/prisma"
import { recomputeEnvelopeStatus, isTerminalStatus, esign } from "@/lib/esign/store"
import { mapDocumensoStatusToEnvelopeStatus } from "@/lib/esign/documenso"
import { envelopeProgress, inBucket, within24hOfExpiry } from "@/lib/esign/document-ui"
import type { EnvelopeRecord, DocumensoEvent } from "@/lib/esign/types"

const env = prisma.envelope as unknown as Record<string, ReturnType<typeof vi.fn>>

function rec(partial: Partial<EnvelopeRecord>): EnvelopeRecord {
  return {
    id: "e1",
    kind: "other",
    subject: "Test",
    recipients: [],
    status: "sent",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    createdBy: "op@subfrost.io",
    appliedEventIds: [],
    fieldsAppliedCount: 0,
    signingOrderEnabled: false,
    ...partial,
  }
}

describe("recomputeEnvelopeStatus", () => {
  it("completes only when every SIGNING recipient signed (cc/viewer ignored)", () => {
    const r = rec({
      status: "partially-signed",
      recipients: [
        { name: "A", email: "a@x.io", role: "signer", status: "signed" },
        { name: "B", email: "b@x.io", role: "cc", status: "pending" },
      ],
    })
    expect(recomputeEnvelopeStatus(r)).toBe("completed")
  })

  it("is partially-signed with one of two signers done", () => {
    const r = rec({
      recipients: [
        { name: "A", email: "a@x.io", role: "signer", status: "signed" },
        { name: "B", email: "b@x.io", role: "signer", status: "pending" },
      ],
    })
    expect(recomputeEnvelopeStatus(r)).toBe("partially-signed")
  })

  it("declines if any recipient declined", () => {
    const r = rec({
      recipients: [
        { name: "A", email: "a@x.io", role: "signer", status: "signed" },
        { name: "B", email: "b@x.io", role: "signer", status: "declined" },
      ],
    })
    expect(recomputeEnvelopeStatus(r)).toBe("declined")
  })

  it("keeps terminal statuses sticky against stale recipient updates", () => {
    const r = rec({
      status: "completed",
      recipients: [{ name: "A", email: "a@x.io", role: "signer", status: "viewed" }],
    })
    expect(recomputeEnvelopeStatus(r)).toBe("completed")
    expect(isTerminalStatus("voided")).toBe(true)
    expect(isTerminalStatus("sent")).toBe(false)
  })
})

describe("mapDocumensoStatusToEnvelopeStatus", () => {
  it("maps the four Documenso doc statuses", () => {
    expect(mapDocumensoStatusToEnvelopeStatus("DRAFT")).toBe("draft")
    expect(mapDocumensoStatusToEnvelopeStatus("PENDING")).toBe("sent")
    expect(mapDocumensoStatusToEnvelopeStatus("COMPLETED")).toBe("completed")
    expect(mapDocumensoStatusToEnvelopeStatus("REJECTED")).toBe("declined")
  })
})

describe("document-ui helpers", () => {
  it("computes signing progress", () => {
    const r = rec({
      recipients: [
        { name: "A", email: "a@x.io", role: "signer", status: "signed" },
        { name: "B", email: "b@x.io", role: "signer", status: "pending" },
      ],
    })
    expect(envelopeProgress(r)).toEqual({ signed: 1, total: 2, pct: 50 })
  })

  it("buckets in-flight vs completed", () => {
    expect(inBucket(rec({ status: "sent" }), "in-flight")).toBe(true)
    expect(inBucket(rec({ status: "completed" }), "in-flight")).toBe(false)
    expect(inBucket(rec({ status: "completed" }), "completed")).toBe(true)
  })

  it("flags expiry within 24h", () => {
    const soon = new Date(Date.now() + 3600_000).toISOString()
    const far = new Date(Date.now() + 5 * 24 * 3600_000).toISOString()
    expect(within24hOfExpiry(soon)).toBe(true)
    expect(within24hOfExpiry(far)).toBe(false)
    expect(within24hOfExpiry(undefined)).toBe(false)
  })
})

describe("esign.applyWebhookEvent", () => {
  beforeEach(() => {
    env.findFirst.mockReset()
    env.update.mockReset()
    // update echoes the data merged onto a base row so mapRow can run.
    env.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "e1",
      kind: "other",
      subject: "T",
      message: null,
      recipients: data.recipients ?? [],
      attachment: null,
      status: data.status ?? "sent",
      externalDocumentId: "doc-1",
      signingOrderEnabled: false,
      expiresAt: null,
      sentAt: data.sentAt ?? null,
      completedAt: data.completedAt ?? null,
      voidedAt: data.voidedAt ?? null,
      voidReason: null,
      lastResendAt: null,
      fieldsAppliedAt: null,
      fieldsAppliedCount: 0,
      signedDocumentObject: null,
      appliedEventIds: data.appliedEventIds ?? [],
      notes: null,
      payeeId: null,
      fields: null,
      createdBy: "op@subfrost.io",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      updatedAt: new Date(),
    }))
  })

  function dbRow() {
    return {
      id: "e1",
      kind: "other",
      subject: "T",
      message: null,
      recipients: [{ name: "A", email: "a@x.io", role: "signer", status: "pending" }],
      attachment: null,
      status: "sent",
      externalDocumentId: "doc-1",
      signingOrderEnabled: false,
      expiresAt: null,
      sentAt: new Date("2026-06-01T00:00:00Z"),
      completedAt: null,
      voidedAt: null,
      voidReason: null,
      lastResendAt: null,
      fieldsAppliedAt: null,
      fieldsAppliedCount: 0,
      signedDocumentObject: null,
      appliedEventIds: [] as string[],
      notes: null,
      payeeId: null,
      fields: null,
      createdBy: "op@subfrost.io",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    }
  }

  const completedEvent: DocumensoEvent = {
    event: "DOCUMENT_COMPLETED",
    createdAt: "2026-06-02T00:00:00.000Z",
    payload: {
      id: "doc-1",
      completedAt: "2026-06-02T00:00:00.000Z",
      recipients: [
        { id: "1", email: "a@x.io", signingStatus: "SIGNED", signedAt: "2026-06-02T00:00:00.000Z" },
      ],
    },
  } as unknown as DocumensoEvent

  it("marks signing recipients signed + envelope completed", async () => {
    env.findFirst.mockResolvedValueOnce(dbRow())
    const out = await esign.applyWebhookEvent(completedEvent)
    expect(out?.status).toBe("completed")
    expect(out?.recipients[0].status).toBe("signed")
    expect(env.update).toHaveBeenCalledTimes(1)
  })

  it("is idempotent: a replayed event no-ops via appliedEventIds", async () => {
    // Second time around the row already carries the event key → no update.
    const firstRow = dbRow()
    env.findFirst.mockResolvedValueOnce(firstRow)
    const first = await esign.applyWebhookEvent(completedEvent)
    const appliedKey = (env.update.mock.calls[0][0].data.appliedEventIds as string[])[0]
    expect(appliedKey).toBeTruthy()

    env.update.mockClear()
    env.findFirst.mockResolvedValueOnce({ ...dbRow(), status: "completed", appliedEventIds: [appliedKey] })
    const second = await esign.applyWebhookEvent(completedEvent)
    expect(env.update).not.toHaveBeenCalled()
    expect(second?.id).toBe(first?.id)
  })

  it("returns undefined when no envelope matches the external id", async () => {
    env.findFirst.mockResolvedValueOnce(null)
    expect(await esign.applyWebhookEvent(completedEvent)).toBeUndefined()
  })
})
