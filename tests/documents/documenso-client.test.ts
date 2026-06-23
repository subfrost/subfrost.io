// Locks the Documenso transport client to the original subfrost-admin behavior.
// documenso.ts was ported byte-for-byte (modulo import path); these tests prove
// the wire contract: mock-mode fallbacks, live-mode request shapes, field/status
// mapping, webhook secret verification, and event parsing.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  documenso, hasDocumensoCreds, isLocalId,
  documensoFieldType, documensoFieldMetaType, mapDocumensoStatusToEnvelopeStatus,
  verifyWebhookSecret, parseWebhookEvent, STUB_TEMPLATES,
  DocumensoHttpError,
} from "@/lib/esign/documenso"
import type { Field } from "@/lib/esign/types"

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

// ---------- pure mappers (must match Documenso's vocabulary) ----------

describe("field-type wire mapping", () => {
  it("maps internal field types to Documenso SCREAMING_SNAKE", () => {
    expect(documensoFieldType("signature")).toBe("SIGNATURE")
    expect(documensoFieldType("date")).toBe("DATE")
    expect(documensoFieldType("initial")).toBe("INITIALS") // plural, per Documenso
    expect(documensoFieldType("text")).toBe("TEXT")
    expect(documensoFieldType("checkbox")).toBe("CHECKBOX")
  })
  it("maps fieldMeta discriminator (lowercase, initials plural)", () => {
    expect(documensoFieldMetaType("signature")).toBe("signature")
    expect(documensoFieldMetaType("initial")).toBe("initials")
    expect(documensoFieldMetaType("checkbox")).toBe("checkbox")
  })
})

describe("mapDocumensoStatusToEnvelopeStatus", () => {
  it("maps the 4 document statuses and defaults to sent", () => {
    expect(mapDocumensoStatusToEnvelopeStatus("DRAFT")).toBe("draft")
    expect(mapDocumensoStatusToEnvelopeStatus("PENDING")).toBe("sent")
    expect(mapDocumensoStatusToEnvelopeStatus("COMPLETED")).toBe("completed")
    expect(mapDocumensoStatusToEnvelopeStatus("REJECTED")).toBe("declined")
    expect(mapDocumensoStatusToEnvelopeStatus("WHATEVER")).toBe("sent")
  })
})

describe("creds detection", () => {
  it("requires a valid http(s) url + key", () => {
    process.env.DOCUMENSO_API_URL = ""
    process.env.DOCUMENSO_API_KEY = ""
    expect(hasDocumensoCreds()).toBe(false)
    process.env.DOCUMENSO_API_URL = "not-a-url"
    process.env.DOCUMENSO_API_KEY = "api_x"
    expect(hasDocumensoCreds()).toBe(false)
    process.env.DOCUMENSO_API_URL = "https://docu.test"
    expect(hasDocumensoCreds()).toBe(true)
  })
  it("recognizes LOCAL- ids", () => {
    expect(isLocalId("LOCAL-abc")).toBe(true)
    expect(isLocalId("123")).toBe(false)
    expect(isLocalId(undefined)).toBe(false)
  })
})

// ---------- mock-mode fallbacks (no creds) ----------

