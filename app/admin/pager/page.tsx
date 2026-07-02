import { currentUser } from "@/lib/cms/authz"
import { redirect } from "next/navigation"
import { ALL_TOPIC, NTFY_ADMIN_TOKEN, NTFY_TOKEN, NTFY_URL } from "@/lib/pager/config"
import { listMembers, type PagerMemberInfo } from "@/lib/pager/ntfy"
import { PagerConsole, type PageEvent } from "@/components/cms/PagerConsole"

export const dynamic = "force-dynamic"

// Pull the last 72h of pages straight from ntfy's message cache (all topics in
// one poll request) so the console shows history without us persisting anything.
async function recentPages(members: PagerMemberInfo[]): Promise<PageEvent[]> {
  if (!NTFY_TOKEN && !NTFY_ADMIN_TOKEN) return []
  const token = NTFY_ADMIN_TOKEN ?? NTFY_TOKEN
  const topics = [ALL_TOPIC, ...members.map((m) => m.topic)].join(",")
  try {
    const res = await fetch(`${NTFY_URL}/${topics}/json?poll=1&since=72h`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!res.ok) return []
    const text = await res.text()
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { id: string; time: number; topic: string; message?: string; title?: string; priority?: number })
      .filter((e) => e.message)
      .map((e) => ({
        id: e.id,
        time: e.time,
        topic: e.topic,
        message: e.message ?? "",
        title: e.title ?? "",
        urgent: (e.priority ?? 3) >= 5,
      }))
      .sort((a, b) => b.time - a.time)
  } catch {
    return []
  }
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
  const history = await recentPages(members)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Pager</h1>
      <PagerConsole
        members={members}
        history={history}
        canSend={Boolean(NTFY_TOKEN)}
        canManage={Boolean(NTFY_ADMIN_TOKEN) && me.privileges.includes("iam.modify_user")}
        adminConfigured={Boolean(NTFY_ADMIN_TOKEN)}
        rosterError={rosterError}
      />
    </div>
  )
}
