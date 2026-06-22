import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { uploadPdf } from "@/lib/cms/gcs"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"

export const runtime = "nodejs"

// Session-authenticated invoice-PDF upload → GCS. Gated on the financials
// privilege. multipart/form-data: file=<application/pdf>.
export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (!user.privileges.includes(FINANCIALS_PRIVILEGE)) {
    return NextResponse.json({ error: "Insufficient privileges" }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 })
  }

  try {
    const data = Buffer.from(await file.arrayBuffer())
    const { url } = await uploadPdf(file.type, data, `${user.id}-${file.name}`)
    return NextResponse.json({ url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
}
