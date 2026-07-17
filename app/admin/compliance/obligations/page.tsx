import Link from "next/link"
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { ObligationsManager } from "@/components/cms/compliance/ObligationsManager"

export const dynamic = "force-dynamic"

export default async function ObligationsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("aml.read")) redirect("/admin")
  const canEdit = me.privileges.includes("aml.edit")

  return (
    <div className="max-w-5xl">
      <div className="mb-2 flex items-center gap-3">
        <Link href="/admin/compliance" className="text-xs text-sky-400 hover:text-sky-300">← Compliance</Link>
      </div>
      <h1 className="mb-2 text-2xl font-bold text-white">Obligation calendar</h1>
      <p className="mb-6 max-w-3xl text-sm text-zinc-500">
        Every recurring or one-time thing the company must do — tax returns and franchise tax,
        corporate filings, AML/BSA program duties, money-transmitter licensing, securities and
        employment items. Each row carries who it&apos;s owed to, when it&apos;s due, who owns it,
        and a link to the filing evidence. &ldquo;Mark done&rdquo; rolls a recurring item forward to
        its next due date automatically; overdue and blocked items surface on the compliance overview.
      </p>
      <ObligationsManager canEdit={canEdit} />
    </div>
  )
}
