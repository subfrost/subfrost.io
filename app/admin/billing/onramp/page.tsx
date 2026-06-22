import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { OnrampManager } from "@/components/cms/billing/OnrampManager"

export const dynamic = "force-dynamic"

export default async function OnrampPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("billing.read")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">On-ramp</h1>
      <p className="mb-6 text-sm text-zinc-500">Fiat→crypto purchases via Stripe Crypto On-ramp.</p>
      <BillingBanner live={isLive()} />
      <OnrampManager />
    </div>
  )
}
