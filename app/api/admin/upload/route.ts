import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { handleUpload } from "@/lib/cms/handle-upload"

export const runtime = "nodejs"

// Session-authenticated image upload (avatars, cover images) → GCS.
// multipart/form-data: file=<image>, kind=avatar|cover|inline|ecosystem
export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const form = await req.formData()
  const file = form.get("file")
  const kind = String(form.get("kind") || "inline")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 })
  }
  const idHint = kind === "avatar" ? user.id : `${user.id}-${file.name}`

  try {
    const data = Buffer.from(await file.arrayBuffer())
    const validKind = (
      kind === "avatar" ? "avatar" : kind === "cover" ? "cover" : kind === "ecosystem" ? "ecosystem" : "inline"
    ) as "avatar" | "cover" | "inline" | "ecosystem"
    const { url } = await handleUpload(validKind, file.type, data, idHint)
    return NextResponse.json({ url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
}
