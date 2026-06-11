import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { uploadImage } from "@/lib/cms/gcs"

export const runtime = "nodejs"

// Session-authenticated image upload (avatars, cover images) → GCS.
// multipart/form-data: file=<image>, kind=avatar|cover|inline
export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const form = await req.formData()
  const file = form.get("file")
  const kind = String(form.get("kind") || "inline")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 })
  }
  const prefix = kind === "avatar" ? "avatars" : kind === "cover" ? "covers" : "inline"
  const idHint = kind === "avatar" ? user.id : `${user.id}-${file.name}`

  try {
    const data = Buffer.from(await file.arrayBuffer())
    const { url } = await uploadImage(prefix as "avatars" | "covers" | "inline", file.type, data, idHint)
    return NextResponse.json({ url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
}
