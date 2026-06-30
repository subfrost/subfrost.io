import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { ga4Source } from "@/lib/analytics/ga4"
import { parseRange } from "@/lib/analytics/range"
import { listPushes, listRecurringRules, listArticleOptions } from "@/lib/cms/marketing-pushes"
import { ScheduleClient } from "@/components/cms/marketing/ScheduleClient"

export const dynamic = "force-dynamic"

export default async function SchedulePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const [pushes, rules, articleOptions, dashboard] = await Promise.all([
    listPushes(),
    listRecurringRules(),
    listArticleOptions(),
    ga4Source.getDashboard(parseRange("90d")),
  ])

  return <ScheduleClient pushes={pushes} rules={rules} articleOptions={articleOptions} articleEngagement={dashboard.articleEngagement} />
}
