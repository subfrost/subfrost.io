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
      <div className="mb-8 sm:mb-12">
        <p className="mb-3 text-[13px] font-medium text-[color:var(--ed-muted)] sm:mb-4 sm:text-[15px]">Admin</p>
        <h1 className="text-[40px] font-normal leading-[0.98] text-[color:var(--ed-ink)] sm:text-[76px]">Dashboard</h1>
        <p className="mt-4 max-w-[620px] text-[16px] leading-[1.5] text-[color:var(--ed-body)] sm:mt-6 sm:text-[19px]">
          frBTC issuance, mainnet reserve health, and operational status at a glance.
        </p>
      </div>
      <DashboardClient />
    </div>
  )
}
