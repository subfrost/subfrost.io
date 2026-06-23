// Exercises the ported envelope state machine (esign.send / void / resend /
// refresh / createFromTemplate) against the REAL mock-mode Documenso client
// (no creds → LOCAL ids, no network), with Prisma / GCS / audit mocked. Proves
// the JSON-store → Prisma re-target preserved the original control flow.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const envelope = { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  const payee = { findUnique: vi.fn() }
  const client = { envelope, payee }
  return { prisma: client, default: client }
})
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("@/lib/cms/gcs", () => ({
  uploadDocumentPdf: vi.fn(async () => {}),
  downloadObject: vi.fn(async () => Buffer.from("pdf-bytes")),
  objectExists: vi.fn(async () => true),
}))

import prisma from "@/lib/prisma"
import { envelopes, esign, EsignError } from "@/lib/esign/store"

const env = prisma.envelope as unknown as Record<string, ReturnType<typeof vi.fn>>

const ORIG = { ...process.env }
beforeEach(() => {
  // Mock mode: no Documenso creds → LOCAL ids, no fetch.
  delete process.env.DOCUMENSO_API_URL
  delete process.env.DOCUMENSO_API_KEY
  env.findUnique.mockReset(); env.findFirst.mockReset(); env.create.mockReset(); env.update.mockReset()
  // update echoes the merged row so mapRow can run.
  env.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
    ...baseRow(where.id), ...data,
  }))
})
afterEach(() => { process.env = { ...ORIG } })

function baseRow(id = "e1", over: Record<string, unknown> = {}) {
  return {
    id, kind: "other", subject: "Engagement letter", message: null,
    recipients: [{ name: "A", email: "a@x.io", role: "signer", status: "pending" }],
    attachment: { filename: "a.pdf", mimeType: "application/pdf", byteSize: 9, storedAt: `documents/${id}.pdf`, sha256: "x", uploadedAt: "2026-06-01T00:00:00Z" },
    status: "uploaded", externalDocumentId: null, signingOrderEnabled: false,
    expiresAt: null, sentAt: null, completedAt: null, voidedAt: null, voidReason: null,
    lastResendAt: null, fieldsAppliedAt: null, fieldsAppliedCount: 0, signedDocumentObject: null,
    appliedEventIds: [], notes: null, payeeId: null, fields: null, createdBy: "op@subfrost.io",
    createdAt: new Date("2026-06-01T00:00:00Z"), updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  }
}

describe("esign.send (mock mode)", () => {
  it("creates a LOCAL Documenso doc, splices recipient ids, and flips to sent", async () => {
    env.findUnique.mockResolvedValue(baseRow())
    const out = await esign.send("e1")
    expect(out.status).toBe("sent")
    expect(out.sentAt).toBeTruthy()
    // recipient got a LOCAL external id spliced from the mock create response
    const lastUpdate = env.update.mock.calls.at(-1)![0].data
    expect(lastUpdate.status).toBe("sent")
    const firstUpdate = env.update.mock.calls[0][0].data
    expect(String(firstUpdate.externalDocumentId)).toMatch(/^LOCAL-/)
    expect((firstUpdate.recipients as Array<{ externalRecipientId?: string }>)[0].externalRecipientId).toMatch(/^LOCAL-rcpt-/)
  })

  it("is idempotent: an already-sent envelope returns without re-sending", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { status: "sent", sentAt: new Date(), externalDocumentId: "LOCAL-x" }))
    await esign.send("e1")
    expect(env.update).not.toHaveBeenCalled()
  })

  it("refuses to send a terminal (voided) envelope", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { status: "voided" }))
    await expect(esign.send("e1")).rejects.toBeInstanceOf(EsignError)
  })

  it("refuses to send with no attachment", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { attachment: null }))
    await expect(esign.send("e1")).rejects.toThrow(/no attached PDF/)
  })
})

describe("envelopes.void", () => {
  it("flips an in-flight envelope to voided with a reason", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { status: "sent", externalDocumentId: "LOCAL-x" }))
    const out = await envelopes.void("e1", { reason: "superseded" })
    expect(out?.status).toBe("voided")
    expect(env.update.mock.calls[0][0].data.voidReason).toBe("superseded")
  })

  it("is idempotent: voiding an already-voided envelope does not overwrite", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { status: "voided" }))
    const out = await envelopes.void("e1", { reason: "again" })
    expect(out?.status).toBe("voided")
    expect(env.update).not.toHaveBeenCalled()
  })
})

describe("envelopes.resend", () => {
  it("rejects resend on a non-in-flight (draft) envelope", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { status: "draft" }))
    await expect(envelopes.resend("e1")).rejects.toThrow(/only in-flight/)
  })

  it("updates lastResendAt for an in-flight envelope", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { status: "sent" }))
    const out = await envelopes.resend("e1")
    expect(out?.lastResendAt).toBeTruthy()
  })
})

describe("esign.refresh (mock mode)", () => {
  it("returns the record unchanged when there is no external document id", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { externalDocumentId: null }))
    const out = await esign.refresh("e1")
    expect(out.id).toBe("e1")
    expect(env.update).not.toHaveBeenCalled()
  })
})

describe("esign.createFromTemplate (mock mode → stub templates)", () => {
  it("rejects when a template role has no recipient mapping", async () => {
    // STUB template LOCAL-tpl-2 needs director + officer roles.
    await expect(
      esign.createFromTemplate(
        { templateId: "LOCAL-tpl-2", subject: "Memo", recipients: [{ roleId: "director", name: "A", email: "a@x.io" }] },
        { id: "u1", email: "op@subfrost.io" },
      ),
    ).rejects.toThrow(/missing recipient/i)
  })

  it("creates + sends an envelope when all roles are mapped", async () => {
    env.create.mockResolvedValue(baseRow("e2", { status: "draft", externalDocumentId: null, recipients: [] }))
    const out = await esign.createFromTemplate(
      {
        templateId: "LOCAL-tpl-1", subject: "Sole-director consent",
        recipients: [{ roleId: "director", name: "Founder", email: "founder@x.io" }],
      },
      { id: "u1", email: "op@subfrost.io" },
    )
    expect(env.create).toHaveBeenCalledTimes(1)
    expect(out.status).toBe("sent")
    expect(out.sentAt).toBeTruthy()
  })
})
