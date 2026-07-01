import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { envelopes, esign, listSignatureEvents, signingProxyUrl } from "@/lib/esign/store"
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

  // Version chain (all envelopes sharing this agreementKey) + forensic events.
  const [versions, events] = await Promise.all([
    esign.listVersions(env.agreementKey ?? env.id),
    listSignatureEvents(env.id),
  ])

  // Wrapped forensic signing links per recipient (records JA3/JA4/IP on click,
  // then redirects to Documenso). Only present once a signingUrl exists.
  const signLinks: Record<string, string> = {}
  for (const r of env.recipients) {
    if (r.signingUrl) signLinks[r.email] = signingProxyUrl(env.id, r.email)
  }

  return (
    <DocumentDetail
      env={env}
      canEdit={canEdit}
      payees={payeeRows}
      linkedPayee={linkedPayee}
      versions={versions}
      events={events}
      signLinks={signLinks}
    />
  )
}
