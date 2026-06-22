import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { OfframpManager } from "@/components/cms/billing/OfframpManager"

export const dynamic = "force-dynamic"

export default async function OfframpPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("BILLING_VIEW")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Offramp</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Crypto→fiat settlements.
      </p>
      <BillingBanner live={isLive()} />
      <OfframpManager />
    </div>
  )
}
