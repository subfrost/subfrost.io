import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { revenueOverviewAction } from "@/actions/cms/revenue"
import { RevenueClient } from "@/components/cms/financials/RevenueClient"

export const dynamic = "force-dynamic"

export default async function RevenuePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  const initial = await revenueOverviewAction()

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Revenue</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Protocol revenue over 1d / 7d / 30d / YTD from the two ways SUBFROST earns —
        BTC wrap/unwrap fees and Stripe charges.
      </p>
      {initial.ok ? (
        <RevenueClient overview={initial.overview} />
      ) : (
        <div className="rounded-xl border border-zinc-800 p-6 text-sm text-zinc-400">
          You do not have access to financials.
        </div>
      )}
    </div>
  )
}
