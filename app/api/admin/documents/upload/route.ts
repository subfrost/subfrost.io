import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { envelopes } from "@/lib/esign/store"

export const runtime = "nodejs"

// Session-authenticated envelope-PDF upload → GCS (private object), then
// attaches it to the envelope record. Gated on documents.write.
// multipart/form-data: envelopeId=<id>, file=<application/pdf>.
export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (!user.privileges.includes("documents.write")) {
    return NextResponse.json({ error: "Insufficient privileges" }, { status: 403 })
  }

  const form = await req.formData()
  const envelopeId = form.get("envelopeId")
  const file = form.get("file")
  if (typeof envelopeId !== "string" || !envelopeId) {
    return NextResponse.json({ error: "Missing envelopeId" }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 })
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only application/pdf is accepted" }, { status: 400 })
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const env = await envelopes.attachPdf(envelopeId, {
      filename: file.name || "document.pdf",
      mimeType: file.type,
      bytes,
    })
    return NextResponse.json({ ok: true, attachment: env.attachment })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
}
