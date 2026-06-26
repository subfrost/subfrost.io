/**
 * Durable last-known-good store for the home stat set.
 *
 * One row per stat key. /api/prefetch writes only after a successful upstream
 * fetch, and /api/stats reads this store without touching the live cascade.
 */
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function storeSet(key: string, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue
  await prisma.homeStat.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  })
}

export async function storeGetAll(): Promise<Record<string, unknown>> {
  const rows = await prisma.homeStat.findMany()
  const out: Record<string, unknown> = {}
  for (const row of rows) out[row.key] = row.value
  return out
}

export async function storeGetLatestUpdatedAt(): Promise<string | null> {
  const latest = await prisma.homeStat.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  })
  return latest?.updatedAt.toISOString() ?? null
}
