import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { CodesManager } from "@/components/cms/CodesManager"

export const dynamic = "force-dynamic"

export default async function CodesPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("MANAGE_REFERRAL_CODES")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Referral codes</h1>
      <CodesManager />
    </div>
  )
}
