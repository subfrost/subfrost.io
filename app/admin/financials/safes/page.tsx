import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { SafesTabs } from "@/components/cms/financials/SafesTabs"

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
        warrants, SAFTs, side letters. The <strong>Deserter SAFEs</strong> tab covers OYL insiders
        whose vesting allocations swap into the SUBFROST equity deal (requires Legal access).
      </p>
      <SafesTabs />
    </div>
  )
}
