import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { IssuingManager } from "@/components/cms/billing/IssuingManager"

export const dynamic = "force-dynamic"

export default async function IssuingPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("BILLING_VIEW")) redirect("/admin")
  const canEdit = me.privileges.includes("BILLING_EDIT")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Issuing</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Manage issued cards, state controls, and dispute evidence submission.
      </p>
      <BillingBanner live={isLive()} />
      <IssuingManager canEdit={canEdit} />
    </div>
  )
}
