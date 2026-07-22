// lib/ecosystem/public.ts
import { prisma } from "@/lib/prisma"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"
import { computePeriodLabel } from "@/lib/ecosystem/stat-deltas"

export interface PublicEcosystemProject {
  slug: string
  name: string
  logoUrl: string | null
  bannerUrl: string | null
  category: string
  status: string
  kind: string
  alkaneId: string | null
  showMarketStats: boolean
  url: string
  xUrl: string | null
  docsUrl: string | null
  description: string
  featured: boolean
  inMosaic: boolean
}

/**
 * Default directory order (Gabe): featured first (rendered separately in the featured band,
 * kept here only so it never leaks into the main list), then status maturity, then name A-Z.
 * `sortOrder` is intentionally not consulted: its stored values are ad hoc integers that used
 * to dominate the order and scramble status/alphabetical grouping. The column, admin control,
 * and stored values are untouched — this only stops reading them here.
 */
const STATUS_RANK: Record<string, number> = { Live: 0, Beta: 1, Building: 2 }
const UNKNOWN_STATUS_RANK = Object.keys(STATUS_RANK).length

function statusRank(status: string): number {
  return STATUS_RANK[status] ?? UNKNOWN_STATUS_RANK
}

function compareDirectoryOrder(
  a: { slug: string; featured: boolean; status: string; name: string },
  b: { slug: string; featured: boolean; status: string; name: string }
): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1
  const rankDiff = statusRank(a.status) - statusRank(b.status)
  if (rankDiff !== 0) return rankDiff
  const nameDiff = a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  if (nameDiff !== 0) return nameDiff
  // Tiebreaker on the unique slug: without an explicit `orderBy`, Postgres does not guarantee
  // row order across requests, and Array#sort is only stable relative to the *input* order —
  // so a true tie (same status, same name) must resolve on something fixed, not input order.
  return a.slug.localeCompare(b.slug)
}

export async function getEcosystemDirectory(locale: "en" | "zh"): Promise<{
  projects: PublicEcosystemProject[]
  featuredBandEnabled: boolean
}> {
  const [rows, settings] = await Promise.all([
    prisma.ecosystemProject.findMany({
      where: { published: true },
    }),
    prisma.ecosystemSettings.findUnique({ where: { id: 1 } }),
  ])

  const ordered = [...rows].sort(compareDirectoryOrder)

  const projects = ordered.map((r) => ({
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    bannerUrl: r.bannerUrl,
    category: r.category,
    status: r.status,
    kind: r.kind,
    alkaneId: r.alkaneId,
    showMarketStats: r.showMarketStats,
    url: r.url,
    xUrl: r.xUrl,
    docsUrl: r.docsUrl,
    description: locale === "zh" && r.descriptionZh ? r.descriptionZh : r.descriptionEn,
    featured: r.featured,
    inMosaic: r.inMosaic,
  }))

  return { projects, featuredBandEnabled: settings?.featuredBandEnabled ?? true }
}

export interface PublicEcosystemContract {
  label: string
  alkaneId: string
  note: string
}

export interface PublicEcosystemProfile extends PublicEcosystemProject {
  profile: string
  contracts: PublicEcosystemContract[]
}

export async function getEcosystemProfile(
  slug: string,
  locale: "en" | "zh"
): Promise<PublicEcosystemProfile | null> {
  const r = await prisma.ecosystemProject.findFirst({
    where: { slug, published: true },
    include: { contracts: { orderBy: { sortOrder: "asc" } } },
  })
  if (!r) return null
  return {
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    bannerUrl: r.bannerUrl,
    category: r.category,
    status: r.status,
    kind: r.kind,
    alkaneId: r.alkaneId,
    showMarketStats: r.showMarketStats,
    url: r.url,
    xUrl: r.xUrl,
    docsUrl: r.docsUrl,
    description: locale === "zh" && r.descriptionZh ? r.descriptionZh : r.descriptionEn,
    featured: r.featured,
    inMosaic: r.inMosaic,
    profile: locale === "zh" && r.profileZh ? r.profileZh : r.profileEn,
    contracts: r.contracts.map((c) => ({
      label: c.label,
      alkaneId: c.alkaneId,
      note: locale === "zh" && c.noteZh ? c.noteZh : c.noteEn,
    })),
  }
}

export async function getLatestEcosystemStats(slug: string): Promise<ProjectStats | null> {
  const p = await prisma.ecosystemProject.findFirst({ where: { slug, published: true }, select: { id: true } })
  if (!p) return null
  const snap = await prisma.ecosystemStatSnapshot.findFirst({
    where: { projectId: p.id },
    orderBy: { takenAt: "desc" },
  })
  return snap ? (snap.stats as unknown as ProjectStats) : null
}

const STAT_DELTA_WINDOW_MS = 24 * 60 * 60 * 1000

export interface StatsWithDelta {
  current: ProjectStats
  baseline: ProjectStats | null
  periodLabel: string | null
}

/**
 * Snapshot mais recente + o de ~24h atrás (fallback: o mais antigo disponível), pro
 * indicador de tendência do StatHero. Nunca lança — o hero é decorativo.
 */
export async function getEcosystemStatsWithDelta(slug: string): Promise<StatsWithDelta | null> {
  try {
    const p = await prisma.ecosystemProject.findFirst({ where: { slug, published: true }, select: { id: true } })
    if (!p) return null
    const current = await prisma.ecosystemStatSnapshot.findFirst({
      where: { projectId: p.id },
      orderBy: { takenAt: "desc" },
    })
    if (!current) return null
    const cutoff = new Date(current.takenAt.getTime() - STAT_DELTA_WINDOW_MS)
    let baseline = await prisma.ecosystemStatSnapshot.findFirst({
      where: { projectId: p.id, takenAt: { lte: cutoff } },
      orderBy: { takenAt: "desc" },
    })
    if (!baseline) {
      // Bootstrap (<24h de histórico): compara com o snapshot mais antigo anterior ao current.
      baseline = await prisma.ecosystemStatSnapshot.findFirst({
        where: { projectId: p.id, takenAt: { lt: current.takenAt } },
        orderBy: { takenAt: "asc" },
      })
    }
    return {
      current: current.stats as unknown as ProjectStats,
      baseline: baseline ? (baseline.stats as unknown as ProjectStats) : null,
      periodLabel: computePeriodLabel(current.takenAt, baseline?.takenAt ?? null),
    }
  } catch {
    return null
  }
}
