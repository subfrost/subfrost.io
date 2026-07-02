/**
 * Pager roster management — members ARE ntfy user accounts (lib/pager/ntfy.ts).
 *
 * GET    -> list members                                  (any admin session)
 * POST   {id} -> create member + login password (shown ONCE) (iam.modify_user)
 * DELETE {id} -> remove member and revoke their access     (iam.modify_user)
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { currentUser } from "@/lib/cms/authz"
import { NTFY_ADMIN_TOKEN } from "@/lib/pager/config"
import { MEMBER_ID_RE, createMember, deleteMember, listMembers } from "@/lib/pager/ntfy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function gate(manage: boolean): Promise<NextResponse | null> {
  const me = await currentUser()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (manage && !me.privileges.includes("iam.modify_user")) {
    return NextResponse.json({ error: "Requires user-management privilege" }, { status: 403 })
  }
  if (!NTFY_ADMIN_TOKEN) {
    return NextResponse.json({ error: "NTFY_ADMIN_TOKEN not configured" }, { status: 503 })
  }
  return null
}

export async function GET() {
  const denied = await gate(false)
  if (denied) return denied
  try {
    return NextResponse.json({ members: await listMembers() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}

const idSchema = z.object({ id: z.string().regex(MEMBER_ID_RE, "2-32 chars: lowercase letters, digits, dashes; starts with a letter") })

export async function POST(request: NextRequest) {
  const denied = await gate(true)
  if (denied) return denied
  const parsed = idSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  try {
    const member = await createMember(parsed.data.id)
    return NextResponse.json(member) // includes the one-time password
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await gate(true)
  if (denied) return denied
  const parsed = idSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  try {
    await deleteMember(parsed.data.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
