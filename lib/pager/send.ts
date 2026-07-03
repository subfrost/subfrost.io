// Page dispatch + acknowledgment + repeat-until-ack.
//
// Urgent pages fan out to each member's PERSONAL topic (not page-all) so every
// notification carries that member's own ACK button. The repeat endpoint
// (k8s CronJob, every minute) re-sends to anyone who hasn't acked, which is
// what makes iOS effectively insistent — Apple won't loop one notification,
// but it will ding for each fresh one.

import prisma from "@/lib/prisma"
import { topicFor } from "@/lib/pager/config"
import { publishPage } from "@/lib/pager/ntfy"

const BASE_URL = process.env.CMS_BASE_URL ?? "https://subfrost.io"

// Repeat policy: re-send every ≥75s, max 8 repeats, give up after 15 min.
const REPEAT_MIN_INTERVAL_MS = 75_000
const REPEAT_MAX_COUNT = 8
const REPEAT_WINDOW_MS = 15 * 60_000

export async function sendPage(opts: {
  memberIds: string[]
  message: string
  urgent: boolean
  sentBy: string
}): Promise<{ pageId: string }> {
  const page = await prisma.pagerPage.create({
    data: {
      message: opts.message,
      urgent: opts.urgent,
      sentBy: opts.sentBy,
      targets: { create: opts.memberIds.map((memberId) => ({ memberId })) },
    },
    include: { targets: true },
  })

  const results = await Promise.allSettled(
    page.targets.map((t) =>
      publishPage({
        topic: topicFor(t.memberId),
        message: opts.message,
        title: `PAGE from ${opts.sentBy}`,
        urgent: opts.urgent,
        ackUrl: opts.urgent ? `${BASE_URL}/api/pager/ack/${t.ackToken}` : undefined,
      }),
    ),
  )
  const failed = results.filter((r) => r.status === "rejected")
  if (failed.length === results.length) {
    throw new Error(`all ${failed.length} publishes failed: ${(failed[0] as PromiseRejectedResult).reason}`)
  }
  return { pageId: page.id }
}

/** Mark a target acked. Returns the target (with page) or null if the token
 *  is unknown. Idempotent — repeat taps keep the first ack time. */
export async function acknowledge(ackToken: string) {
  const target = await prisma.pagerTarget.findUnique({ where: { ackToken }, include: { page: true } })
  if (!target) return null
  if (!target.ackedAt) {
    await prisma.pagerTarget.update({ where: { id: target.id }, data: { ackedAt: new Date() } })
  }
  return target
}

/** Re-send unacked urgent pages within the repeat window. Returns counts. */
export async function repeatUnacked(): Promise<{ resent: number; expired: number }> {
  const now = Date.now()
  const due = await prisma.pagerTarget.findMany({
    where: {
      ackedAt: null,
      repeatCount: { lt: REPEAT_MAX_COUNT },
      lastSentAt: { lt: new Date(now - REPEAT_MIN_INTERVAL_MS) },
      page: { urgent: true, createdAt: { gt: new Date(now - REPEAT_WINDOW_MS) } },
    },
    include: { page: true },
    take: 200,
  })
  let resent = 0
  for (const t of due) {
    try {
      await publishPage({
        topic: topicFor(t.memberId),
        message: t.page.message,
        title: `PAGE from ${t.page.sentBy} (repeat ${t.repeatCount + 1} — tap ACK to stop)`,
        urgent: true,
        ackUrl: `${BASE_URL}/api/pager/ack/${t.ackToken}`,
      })
      await prisma.pagerTarget.update({
        where: { id: t.id },
        data: { repeatCount: t.repeatCount + 1, lastSentAt: new Date() },
      })
      resent++
    } catch {
      /* ntfy hiccup — next cron tick retries */
    }
  }
  return { resent, expired: due.length - resent }
}
