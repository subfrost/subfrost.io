/**
 * Durable last-known-good store for the home stat set (Postgres `HomeStat`).
 * One row per stat key. `storeSet` is called by the warmer only after a
 * successful fetch, so a failed upstream leaves the prior value intact.
 * `storeGetAll` is read at SSR + /api/stats — one query, never the live cascade.
 */
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

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
