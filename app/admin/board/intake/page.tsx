import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listIntakeAction } from "@/actions/github/intake"
import { IntakeClient } from "@/components/cms/board/IntakeClient"
import { githubSyncEnabled } from "@/lib/github/config"

export const dynamic = "force-dynamic"

// Triage queue for external GitHub issues (from the allow-listed repos). They
// arrive here PENDING; an operator accepts them onto the board (Requested Tasks)
// or denies them. Keeps the board itself lightweight.
export default async function IntakePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")
  const canEdit = me.privileges.includes("tasks.edit")

  const res = await listIntakeAction()

  return (
    <div className="min-w-0">
      <h1 className="mb-2 text-xl font-bold text-white sm:text-2xl">Issue intake</h1>
      <p className="mb-6 text-sm text-zinc-500">
        External GitHub issues from subfrost-app, subfrost, and subfrost.io. Accept to add to the
        board&apos;s Requested Tasks, or deny.
        {!githubSyncEnabled() && (
          <span className="ml-1 text-amber-500/80">GitHub push/pull is disabled (no PAT configured) — accept/deny still work locally.</span>
        )}
      </p>
      {res.ok ? (
        <IntakeClient initial={res.value.issues} counts={res.value.counts} canEdit={canEdit} />
      ) : (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">Could not load intake: {res.error}</div>
      )}
    </div>
  )
}
