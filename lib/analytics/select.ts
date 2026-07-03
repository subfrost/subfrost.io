import type { AnalyticsSource } from "@/lib/analytics/source"
import { esSource } from "@/lib/analytics/es"
import { ga4Source } from "@/lib/analytics/ga4"

/** First-party ES by default; GA4 retained as an env-selectable fallback for
 *  rollback/comparison during the cutover (ANALYTICS_SOURCE=ga4). */
export function getAnalyticsSource(): AnalyticsSource {
  return process.env.ANALYTICS_SOURCE === "ga4" ? ga4Source : esSource
}
