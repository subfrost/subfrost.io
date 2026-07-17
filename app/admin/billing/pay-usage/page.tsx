import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Small server-rendered view over the PayUsageEvent stream the mobile-api
// backend mirrors here. Read-only; the events are non-PII by construction.
export default async function PayUsagePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("pay.view")) redirect("/admin")

  const now = Date.now()
  const dayAgoSec = Math.floor((now - 24 * 60 * 60 * 1000) / 1000)
  const weekAgoSec = Math.floor((now - 7 * 24 * 60 * 60 * 1000) / 1000)

  const [total, last24h, last7d, distinctUsers, recent, topActionsRaw] = await Promise.all([
    prisma.payUsageEvent.count(),
    prisma.payUsageEvent.count({ where: { timestampSec: { gte: dayAgoSec } } }),
    prisma.payUsageEvent.count({ where: { timestampSec: { gte: weekAgoSec } } }),
    prisma.payUsageEvent.findMany({
      where: { userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.payUsageEvent.findMany({
      orderBy: { timestampSec: "desc" },
      take: 100,
    }),
    prisma.payUsageEvent.groupBy({
      by: ["action"],
      where: { timestampSec: { gte: weekAgoSec } },
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: 12,
    }),
  ])

  const fmtTime = (sec: number) =>
    new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 19)

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">SUBFROST Pay usage</h1>
      <p className="mb-6 text-sm text-white/50">
        Event stream mirrored from the mobile-api backend. Non-PII: audit
        action, actor, and the backend&apos;s scrubbed details only.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total events" value={total} />
        <Stat label="Last 24h" value={last24h} />
        <Stat label="Last 7d" value={last7d} />
        <Stat label="Distinct users" value={distinctUsers.length} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Top actions (7d)</h2>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <tbody>
                {topActionsRaw.length === 0 ? (
                  <tr>
                    <td className="p-3 text-white/40">No events yet.</td>
                  </tr>
                ) : (
                  topActionsRaw.map((a) => (
                    <tr key={a.action} className="border-b border-white/5 last:border-0">
                      <td className="p-3 font-mono text-xs text-white/80">{a.action}</td>
                      <td className="p-3 text-right tabular-nums text-white">
                        {a._count.action}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Recent events</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/50">
                  <th className="p-3 font-medium">Time (UTC)</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Actor</th>
                  <th className="p-3 font-medium">User</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-white/40">
                      No events yet.
                    </td>
                  </tr>
                ) : (
                  recent.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap p-3 tabular-nums text-white/70">
                        {fmtTime(e.timestampSec)}
                      </td>
                      <td className="p-3 font-mono text-xs text-white/80">{e.action}</td>
                      <td className="p-3 text-white/60">
                        {e.actorKind}
                        {e.actorId ? ` · ${e.actorId.slice(0, 10)}` : ""}
                      </td>
                      <td className="p-3 font-mono text-xs text-white/60">
                        {e.userId ? e.userId.slice(0, 12) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="text-2xl font-bold tabular-nums text-white">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-white/50">{label}</div>
    </div>
  )
}
