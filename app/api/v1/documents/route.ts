import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { envelopes, EsignError } from "@/lib/esign/store"
import { documenso } from "@/lib/esign/documenso"
import {
  EnvelopeCreateSchema,
  type EnvelopeKind,
  type RecipientInput,
  type Field,
  type TemplateRecord,
} from "@/lib/esign/types"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Client IP from proxy headers — mirrors actions/cms/documents.ts#ip().
function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  )
}

// Re-read creds at call time; mirrors documentsOverviewAction#hasCreds().
function hasCreds(): boolean {
  return Boolean(
    (process.env.DOCUMENSO_API_URL ?? "").trim() &&
      (process.env.DOCUMENSO_API_KEY ?? "").trim(),
  )
}

// GET /api/v1/documents — e-sign overview: envelopes + templates + live flag.
// Mirrors documentsOverviewAction (scope: documents.read). Templates are
// best-effort; a Documenso outage must not blank the inbox.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "documents.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    let templates: TemplateRecord[] = []
    try {
      templates = await documenso.listTemplates()
    } catch {
      templates = []
    }
    const list = await envelopes.list()
    return ok({
      count: list.length,
      envelopes: list,
      templates,
      documensoLive: list.length >= 0 && hasCreds(),
    })
  })
}

// POST /api/v1/documents — create a draft envelope (scope: documents.write).
// Mirrors createDocumentAction: validates via EnvelopeCreateSchema (sendNow
// forced false — the PDF is uploaded then sent explicitly via .../send).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "documents.write")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      kind?: EnvelopeKind
      subject?: string
      message?: string
      recipients?: RecipientInput[]
      fields?: Field[]
      signingOrderEnabled?: boolean
      expiresAt?: string
      payeeId?: string | null
    }>(req)
    if (body instanceof NextResponse) return body

    const parsed = EnvelopeCreateSchema.safeParse({ ...body, sendNow: false })
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid envelope", 400)
    }
    try {
      const env = await envelopes.create({
        kind: parsed.data.kind,
        subject: parsed.data.subject,
        message: parsed.data.message,
        recipients: parsed.data.recipients,
        fields: parsed.data.fields,
        signingOrderEnabled: parsed.data.signingOrderEnabled,
        expiresAt: parsed.data.expiresAt,
        createdBy: actor.email,
        payeeId: body.payeeId ?? null,
      })
      await audit("document_create", {
        actorId: actor.id,
        target: env.id,
        ip: clientIp(req),
        details: { subject: env.subject, kind: env.kind },
      })
      return ok({ id: env.id, envelope: env }, 201)
    } catch (e) {
      if (e instanceof EsignError) return fail(e.message, 400)
      throw e
    }
  })
}
