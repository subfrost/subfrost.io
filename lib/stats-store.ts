/**
 * Durable last-known-good store for the home stat set (Postgres `HomeStat`).
 * One row per stat key. `storeSet` is called by the warmer only after a
 * successful fetch, so a failed upstream leaves the prior value intact.
 * `storeGetAll` is read at SSR + /api/stats — one query, never the live cascade.
 */
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type HomeStatDelegate = {
  upsert: (args: {
    where: { key: string }
    create: { key: string; value: Prisma.InputJsonValue }
    update: { value: Prisma.InputJsonValue }
  }) => Promise<unknown>
  findMany: () => Promise<Array<{ key: string; value: unknown }>>
}

let warnedMissingHomeStat = false

function getHomeStatDelegate(): HomeStatDelegate | null {
  const delegate = (prisma as unknown as { homeStat?: HomeStatDelegate }).homeStat
  if (!delegate && !warnedMissingHomeStat) {
    warnedMissingHomeStat = true
    console.warn('[stats-store] Prisma client has no homeStat delegate; using empty stats fallback.')
  }
  return delegate ?? null
}

function isMissingTableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /does not exist|relation .* does not exist|table .* does not exist/i.test(err.message)
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  const homeStat = getHomeStatDelegate()
  if (!homeStat) return
  const json = value as Prisma.InputJsonValue
  try {
    await homeStat.upsert({
      where: { key },
      create: { key, value: json },
      update: { value: json },
    })
  } catch (err) {
    if (!isMissingTableError(err)) throw err
  }
}

export async function storeGetAll(): Promise<Record<string, unknown>> {
  const homeStat = getHomeStatDelegate()
  if (!homeStat) return {}
  let rows: Array<{ key: string; value: unknown }> = []
  try {
    rows = await homeStat.findMany()
  } catch (err) {
    if (!isMissingTableError(err)) throw err
  }
  const out: Record<string, unknown> = {}
  for (const row of rows) out[row.key] = row.value
  return out
}
