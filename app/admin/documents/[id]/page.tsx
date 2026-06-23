import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { envelopes } from "@/lib/esign/store"
import { DocumentDetail } from "@/components/cms/documents/DocumentDetail"

export const dynamic = "force-dynamic"

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("documents.read")) redirect("/admin")
  const canEdit = me.privileges.includes("documents.write")

  const { id } = await params
  const env = await envelopes.get(id)
  if (!env) notFound()

  const payeeRows = await prisma.payee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
  const linkedPayee = env.payeeId
    ? await prisma.payee.findUnique({ where: { id: env.payeeId }, select: { id: true, name: true } })
    : null

  return <DocumentDetail env={env} canEdit={canEdit} payees={payeeRows} linkedPayee={linkedPayee} />
}
