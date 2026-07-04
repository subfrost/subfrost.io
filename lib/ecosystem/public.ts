// lib/ecosystem/public.ts
import { prisma } from "@/lib/prisma"

export interface PublicEcosystemProject {
  slug: string
  name: string
  logoUrl: string | null
  category: string
  status: string
  kind: string
  alkaneId: string | null
  url: string
  xUrl: string | null
  docsUrl: string | null
  description: string
  featured: boolean
}

export async function getEcosystemDirectory(locale: "en" | "zh"): Promise<{
  projects: PublicEcosystemProject[]
  featuredBandEnabled: boolean
}> {
  const [rows, settings] = await Promise.all([
    prisma.ecosystemProject.findMany({
      where: { published: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.ecosystemSettings.findUnique({ where: { id: 1 } }),
  ])

  const projects = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    category: r.category,
    status: r.status,
    kind: r.kind,
    alkaneId: r.alkaneId,
    url: r.url,
    xUrl: r.xUrl,
    docsUrl: r.docsUrl,
    description: locale === "zh" && r.descriptionZh ? r.descriptionZh : r.descriptionEn,
    featured: r.featured,
  }))

  return { projects, featuredBandEnabled: settings?.featuredBandEnabled ?? true }
}
