import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { accountingOverviewAction } from "@/actions/cms/accounting"
import { AccountingManager } from "@/components/cms/financials/AccountingManager"

export const dynamic = "force-dynamic"

export default async function AccountingPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  const initial = await accountingOverviewAction()

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Accounting</h1>
      <p className="mb-6 text-sm text-zinc-500">
        DIESEL payments reconciled to invoices and payees — the ledger for the 409A.
      </p>
      <AccountingManager initial={initial} />
    </div>
  )
}
