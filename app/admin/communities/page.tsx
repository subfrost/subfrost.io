import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { loadCommunityData, toOverview } from "@/lib/community/aggregate"
import { CommunitiesManager } from "@/components/cms/CommunitiesManager"

export const dynamic = "force-dynamic"

export default async function CommunitiesPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("referral.read")) redirect("/admin")

  const canSeeFuel = me.privileges.includes("fuel.read")
  const overview = toOverview(await loadCommunityData(canSeeFuel))

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Communities</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Referral communities ordered by FUEL — each leader, the codes they were provisioned, who
        claimed them, and the FUEL allocated to every member. Expand a community for the full breakdown.
      </p>
      <CommunitiesManager overview={overview} canSeeFuel={canSeeFuel} />
    </div>
  )
}
