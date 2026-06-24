import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { getSnapshot, listSnapshots } from "@/lib/marketing/snapshot-store"
import { SnapshotDetail } from "@/components/cms/marketing/SnapshotDetail"

export const dynamic = "force-dynamic"

export default async function SnapshotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const { id } = await params
  const [snapshot, all] = await Promise.all([getSnapshot(id), listSnapshots()])
  if (!snapshot) notFound()

  const others = all.filter((s) => s.id !== id)
  return <SnapshotDetail snapshot={snapshot} others={others} />
}
