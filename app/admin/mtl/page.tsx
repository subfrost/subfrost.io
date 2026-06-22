import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { MtlManager } from "@/components/cms/MtlManager"

export const dynamic = "force-dynamic"

export default async function MtlPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("AML_VIEW")) redirect("/admin")
  const canEdit = me.privileges.includes("AML_EDIT")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">MTL licensing</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Money-transmitter license tracker for all 50 states and DC. Seed the 51 jurisdictions once,
        then keep each row up to date as filings progress.
      </p>
      <MtlManager canEdit={canEdit} />
    </div>
  )
}
