import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listAudit } from "@/lib/cms/audit"

export const dynamic = "force-dynamic"

const ACTION_COLORS: Record<string, string> = {
  login: "text-emerald-300",
  login_2fa: "text-emerald-300",
  login_failed: "text-amber-300",
  logout: "text-zinc-400",
  create_user: "text-sky-300",
  update_user: "text-sky-300",
  delete_user: "text-red-400",
  change_password: "text-violet-300",
  reset_password: "text-violet-300",
  invite_user: "text-sky-300",
  revoke_session: "text-amber-300",
  key_mint: "text-cyan-300",
  key_revoke: "text-amber-300",
  totp_enabled: "text-emerald-300",
  totp_disabled: "text-amber-300",
}

export default async function AuditPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("VIEW_AUDIT")) redirect("/admin")

  const entries = await listAudit(200)

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Audit log</h1>
      <p className="mb-6 text-sm text-zinc-500">Authentication, IAM, and API-key events (most recent 200).</p>
      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-zinc-800 align-top">
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">{e.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className={`whitespace-nowrap px-4 py-2.5 font-medium ${ACTION_COLORS[e.action] ?? "text-zinc-300"}`}>{e.action}</td>
                <td className="px-4 py-2.5 text-zinc-400">{e.actorEmail ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-400">{e.target ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-600">{e.ip ?? "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600">No audit events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
