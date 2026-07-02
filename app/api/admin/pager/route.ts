/**
 * POST /api/admin/pager — send a page to one teammate or the whole team.
 * Session-gated like the other browser admin APIs (currentUser), not the
 * x-admin-secret scheme: pages are sent by logged-in humans from /admin/pager.
 *
 * Publishes to the in-cluster ntfy (see lib/pager/config.ts). Priority 5
 * ("max") is what makes phone apps alarm through Do-Not-Disturb and will make
 * the hardware pagers scream, so `urgent` maps to 5 and `info` to 3.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { currentUser } from "@/lib/cms/authz"
import { ALL_TOPIC, NTFY_TOKEN, NTFY_URL, PAGER_ROSTER, topicFor } from "@/lib/pager/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  target: z.string().min(1), // member id or "all"
  message: z.string().min(1).max(1024),
  urgent: z.boolean().default(true),
})

export async function POST(request: NextRequest) {
  const me = await currentUser()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!NTFY_TOKEN) {
    return NextResponse.json({ error: "NTFY_TOKEN not configured" }, { status: 503 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { target, message, urgent } = parsed.data

  const topic =
    target === "all" ? ALL_TOPIC
    : PAGER_ROSTER.some((m) => m.id === target) ? topicFor(target)
    : null
  if (!topic) return NextResponse.json({ error: `Unknown target: ${target}` }, { status: 400 })

  const res = await fetch(`${NTFY_URL}/${topic}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NTFY_TOKEN}`,
      "X-Title": `PAGE from ${me.name || me.email}`,
      "X-Priority": urgent ? "5" : "3",
      "X-Tags": urgent ? "rotating_light" : "information_source",
    },
    body: message,
    cache: "no-store",
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    return NextResponse.json({ error: `ntfy publish failed (${res.status}): ${detail}` }, { status: 502 })
  }
  const published = await res.json()
  return NextResponse.json({ ok: true, id: published.id, topic })
}
