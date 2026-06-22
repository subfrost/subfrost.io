import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"

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
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    )
  }

  const email = parsed.data.email.toLowerCase()
  const db = prisma as unknown as {
    articleSubscriber: {
      upsert: (args: {
        where: { email: string }
        create: { email: string; locale: "en" | "zh"; source: string; active: boolean }
        update: { locale: "en" | "zh"; source: string; active: boolean }
        select: { id: true; subscribedAt: true }
      }) => Promise<{ id: string; subscribedAt: Date }>
    }
  }

  const saved = await db.articleSubscriber.upsert({
    where: { email },
    create: {
      email,
      locale: parsed.data.locale,
      source: parsed.data.source,
      active: true,
    },
    update: {
      locale: parsed.data.locale,
      source: parsed.data.source,
      active: true,
    },
    select: { id: true, subscribedAt: true },
  })

  return NextResponse.json(
    {
      ok: true,
      message: "Subscribed",
      id: saved.id,
      subscribedAt: saved.subscribedAt.toISOString(),
    },
    { status: 201 },
  )
}
