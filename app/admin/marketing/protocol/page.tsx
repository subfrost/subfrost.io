import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listDailySnapshots } from "@/lib/marketing/snapshot-store"
import { buildProtocolSeries, kpiDelta } from "@/lib/marketing/protocol-series"
import { ProtocolAnalyticsClient } from "@/components/cms/marketing/ProtocolAnalyticsClient"

export const dynamic = "force-dynamic"

export default async function ProtocolAnalyticsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const rows = await listDailySnapshots()
  const series = buildProtocolSeries(rows)
  const deltas = {
    dieselHolders: kpiDelta(rows, "tokens.diesel.holders", 7),
    dieselPrice: kpiDelta(rows, "tokens.diesel.priceUsd", 7),
    btcLocked: kpiDelta(rows, "protocol.totalBtcLocked", 7),
  }
  return <ProtocolAnalyticsClient series={series} deltas={deltas} />
}
