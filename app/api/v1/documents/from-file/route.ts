import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { esign, EsignError, type EsignActor } from "@/lib/esign/store"
import {
  EnvelopeCreateSchema,
  type EnvelopeKind,
  type RecipientInput,
  type Field,
} from "@/lib/esign/types"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  )
}

// POST /api/v1/documents/from-file — create a draft envelope whose PDF is
// pulled from an existing DriveFile's stored object rather than an upload
// (scope: documents.write). Mirrors createFromFileAction. Body:
//   { fileId, subject, message?, recipients[], kind?, fields?,
//     signingOrderEnabled?, expiresAt?, entityId?, payeeId? }
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "documents.write")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      fileId?: string
      kind?: EnvelopeKind
      subject?: string
      message?: string
      recipients?: RecipientInput[]
      fields?: Field[]
      signingOrderEnabled?: boolean
      expiresAt?: string
      entityId?: string | null
      payeeId?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.fileId) return fail("fileId required", 400)

    const parsed = EnvelopeCreateSchema.safeParse({
      kind: body.kind ?? "other",
      subject: body.subject,
      message: body.message,
      recipients: body.recipients,
      fields: body.fields,
      signingOrderEnabled: body.signingOrderEnabled ?? false,
      expiresAt: body.expiresAt,
      sendNow: false,
    })
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid envelope", 400)
    }
    const esignActor: EsignActor = { id: actor.id, email: actor.email }
    try {
      const env = await esign.createFromFile(
        {
          fileId: body.fileId,
          kind: parsed.data.kind,
          subject: parsed.data.subject,
          message: parsed.data.message,
          recipients: parsed.data.recipients,
          fields: parsed.data.fields,
          signingOrderEnabled: parsed.data.signingOrderEnabled,
          expiresAt: parsed.data.expiresAt,
          entityId: body.entityId ?? null,
          payeeId: body.payeeId ?? null,
        },
        esignActor,
      )
      await audit("document_create", {
        actorId: actor.id,
        target: env.id,
        ip: clientIp(req),
        details: { subject: env.subject, kind: env.kind, sourceFileId: body.fileId },
      })
      return ok({ id: env.id, envelope: env }, 201)
    } catch (e) {
      if (e instanceof EsignError) return fail(e.message, 400)
      throw e
    }
  })
}
