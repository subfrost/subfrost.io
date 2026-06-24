import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { DashboardClient } from "@/components/cms/DashboardClient"

export const dynamic = "force-dynamic"

export default async function AdminDashboard() {
  const user = await currentUser()
  // Edge middleware only verifies the JWT signature; full auth happens here.
  if (!user) redirect("/admin/login")

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="mb-10">
        <p className="mb-3 text-[15px] font-medium text-[#5f7690]">Admin</p>
        <h1 className="text-[52px] font-normal leading-none tracking-[-0.02em] text-[#07111f]">Dashboard</h1>
        <p className="mt-5 max-w-[560px] text-[18px] leading-[1.5] text-[#455a72]">
          frBTC issuance, mainnet reserve health, and operational status at a glance.
        </p>
      </div>
      <DashboardClient />
    </div>
  )
}
