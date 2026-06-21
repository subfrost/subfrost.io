import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FuelManager } from "@/components/cms/FuelManager"

export const dynamic = "force-dynamic"

export default async function FuelPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("MANAGE_FUEL")) redirect("/admin")

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">FUEL allocations</h1>
      <FuelManager />
    </div>
  )
}