describe("mock mode (no creds)", () => {
  beforeEach(() => {
    delete process.env.DOCUMENSO_API_URL
    delete process.env.DOCUMENSO_API_KEY
  })

  it("createDocument returns LOCAL ids and never calls fetch", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const res = await documenso.createDocument({
      title: "T", fileName: "a.pdf", fileBytes: Buffer.from("x"),
      recipients: [{ name: "A", email: "a@x.io", role: "signer" }],
    })
    expect(res.documentId).toMatch(/^LOCAL-/)
    expect(res.recipients[0].recipientId).toMatch(/^LOCAL-rcpt-/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("send/addFields/cancel are no-ops; listTemplates returns the 4 stubs", async () => {
    await expect(documenso.sendDocument("LOCAL-1")).resolves.toBeUndefined()
    await expect(documenso.cancelDocument("LOCAL-1")).resolves.toBeUndefined()
    const tpls = await documenso.listTemplates()
    expect(tpls).toHaveLength(STUB_TEMPLATES.length)
    expect(tpls.map((t) => t.id)).toEqual(STUB_TEMPLATES.map((t) => t.id))
  })
})

// ---------- live mode (mocked fetch) ----------

describe("live mode wire contract", () => {
  beforeEach(() => {
    process.env.DOCUMENSO_API_URL = "https://docu.test"
    process.env.DOCUMENSO_API_KEY = "api_secret"
  })

  it("createDocument does POST /documents then PUT to the presigned url, uppercasing roles", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith("/api/v1/documents")) {
        return jsonResponse({
          documentId: 42, uploadUrl: "https://s3.test/put",
          recipients: [{ recipientId: 7, email: "a@x.io", signingUrl: "https://sign/1" }],
        })
      }
      return new Response(null, { status: 200 }) // the PUT
    }))

    const res = await documenso.createDocument({
      title: "Doc", fileName: "a.pdf", fileBytes: Buffer.from("pdf"),
      recipients: [{ name: "A", email: "a@x.io", role: "signer", signingOrder: 1 }],
      meta: { subject: "Doc", signingOrder: "SEQUENTIAL" },
    })

    expect(res.documentId).toBe("42")
    expect(res.recipients[0]).toEqual({ email: "a@x.io", recipientId: "7", signingUrl: "https://sign/1" })
    // step 1 body
    const post = calls.find((c) => c.url.endsWith("/api/v1/documents"))!
    const body = JSON.parse(post.init.body as string)
    expect(body.recipients[0].role).toBe("SIGNER")
    expect(body.recipients[0].signingOrder).toBe(1)
    expect(body.meta.signingOrder).toBe("SEQUENTIAL")
    expect((post.init.headers as Record<string, string>).Authorization).toBe("Bearer api_secret")
    // step 2 PUT to the presigned url, NO auth header
    const put = calls.find((c) => c.url === "https://s3.test/put")!
    expect(put.init.method).toBe("PUT")
    expect((put.init.headers as Record<string, string>)["Content-Type"]).toBe("application/pdf")
  })

  it("addFields converts normalized coords to page-% and sends numeric recipientId + fieldMeta", async () => {
    const bodies: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string))
      return new Response(null, { status: 200 })
    }))
    const fields: Field[] = [
      { type: "signature", recipientEmail: "a@x.io", page: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.05, required: true },
    ]
    await documenso.addFields("42", fields, { "a@x.io": "7" })
    const b = bodies[0] as Record<string, number | object>
    expect(b.recipientId).toBe(7) // numeric coercion
    expect(b.type).toBe("SIGNATURE")
    expect(b.pageX).toBe(10) // 0.1 * 100
    expect(b.pageY).toBe(20)
    expect(b.pageWidth).toBe(30)
    expect(b.pageHeight).toBe(5)
    expect((b.fieldMeta as Record<string, unknown>).type).toBe("signature")
  })

  it("resendDocument requires at least one recipient id", async () => {
    vi.stubGlobal("fetch", vi.fn())
    await expect(documenso.resendDocument("42", { recipientIds: [] })).rejects.toThrow(/at least one recipientId/)
  })

  it("maps a 401 to DocumensoHttpError with an auth hint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401, statusText: "Unauthorized" })))
    await expect(documenso.getDocument("42")).rejects.toBeInstanceOf(DocumensoHttpError)
    await expect(documenso.getDocument("42")).rejects.toThrow(/auth failed/)
  })

  it("getDocument coalesces the tri-status into a single recipient status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      status: "PENDING",
      recipients: [
        { id: 7, email: "a@x.io", signingStatus: "SIGNED", signedAt: "2026-06-02T00:00:00Z" },
        { id: 8, email: "b@x.io", readStatus: "OPENED", sendStatus: "SENT" },
      ],
    })))
    const doc = await documenso.getDocument("42")
    expect(doc.recipients.find((r) => r.email === "a@x.io")?.status).toBe("SIGNED")
    expect(doc.recipients.find((r) => r.email === "b@x.io")?.status).toBe("OPENED")
  })
})

// ---------- webhook verification + parsing ----------

describe("webhook secret verification (constant-time, NOT HMAC)", () => {
  beforeEach(() => { process.env.DOCUMENSO_WEBHOOK_SECRET = "shhh-secret" })
  it("accepts the exact secret, rejects wrong / length-mismatch / empty", () => {
    expect(verifyWebhookSecret("shhh-secret")).toBe(true)
    expect(verifyWebhookSecret("wrong-secret!")).toBe(false)
    expect(verifyWebhookSecret("short")).toBe(false)
    expect(verifyWebhookSecret(undefined)).toBe(false)
  })
  it("rejects everything when no secret is configured", () => {
    delete process.env.DOCUMENSO_WEBHOOK_SECRET
    expect(verifyWebhookSecret("anything")).toBe(false)
  })
})

describe("parseWebhookEvent", () => {
  it("parses a DOCUMENT_COMPLETED payload", () => {
    const ev = parseWebhookEvent(JSON.stringify({
      event: "DOCUMENT_COMPLETED",
      createdAt: "2026-06-02T00:00:00Z",
      payload: { id: 42, recipients: [{ id: 7, email: "a@x.io", signingStatus: "SIGNED" }] },
    }))
    expect(ev.event).toBe("DOCUMENT_COMPLETED")
    expect(ev.payload.id).toBe("42")
    expect(ev.payload.recipients[0].email).toBe("a@x.io")
  })

  it("hoists the capital-R Recipient alias onto recipients", () => {
    const ev = parseWebhookEvent(JSON.stringify({
      event: "DOCUMENT_SIGNED",
      payload: { id: 9, Recipient: [{ id: 1, email: "z@x.io", signingStatus: "SIGNED" }] },
    }))
    expect(ev.payload.recipients).toHaveLength(1)
    expect(ev.payload.recipients[0].email).toBe("z@x.io")
  })

  it("throws on an unknown event discriminator (caller absorbs as 200/ignored)", () => {
    expect(() => parseWebhookEvent(JSON.stringify({ event: "MADE_UP_EVENT", payload: { id: 1 } }))).toThrow()
  })
})
