import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { BalanceSheetManager } from "@/components/cms/financials/BalanceSheetManager"

export const dynamic = "force-dynamic"

export default async function BalanceSheetPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Balance sheet</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Computed lines (treasury holdings, open-invoice receivables, outstanding SAFEs, common stock
        at par) are pulled live from the rest of Financials. Add manual line items — bank cash,
        accrued expenses, additional paid-in capital — to complete the statement and reconcile.
      </p>
      <BalanceSheetManager />
    </div>
  )
}
