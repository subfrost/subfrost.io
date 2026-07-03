import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { opReturnMeta } from "@/lib/marketing/opreturn-store"
import { StatCardStudio } from "@/components/cms/marketing/StatCardStudio"

export const dynamic = "force-dynamic"

export default async function StatCardsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")
  const meta = await opReturnMeta()
  return <StatCardStudio meta={meta} />
}
