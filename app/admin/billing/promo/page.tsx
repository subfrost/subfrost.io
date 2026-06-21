import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { PromoManager } from "@/components/cms/billing/PromoManager"

export const dynamic = "force-dynamic"

export default async function PromoPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("MANAGE_BILLING")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Promo codes</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Coupons and promotion codes.
      </p>
      <BillingBanner live={isLive()} />
      <PromoManager />
    </div>
  )
}
