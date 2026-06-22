import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { SubscriptionsManager } from "@/components/cms/billing/SubscriptionsManager"

export const dynamic = "force-dynamic"

export default async function SubscriptionsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("billing.read")) redirect("/admin")
  const canEdit = me.privileges.includes("billing.edit")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Subscriptions</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Subscription tiers and subscribers. Manage cancellations and reactivations.
      </p>
      <BillingBanner live={isLive()} />
      <SubscriptionsManager canEdit={canEdit} />
    </div>
  )
}
