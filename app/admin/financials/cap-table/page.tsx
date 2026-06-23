import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { CapTableManager } from "@/components/cms/financials/CapTableManager"

export const dynamic = "force-dynamic"

export default async function CapTablePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Cap table</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Share classes, shareholders, and issued holdings — the equity ownership record. SAFEs and
        token agreements live on the SAFEs page; their implied dilution is summarized there. This is
        the core 409A cap-table input.
      </p>
      <CapTableManager />
    </div>
  )
}
