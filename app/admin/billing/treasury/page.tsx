import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { TreasuryManager } from "@/components/cms/billing/TreasuryManager"

export const dynamic = "force-dynamic"

export default async function TreasuryPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  // Treasury is a restricted surface — requires the explicit treasury grant,
  // which the ADMIN role does NOT confer automatically.
  if (!me.privileges.includes("billing.treasury_view")) redirect("/admin")
  const canEdit = me.privileges.includes("billing.edit")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Treasury</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Balances, transactions, and ACH transfer queue. Money movement requires explicit confirmation.
      </p>
      <BillingBanner live={isLive()} />
      <TreasuryManager canEdit={canEdit} />
    </div>
  )
}
