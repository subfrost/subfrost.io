import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { esign, EsignError, type EsignActor } from "@/lib/esign/store"
import {
  EnvelopeFromTemplateSchema,
  type EnvelopeFromTemplateInput,
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

// POST /api/v1/documents/from-template — spawn an envelope from a Documenso
// template and send it in one shot (scope: documents.write). Mirrors
// createFromTemplateAction: body is the EnvelopeFromTemplateInput
// (templateId, subject, message?, recipients[], kind?) plus an optional
// top-level payeeId to link the paperwork to a payee.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "documents.write")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<
      EnvelopeFromTemplateInput & { payeeId?: string | null }
    >(req)
    if (body instanceof NextResponse) return body

    const { payeeId, ...input } = body
    const parsed = EnvelopeFromTemplateSchema.safeParse(input)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid template input", 400)
    }
    const esignActor: EsignActor = { id: actor.id, email: actor.email }
    try {
      const env = await esign.createFromTemplate(parsed.data, esignActor, {
        payeeId: payeeId ?? null,
      })
      await audit("document_create", {
        actorId: actor.id,
        target: env.id,
        ip: clientIp(req),
        details: { subject: env.subject, template: parsed.data.templateId },
      })
      await audit("document_send", { actorId: actor.id, target: env.id, ip: clientIp(req) })
      return ok({ id: env.id, envelope: env }, 201)
    } catch (e) {
      if (e instanceof EsignError) return fail(e.message, 400)
      throw e
    }
  })
}
