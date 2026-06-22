import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FincenManager } from "@/components/cms/FincenManager"

export const dynamic = "force-dynamic"

export default async function FincenPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("AML_VIEW")) redirect("/admin")
  const canEdit = me.privileges.includes("AML_EDIT")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">FinCEN / BSA filings</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Draft the MSB registration (Form 107), SARs and CTRs. Submissions queue locally until the BSA
        E-Filing credentials are mounted.
      </p>
      <FincenManager canEdit={canEdit} />
    </div>
  )
}
