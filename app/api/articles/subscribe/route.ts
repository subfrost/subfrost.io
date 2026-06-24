import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { subscribeGlobal } from "@/lib/cms/article-subscribe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(["en", "zh"]).optional().default("en"),
  source: z.string().trim().min(1).max(120).optional().default("articles_page"),
})

export async function POST(req: NextRequest) {
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
  const { id } = await subscribeGlobal(parsed.data.email, parsed.data.locale, parsed.data.source)
  return NextResponse.json({ ok: true, message: "Subscribed", id }, { status: 201 })
}
