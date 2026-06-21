import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { isLive } from "@/lib/stripe/config"
import { BillingBanner } from "@/components/cms/billing/BillingBanner"
import { TreasuryManager } from "@/components/cms/billing/TreasuryManager"

export const dynamic = "force-dynamic"

export default async function TreasuryPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("MANAGE_BILLING")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Treasury</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Balances, transactions, and ACH transfer queue. Money movement requires explicit confirmation.
      </p>
      <BillingBanner live={isLive()} />
      <TreasuryManager />
    </div>
  )
}
