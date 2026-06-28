import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { LEGAL_VIEW, LEGAL_EDIT } from "@/lib/financials/legal/privilege"
import { legalEntitiesAction, legalLinkablesAction } from "@/actions/cms/legal"
import { LegalEntitiesManager } from "@/components/cms/legal/LegalEntitiesManager"

export const dynamic = "force-dynamic"

export default async function LegalPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(LEGAL_VIEW)) redirect("/admin")

  const [res, linkRes] = await Promise.all([legalEntitiesAction(), legalLinkablesAction()])
  const entities = res.ok ? res.entities : []
  const linkables = linkRes.ok ? linkRes : { users: [], shareholders: [], payees: [] }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Legal — entities &amp; agreements</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Every entity we hold a legal relationship with, across both the OYL deserter scope and our own
        SUBFROST legal — funded investors, deserters, counterparties (Halborn, SPRF, &hellip;), and our
        employees. Open a profile to see agreements, deserter equity → DIESEL swaps, and OYL obligations.
      </p>
      <LegalEntitiesManager
        initial={entities}
        canEdit={me.privileges.includes(LEGAL_EDIT)}
        users={linkables.users}
        shareholders={linkables.shareholders}
        payees={linkables.payees}
      />
    </div>
  )
}
