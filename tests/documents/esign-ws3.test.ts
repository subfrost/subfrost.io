// Workstream 3 (E-Sign overhaul): versioning (reissue/listVersions), read-scope
// filtering (documents.view_all), createFromFile, and the /sign forensic proxy.
// Same prisma-mock style as esign-store.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const envelope = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  }
  const signatureEvent = { create: vi.fn(), findMany: vi.fn() }
  const driveFile = { findUnique: vi.fn() }
  const payee = { findUnique: vi.fn() }
  const client = { envelope, signatureEvent, driveFile, payee }
  return { prisma: client, default: client }
})
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("@/lib/cms/gcs", () => ({
  uploadDocumentPdf: vi.fn(async () => {}),
  downloadObject: vi.fn(async () => Buffer.from("pdf-bytes")),
  objectExists: vi.fn(async () => true),
}))

import prisma from "@/lib/prisma"
import { downloadObject } from "@/lib/cms/gcs"
import {
  envelopes,
  esign,
  encodeSigningToken,
  decodeSigningToken,
  signingProxyUrl,
} from "@/lib/esign/store"
import { GET as signGET } from "@/app/sign/[token]/route"
import { NextRequest } from "next/server"

const env = prisma.envelope as unknown as Record<string, ReturnType<typeof vi.fn>>
const sig = (prisma as unknown as { signatureEvent: Record<string, ReturnType<typeof vi.fn>> }).signatureEvent
const drive = (prisma as unknown as { driveFile: Record<string, ReturnType<typeof vi.fn>> }).driveFile

function baseRow(id = "e1", over: Record<string, unknown> = {}) {
  return {
    id, kind: "other", subject: "Engagement letter", message: null,
    recipients: [{ name: "A", email: "a@x.io", role: "signer", status: "pending", signingUrl: "https://documenso.example/sign/xyz" }],
    attachment: { filename: "a.pdf", mimeType: "application/pdf", byteSize: 9, storedAt: `documents/${id}.pdf`, sha256: "x", uploadedAt: "2026-06-01T00:00:00Z" },
    status: "uploaded", externalDocumentId: null, signingOrderEnabled: false,
    expiresAt: null, sentAt: null, completedAt: null, voidedAt: null, voidReason: null,
    lastResendAt: null, fieldsAppliedAt: null, fieldsAppliedCount: 0, signedDocumentObject: null,
    appliedEventIds: [], notes: null, payeeId: null, fields: null, createdBy: "op@subfrost.io",
    sourceFileId: null, entityId: null, agreementKey: id, version: 1, parentEnvelopeId: null,
    createdAt: new Date("2026-06-01T00:00:00Z"), updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  }
}

beforeEach(() => {
  delete process.env.DOCUMENSO_API_URL
  delete process.env.DOCUMENSO_API_KEY
  for (const fn of Object.values(env)) fn.mockReset()
  sig.create.mockReset(); sig.findMany.mockReset(); drive.findUnique.mockReset()
  env.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
    ...baseRow(where.id), ...data,
  }))
  env.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...baseRow("e2"), ...data,
  }))
})

describe("signing-proxy token scheme", () => {
  it("round-trips base64url(envelopeId:recipientEmail)", () => {
    const t = encodeSigningToken("env-123", "signer@corp.io")
    expect(decodeSigningToken(t)).toEqual({ envelopeId: "env-123", recipientEmail: "signer@corp.io" })
    expect(signingProxyUrl("env-123", "signer@corp.io")).toBe(`/sign/${t}`)
  })
  it("rejects malformed tokens", () => {
    expect(decodeSigningToken("!!!not-base64!!!")).toBeNull()
  })
})

