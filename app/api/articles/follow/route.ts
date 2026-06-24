import { NextResponse } from "next/server"
import { z } from "zod"
import { followAuthor } from "@/lib/cms/article-subscribe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().trim().email(),
  authorId: z.string().trim().min(1),
  locale: z.enum(["en", "zh"]).optional().default("en"),
})

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const result = await followAuthor(parsed.data.email, parsed.data.authorId, parsed.data.locale)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, message: "Following" }, { status: 201 })
}
