/**
 * Hardware pager provisioning — POST {id} issues credentials for the member's
 * M5 Atom Echo pager (firmware/atom-pager): a read-only `dev-<id>` ntfy user
 * on the same topics as their phone. Re-posting rotates the password (old
 * device stops receiving). Password is returned ONCE, stored nowhere.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { currentUser } from "@/lib/cms/authz"
import { NTFY_ADMIN_TOKEN } from "@/lib/pager/config"
import { MEMBER_ID_RE, listMembers, provisionDevice } from "@/lib/pager/ntfy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const idSchema = z.object({ id: z.string().regex(MEMBER_ID_RE, "invalid member id") })

export async function POST(request: NextRequest) {
  const me = await currentUser()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!me.privileges.includes("iam.modify_user")) {
    return NextResponse.json({ error: "Requires user-management privilege" }, { status: 403 })
  }
  if (!NTFY_ADMIN_TOKEN) {
    return NextResponse.json({ error: "NTFY_ADMIN_TOKEN not configured" }, { status: 503 })
  }
  const parsed = idSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  try {
    const members = await listMembers()
    if (!members.some((m) => m.id === parsed.data.id)) {
      return NextResponse.json({ error: "No such member — add them to the roster first" }, { status: 404 })
    }
    return NextResponse.json(await provisionDevice(parsed.data.id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