describe("esign.listVersions / reissue", () => {
  it("reissue creates a new envelope sharing agreementKey with version+1 and parent", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1", { agreementKey: "a1", version: 1 }))
    env.findMany.mockResolvedValue([baseRow("e1", { agreementKey: "a1", version: 1 })])
    const out = await esign.reissue("e1", { subject: "Engagement letter (rev)" }, { id: "u1", email: "op@subfrost.io" })
    const createData = env.create.mock.calls[0][0].data
    expect(createData.agreementKey).toBe("a1")
    expect(createData.version).toBe(2)
    expect(createData.parentEnvelopeId).toBe("e1")
    expect(out.version).toBe(2)
    expect(out.agreementKey).toBe("a1")
  })

  it("listVersions returns the chain ordered by version", async () => {
    env.findMany.mockResolvedValue([
      baseRow("e1", { agreementKey: "a1", version: 1 }),
      baseRow("e2", { agreementKey: "a1", version: 2 }),
    ])
    const versions = await esign.listVersions("a1")
    expect(versions.map((v) => v.version)).toEqual([1, 2])
    expect(env.findMany.mock.calls[0][0].where.agreementKey).toBe("a1")
    expect(env.findMany.mock.calls[0][0].orderBy).toEqual({ version: "asc" })
  })
})

describe("read-scope filtering (documents.view_all)", () => {
  it("narrows the list to the viewer's own envelopes when they lack view-all", async () => {
    env.findMany.mockResolvedValue([])
    await envelopes.list({}, { email: "scoped@subfrost.io", canViewAll: false })
    expect(env.findMany.mock.calls[0][0].where.createdBy).toBe("scoped@subfrost.io")
  })
  it("does not filter by creator when the viewer has view-all", async () => {
    env.findMany.mockResolvedValue([])
    await envelopes.list({}, { email: "admin@subfrost.io", canViewAll: true })
    expect(env.findMany.mock.calls[0][0].where.createdBy).toBeUndefined()
  })
})

describe("esign.createFromFile", () => {
  it("pulls PDF bytes from the DriveFile's gcsObject and stamps sourceFileId", async () => {
    drive.findUnique.mockResolvedValue({ id: "f1", name: "contract.pdf", mimeType: "application/pdf", gcsObject: "files/abc" })
    // create → then agreementKey follow-up update → then attachPdf get + persist
    env.findUnique.mockResolvedValue(baseRow("e2", { sourceFileId: "f1" }))
    const out = await esign.createFromFile(
      { fileId: "f1", subject: "Contract", recipients: [{ name: "A", email: "a@x.io", role: "signer" }] },
      { id: "u1", email: "op@subfrost.io" },
    )
    expect(downloadObject).toHaveBeenCalledWith("files/abc")
    expect(env.create.mock.calls[0][0].data.sourceFileId).toBe("f1")
    expect(out.attachment?.filename).toBe("contract.pdf")
  })
})

describe("/sign/[token] forensic proxy", () => {
  it("writes a VIEWED SignatureEvent from x-tls-ja4/x-forwarded-for then 302s to the signing URL", async () => {
    env.findUnique.mockResolvedValue(baseRow("e1"))
    sig.create.mockResolvedValue({
      id: "s1", envelopeId: "e1", recipientEmail: "a@x.io", kind: "VIEWED",
      ip: "1.2.3.4", userAgent: "curl", ja3: null, ja4: "t13d1516", headers: {}, createdAt: new Date(),
    })
    const token = encodeSigningToken("e1", "a@x.io")
    const req = new NextRequest(`https://subfrost.io/sign/${token}`, {
      headers: {
        "x-tls-ja4": "t13d1516",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "user-agent": "curl/8",
      },
    })
    const res = await signGET(req, { params: Promise.resolve({ token }) })
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://documenso.example/sign/xyz")
    const data = sig.create.mock.calls[0][0].data
    expect(data.kind).toBe("VIEWED")
    expect(data.envelopeId).toBe("e1")
    expect(data.recipientEmail).toBe("a@x.io")
    expect(data.ja4).toBe("t13d1516")
    expect(data.ip).toBe("1.2.3.4")
  })

  it("400s on a malformed token without touching the DB", async () => {
    const res = await signGET(
      new NextRequest("https://subfrost.io/sign/@@@"),
      { params: Promise.resolve({ token: "@@@" }) },
    )
    expect(res.status).toBe(400)
    expect(sig.create).not.toHaveBeenCalled()
  })
})
