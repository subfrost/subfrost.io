import type { MarketingPush } from "@prisma/client"

/** The calendar day a PUBLISHED push sits on: its planned day if any, else the actual publish day. */
export function publishedCalendarDate(
  push: Pick<MarketingPush, "scheduledFor" | "publishedAt">,
): Date | null {
  const d = push.scheduledFor ?? push.publishedAt
  return d ? new Date(d) : null
}
