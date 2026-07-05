import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { prisma } from "@/lib/prisma"
import { EcosystemAdmin } from "@/components/cms/ecosystem/EcosystemAdmin"

export const dynamic = "force-dynamic"

export default async function EcosystemAdminPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("ecosystem.view")) redirect("/admin")

  const [projects, settings] = await Promise.all([
    prisma.ecosystemProject.findMany({
      include: { contracts: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.ecosystemSettings.findUnique({ where: { id: 1 } }),
  ])

  return (
    <EcosystemAdmin
      projects={projects.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        contracts: p.contracts.map((c) => ({ id: c.id, label: c.label, alkaneId: c.alkaneId, noteEn: c.noteEn, noteZh: c.noteZh })),
      }))}
      featuredBandEnabled={settings?.featuredBandEnabled ?? true}
      canEdit={me.privileges.includes("ecosystem.edit")}
    />
  )
}
