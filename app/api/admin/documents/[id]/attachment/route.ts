import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { envelopes } from "@/lib/esign/store"

export const runtime = "nodejs"

// Privilege-gated stream of an envelope's PDF. Document PDFs are stored as
// PRIVATE GCS objects (signatures + PII), so they are only ever served here,
// after the documents.read gate. ?signed=1 returns the fully-signed copy
// (fetched + cached from Documenso on first request); default is the original
// uploaded PDF.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (!user.privileges.includes("documents.read")) {
    return NextResponse.json({ error: "Insufficient privileges" }, { status: 403 })
  }

  const { id } = await ctx.params
  const wantSigned = req.nextUrl.searchParams.get("signed") === "1"

  try {
    if (wantSigned) {
      const bytes = await envelopes.readSignedPdf(id)
      if (!bytes) return NextResponse.json({ error: "No signed PDF available yet" }, { status: 404 })
      return pdf(bytes, `${id}-signed.pdf`)
    }
    const file = await envelopes.readPdf(id)
    if (!file) return NextResponse.json({ error: "No attachment" }, { status: 404 })
    return pdf(file.bytes, file.attachment.filename)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Download failed" }, { status: 400 })
  }
}

function pdf(bytes: Buffer, filename: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^a-z0-9.\-_]/gi, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
