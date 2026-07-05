// lib/ecosystem/stats-sync.ts
/**
 * Hourly stats collector for ecosystem profiles. For every published project
 * with at least one alkane id (or a custom adapter): generic per-contract
 * stats via the canon get-alkane-details endpoint, custom stats via the
 * project's adapter, persisted as ONE EcosystemStatSnapshot row. Per-project
 * failures are logged and skipped — one bad project never sinks the batch.
 */
import { prisma } from "@/lib/prisma"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { simulateView } from "@/lib/ecosystem/simulate"
import { ECOSYSTEM_ADAPTERS } from "@/lib/ecosystem/adapters"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

const KEEP_DAYS = 90
const CONCURRENCY = 3

export async function syncEcosystemStats(
  fetchImpl: typeof fetch = fetch,
): Promise<{ projects: number; snapshots: number }> {
  const projects = await prisma.ecosystemProject.findMany({
    where: { published: true },
    include: { contracts: { orderBy: { sortOrder: "asc" } } },
  })

  let snapshots = 0
  for (const p of projects) {
    const ids = [...new Set([p.alkaneId, ...p.contracts.map((c) => c.alkaneId)].filter((x): x is string => !!x))]
    const adapter = ECOSYSTEM_ADAPTERS[p.slug]
    if (ids.length === 0 && !adapter) continue
    try {
      const generic: ProjectStats["generic"] = {}
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const blocks = await Promise.all(ids.slice(i, i + CONCURRENCY).map((id) => getAlkaneDetails(id, fetchImpl)))
        for (const b of blocks) {
          generic[b.id] = {
            name: b.name, symbol: b.symbol, holders: b.holders, supply: b.supply,
            priceUsd: b.priceUsd, marketcapUsd: b.marketcapUsd, volume24hUsd: b.volume24hUsd,
          }
        }
      }
      const custom = adapter ? await adapter((t, i2) => simulateView(t, i2, fetchImpl)) : []
      const stats: ProjectStats = { generic, custom }
      await prisma.ecosystemStatSnapshot.create({
        data: { projectId: p.id, stats: stats as unknown as object },
      })
      await prisma.ecosystemStatSnapshot.deleteMany({
        where: { projectId: p.id, takenAt: { lt: new Date(Date.now() - KEEP_DAYS * 24 * 3600 * 1000) } },
      })
      snapshots++
    } catch (e) {
      console.error(`[ecosystem-stats] ${p.slug} failed`, e)
    }
  }
  return { projects: projects.length, snapshots }
}
