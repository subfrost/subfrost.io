import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { SafesManager } from "@/components/cms/financials/SafesManager"

export const dynamic = "force-dynamic"

export default async function SafesPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">SAFEs &amp; token agreements</h1>
      <p className="mb-6 text-sm text-zinc-500">
        The register of every convertible / investment instrument — SAFEs, convertible notes, token
        warrants, SAFTs, side letters. Attach the signed contract (upload a PDF or link an e-sign
        document) and link the investor to a cap-table shareholder. Feeds the cap table and the
        balance sheet, and is a primary 409A input.
      </p>
      <SafesManager />
    </div>
  )
}
