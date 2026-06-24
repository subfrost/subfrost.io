import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { listSnapshots } from "@/lib/marketing/snapshot-store"
import { SnapshotsClient } from "@/components/cms/marketing/SnapshotsClient"

export const dynamic = "force-dynamic"

export default async function MarketingSnapshotsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const [snapshots, articles] = await Promise.all([
    listSnapshots(),
    prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: { id: true, translations: { select: { title: true }, take: 1 } },
    }),
  ])

  const articleOptions = articles.map((a) => ({ id: a.id, title: a.translations[0]?.title ?? a.id }))
  return <SnapshotsClient snapshots={snapshots} articles={articleOptions} />
}
