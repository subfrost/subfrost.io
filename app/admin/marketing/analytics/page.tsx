import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { ga4Source } from "@/lib/analytics/ga4"
import { parseRange } from "@/lib/analytics/range"
import { AnalyticsClient } from "@/components/cms/marketing/AnalyticsClient"

export const dynamic = "force-dynamic"

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const { range: rangeParam } = await searchParams
  const range = parseRange(rangeParam)
  const dashboard = await ga4Source.getDashboard(range)
  return <AnalyticsClient dashboard={dashboard} />
}
