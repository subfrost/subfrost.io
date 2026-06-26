import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { hasLegalAndFinancials } from "@/lib/financials/legal/privilege"
import { reconciliationAction } from "@/actions/cms/legal"
import { ReconciliationManager } from "@/components/cms/financials/ReconciliationManager"

export const dynamic = "force-dynamic"

export default async function ReconciliationPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  // The one surface gated on BOTH ladders: a legal tier AND a financials tier.
  if (!hasLegalAndFinancials(me)) redirect("/admin")

  const res = await reconciliationAction()
  const data = res.ok ? res : { invoices: [], payments: [] }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Invoice ↔ on-chain reconciliation</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Every invoice matched to the actual on-chain DIESEL payment that settled it. This view requires
        both a <strong>Legal</strong> tier and a <strong>Financials</strong> tier — neither alone unlocks it.
      </p>
      <ReconciliationManager invoices={data.invoices} payments={data.payments} />
    </div>
  )
}
