import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { ApplicationsManager } from "@/components/cms/billing/ApplicationsManager"

export const dynamic = "force-dynamic"

export default async function ApplicationsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("billing.read")) redirect("/admin")
  const canEdit = me.privileges.includes("billing.edit")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Stripe applications</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Track onboarding status for each Stripe product.
      </p>
      <ApplicationsManager canEdit={canEdit} />
    </div>
  )
}
