import { currentUser } from "@/lib/cms/authz"
import { redirect } from "next/navigation"
import { ALL_TOPIC, NTFY_TOKEN, NTFY_URL, PAGER_ROSTER, topicFor } from "@/lib/pager/config"
import { PagerConsole, type PageEvent } from "@/components/cms/PagerConsole"

export const dynamic = "force-dynamic"

// Pull the last 72h of pages straight from ntfy's message cache (all topics in
// one poll request) so the console shows history without us persisting anything.
async function recentPages(): Promise<PageEvent[]> {
  if (!NTFY_TOKEN) return []
  const topics = [ALL_TOPIC, ...PAGER_ROSTER.map((m) => topicFor(m.id))].join(",")
  try {
    const res = await fetch(`${NTFY_URL}/${topics}/json?poll=1&since=72h`, {
      headers: { Authorization: `Bearer ${NTFY_TOKEN}` },
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

  const history = await recentPages()
  const configured = Boolean(NTFY_TOKEN)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Pager</h1>
      {!configured && (
        <p className="mb-6 rounded border border-yellow-600 bg-yellow-950/40 p-3 text-sm text-yellow-300">
          NTFY_TOKEN is not configured — pages cannot be sent. Create the publish
          token on the ntfy server and add it to the <code>ntfy-publish-token</code> secret
          (see k8s/ntfy/README.md).
        </p>
      )}
      <PagerConsole
        roster={PAGER_ROSTER}
        history={history}
        disabled={!configured}
      />
    </div>
  )
}
