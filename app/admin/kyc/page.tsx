import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { KycManager } from "@/components/cms/KycManager"

export const dynamic = "force-dynamic"

export default async function KycPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("AML_VIEW")) redirect("/admin")
  const canEdit = me.privileges.includes("AML_EDIT")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">KYC review queue</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Customer identity intakes awaiting disposition. Decisions are recorded with your email and
        kept as an append-only history.
      </p>
      <KycManager canEdit={canEdit} />
    </div>
  )
}
