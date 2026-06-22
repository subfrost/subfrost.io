import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { treasuryOverviewAction } from "@/actions/cms/financials"
import { TreasuryManager } from "@/components/cms/financials/TreasuryManager"

export const dynamic = "force-dynamic"

export default async function TreasuryPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  const initial = await treasuryOverviewAction()

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Treasury</h1>
      <p className="mb-6 text-sm text-zinc-500">
        On-chain holdings of the BSC treasury wallets (BNB + BEP20), valued in USD.
      </p>
      <TreasuryManager initial={initial} />
    </div>
  )
}
