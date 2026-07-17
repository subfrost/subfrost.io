import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { LEGAL_VIEW } from "@/lib/financials/legal/privilege"
import { legalEntitiesAction } from "@/actions/cms/legal"
import { EntitiesRoster } from "@/components/cms/entities/EntitiesRoster"

export const dynamic = "force-dynamic"

export default async function EntitiesPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(LEGAL_VIEW)) redirect("/admin")

  const res = await legalEntitiesAction()
  const entities = res.ok ? res.entities : []

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Entities</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Every counterparty in one place. Open a dossier to see identity, tags, signed documents,
        invoices &amp; payments, FUEL, and on-chain settlement — aggregated across the legal register,
        accounting, files, and community surfaces.
      </p>
      <EntitiesRoster initial={entities} />
    </div>
  )
}
