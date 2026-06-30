// app/admin/marketing/x/page.tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listXPostSnapshots } from "@/lib/marketing/x-store"
import { listDailySnapshots } from "@/lib/marketing/snapshot-store"
import { buildProtocolSeries } from "@/lib/marketing/protocol-series"
import { buildXPostTable, buildXPostCurve, buildAttributionRows, type XCurvePoint } from "@/lib/marketing/x-series"
import { XAnalyticsClient } from "@/components/cms/marketing/XAnalyticsClient"

export const dynamic = "force-dynamic"

export default async function XAnalyticsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const [xRows, dailyRows] = await Promise.all([listXPostSnapshots(), listDailySnapshots()])
  const posts = buildXPostTable(xRows)
  const protocolSeries = buildProtocolSeries(dailyRows)
  const attribution = buildAttributionRows(posts, protocolSeries)
  const curves: Record<string, XCurvePoint[]> = Object.fromEntries(
    posts.map((p) => [p.tweetId, buildXPostCurve(xRows, p.tweetId)]),
  )
  const configured = Boolean(process.env.X_BEARER_TOKEN)

  return (
    <XAnalyticsClient
      posts={posts}
      curves={curves}
      attribution={attribution}
      protocolSeries={protocolSeries}
      configured={configured}
    />
  )
}
