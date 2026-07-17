/**
 * POST /api/admin/pager — send a page to one teammate or the whole team.
 * Session-gated like the other browser admin APIs (currentUser), not the
 * x-admin-secret scheme: pages are sent by logged-in humans from /admin/pager.
 *
 * Priority 5 ("max") is what makes phone apps alarm through Do-Not-Disturb
 * and will make the hardware pagers scream, so `urgent` maps to 5, `info` to 3.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { currentUser } from "@/lib/cms/authz"
import { NTFY_TOKEN } from "@/lib/pager/config"
import { MEMBER_ID_RE, listMembers } from "@/lib/pager/ntfy"
import { sendPage } from "@/lib/pager/send"

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

  // Resolve targets: "all" fans out to every member's PERSONAL topic (each
  // notification carries that member's own ACK button — page-all can't do
  // per-person acks, so it's reserved for token-less broadcast use).
  let memberIds: string[]
  if (target === "all") {
    try {
      memberIds = (await listMembers()).map((m) => m.id)
    } catch (e) {
      return NextResponse.json({ error: `Cannot resolve roster: ${e instanceof Error ? e.message : e}` }, { status: 502 })
    }
    if (memberIds.length === 0) {
      return NextResponse.json({ error: "No members to page" }, { status: 400 })
    }
  } else {
    if (!MEMBER_ID_RE.test(target)) {
      return NextResponse.json({ error: `Invalid target: ${target}` }, { status: 400 })
    }
    // Validate against the live roster when the admin credential is present;
    // publisher-only deployments fall back to the pattern check above (the
    // publish simply lands in an unsubscribed topic if the id is stale).
    try {
      const members = await listMembers()
      if (!members.some((m) => m.id === target)) {
        return NextResponse.json({ error: `Unknown target: ${target}` }, { status: 400 })
      }
    } catch {
      /* no admin token — pattern check only */
    }
    memberIds = [target]
  }

  try {
    const { pageId } = await sendPage({
      memberIds,
      message,
      urgent,
      sentBy: me.name || me.email,
    })
    return NextResponse.json({ ok: true, pageId, memberIds })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
