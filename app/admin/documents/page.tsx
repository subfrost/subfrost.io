import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { DocumentsManager } from "@/components/cms/documents/DocumentsManager"

export const dynamic = "force-dynamic"

export default async function DocumentsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("documents.read")) redirect("/admin")
  const canEdit = me.privileges.includes("documents.write")

  const payeeRows = await prisma.payee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Documents</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Send legal paperwork for signature (officer consents, AML program docs, engagement letters,
        SAFEs, invoices) and track signing status. Completed documents can be attached to a payee so
        they surface on that payee&apos;s profile.
      </p>
      <DocumentsManager canEdit={canEdit} payees={payeeRows} />
    </div>
  )
}
