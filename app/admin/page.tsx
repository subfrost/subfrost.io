import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { DashboardClient } from "@/components/cms/DashboardClient"

export const dynamic = "force-dynamic"

export default async function AdminDashboard() {
  const user = await currentUser()
  // Edge middleware only verifies the JWT signature; full auth happens here.
  if (!user) redirect("/admin/login")

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Dashboard</h1>
      <p className="mb-6 text-sm text-zinc-500">frBTC at a glance and live mainnet network health.</p>
      <DashboardClient />
    </div>
  )
}
