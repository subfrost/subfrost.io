// lib/marketing/x-store.ts
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { extractTweetId } from "@/lib/marketing/x-client"
import type { XPostSnapshotPayload, XPostMetrics } from "@/lib/marketing/x-types"
import type { XPostSnapshotRow } from "@/lib/marketing/x-series"

export type { XPostSnapshotRow }

type DbRow = { id: string; createdAt: Date; refUrl: string | null; payload: unknown }
const map = (r: DbRow): XPostSnapshotRow => ({ id: r.id, createdAt: r.createdAt, refUrl: r.refUrl, payload: r.payload as XPostSnapshotPayload })

export async function createXPostSnapshot(payload: XPostSnapshotPayload): Promise<XPostSnapshotRow> {
  const r = (await prisma.marketingSnapshot.create({
    data: {
      label: `X @subfrost_news ${payload.tweetId} ${payload.capturedAt.slice(0, 10)}`,
      context: "X_POST",
      refUrl: payload.url,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  })) as DbRow
  return map(r)
}

export async function xPostSnapshotExistsOn(url: string, day: Date): Promise<boolean> {
  const gte = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000)
  const row = await prisma.marketingSnapshot.findFirst({
    where: { context: "X_POST", refUrl: url, createdAt: { gte, lt } },
    select: { id: true },
  })
  return row !== null
}

export async function listXPostSnapshots(): Promise<XPostSnapshotRow[]> {
  const rows = (await prisma.marketingSnapshot.findMany({
    where: { context: "X_POST" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, refUrl: true, payload: true },
  })) as DbRow[]
  return rows.map(map)
}

export async function updateMatchedPushMetrics(latestByTweetId: Map<string, XPostMetrics>): Promise<number> {
  const pushes = (await prisma.marketingPush.findMany({
    where: { channel: "X", refUrl: { not: null } },
    select: { id: true, refUrl: true },
  })) as { id: string; refUrl: string | null }[]
  let updated = 0
  for (const p of pushes) {
    const tid = extractTweetId(p.refUrl)
    if (!tid) continue
    const m = latestByTweetId.get(tid)
    if (!m) continue
    await prisma.marketingPush.update({
      where: { id: p.id },
      data: { metrics: { impressions: m.impressions, likes: m.likes, reposts: m.reposts, clicks: null } as unknown as Prisma.InputJsonValue },
    })
    updated++
  }
  return updated
}
