import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { getSystemNotice } from "@/lib/cms/system-notice"
import { SystemNoticeCard } from "@/components/cms/notice/SystemNoticeCard"

export const dynamic = "force-dynamic"

export default async function SystemNoticePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("system.view")) redirect("/admin")
  const notice = await getSystemNotice()
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">Site notice</h1>
      <p className="mb-6 text-sm text-zinc-500">
        A single banner/modal shown across app.subfrost.io. Turn it on for an outage or an
        announcement; turn it off to hide it. Changes reach the app within ~60s.
      </p>
      <SystemNoticeCard initial={notice} canEdit={me.privileges.includes("system.edit")} />
    </div>
  )
}
