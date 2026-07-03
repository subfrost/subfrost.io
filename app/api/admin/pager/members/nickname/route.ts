/**
 * PATCH /api/admin/pager/members/nickname — set a member's display nickname
 * (and, admin-only, link their CMS email so they can self-edit).
 *
 * Who may edit whose nickname:
 *  - iam.modify_user admins: anyone's
 *  - everyone else: only the member whose linked cmsEmail matches their session
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { MEMBER_ID_RE } from "@/lib/pager/ntfy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  id: z.string().regex(MEMBER_ID_RE),
  nickname: z.string().trim().min(1).max(40).optional(),
  cmsEmail: z.string().email().nullable().optional(), // admin-only linkage
})

export async function PATCH(request: NextRequest) {
  const me = await currentUser()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { id, nickname, cmsEmail } = parsed.data

  const isAdmin = me.privileges.includes("iam.modify_user")
  if (!isAdmin) {
    if (cmsEmail !== undefined) {
      return NextResponse.json({ error: "Only admins can link accounts" }, { status: 403 })
    }
    const row = await prisma.pagerMember.findUnique({ where: { memberId: id } })
    if (!row?.cmsEmail || row.cmsEmail.toLowerCase() !== me.email.toLowerCase()) {
      return NextResponse.json(
        { error: "You can only rename yourself — ask an admin to link your account or rename you" },
        { status: 403 },
      )
    }
  }

  const member = await prisma.pagerMember.upsert({
    where: { memberId: id },
    create: { memberId: id, nickname: nickname ?? null, cmsEmail: isAdmin ? cmsEmail ?? null : undefined },
    update: {
      ...(nickname !== undefined ? { nickname } : {}),
      ...(isAdmin && cmsEmail !== undefined ? { cmsEmail } : {}),
    },
  })
  return NextResponse.json({ ok: true, memberId: member.memberId, nickname: member.nickname })
}
