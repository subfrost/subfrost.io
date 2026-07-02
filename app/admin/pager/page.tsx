import { currentUser } from "@/lib/cms/authz"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { NTFY_ADMIN_TOKEN, NTFY_TOKEN } from "@/lib/pager/config"
import { listMembers, type PagerMemberInfo } from "@/lib/pager/ntfy"
import { PagerConsole, type PageRow } from "@/components/cms/PagerConsole"

export const dynamic = "force-dynamic"

// History comes from our own PagerPage/PagerTarget rows (the source of truth
// for ack state), not the ntfy cache.
async function recentPages(): Promise<PageRow[]> {
  const pages = await prisma.pagerPage.findMany({
    where: { createdAt: { gt: new Date(Date.now() - 72 * 3600_000) } },
    orderBy: { createdAt: "desc" },
    include: { targets: { select: { memberId: true, ackedAt: true, repeatCount: true } } },
    take: 100,
  })
  return pages.map((p) => ({
    id: p.id,
    time: p.createdAt.toISOString(),
    message: p.message,
    sentBy: p.sentBy,
    urgent: p.urgent,
    targets: p.targets.map((t) => ({
      memberId: t.memberId,
      ackedAt: t.ackedAt ? t.ackedAt.toISOString() : null,
      repeatCount: t.repeatCount,
    })),
  }))
}

// Latest ack per member — doubles as the "is their phone actually set up"
// signal in the Team panel.
async function lastAcks(): Promise<Record<string, string>> {
  const rows = await prisma.pagerTarget.groupBy({
    by: ["memberId"],
    where: { ackedAt: { not: null } },
    _max: { ackedAt: true },
  })
  return Object.fromEntries(
    rows.filter((r) => r._max.ackedAt).map((r) => [r.memberId, r._max.ackedAt!.toISOString()]),
  )
}

export default async function PagerPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")

  let members: PagerMemberInfo[] = []
  let rosterError: string | null = null
  if (NTFY_ADMIN_TOKEN) {
    try {
      members = await listMembers()
    } catch (e) {
      rosterError = e instanceof Error ? e.message : String(e)
    }
  }
  const [history, acks] = await Promise.all([recentPages(), lastAcks()])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Pager</h1>
      <PagerConsole
        members={members}
        lastAcks={acks}
        history={history}
        canSend={Boolean(NTFY_TOKEN)}
        canManage={Boolean(NTFY_ADMIN_TOKEN) && me.privileges.includes("iam.modify_user")}
        adminConfigured={Boolean(NTFY_ADMIN_TOKEN)}
        rosterError={rosterError}
      />
    </div>
  )
}
