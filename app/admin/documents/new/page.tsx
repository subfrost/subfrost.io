import Link from "next/link"
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { getFile, listFileLinks, FilesError } from "@/lib/files/manager"
import { NewFromFileForm } from "@/components/cms/documents/NewFromFileForm"
import type { RecipientInput } from "@/lib/esign/types"

export const dynamic = "force-dynamic"

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ fromFile?: string }>
}) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("documents.write")) redirect("/admin")

  const { fromFile } = await searchParams
  const payees = await prisma.payee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })

  if (!fromFile) {
    return (
      <div className="space-y-3">
        <Link href="/admin/documents" className="text-xs text-zinc-500 hover:text-zinc-300">← Documents</Link>
        <h1 className="text-2xl font-bold text-white">New envelope</h1>
        <p className="text-sm text-zinc-500">
          Start a new envelope from the Documents dashboard, or use the &ldquo;Request
          signatures&rdquo; action on a file to prefill it with that PDF.
        </p>
      </div>
    )
  }

  // Resolve the source file (read-only use of lib/files). A missing/deleted
  // file falls back to a friendly message rather than a 404.
  let file: Awaited<ReturnType<typeof getFile>>["file"] | null = null
  try {
    file = (await getFile(fromFile)).file
  } catch (e) {
    if (!(e instanceof FilesError)) throw e
  }
  if (!file) {
    return (
      <div className="space-y-3">
        <Link href="/admin/documents" className="text-xs text-zinc-500 hover:text-zinc-300">← Documents</Link>
        <h1 className="text-2xl font-bold text-white">Request signatures</h1>
        <p className="text-sm text-red-300">That file could not be found — it may have been deleted or moved.</p>
      </div>
    )
  }

  // Prefill recipients + entityId from the file's signatory/counterparty links.
  const links = await listFileLinks(fromFile)
  const signing = links.filter((l) => l.role === "SIGNATORY" || l.role === "COUNTERPARTY")
  const entityId = signing[0]?.entity.id ?? null
  const entityName = signing[0]?.entity.name ?? null
  const entityEmails =
    signing.length > 0
      ? await prisma.legalEntity.findMany({
          where: { id: { in: signing.map((l) => l.entity.id) } },
          select: { id: true, name: true, email: true },
        })
      : []
  const emailById = new Map(entityEmails.map((e) => [e.id, e.email]))
  const initialRecipients: RecipientInput[] = signing
    .map((l) => ({
      name: l.entity.name,
      email: emailById.get(l.entity.id) ?? "",
      role: "signer" as const,
    }))
    .filter((r) => r.email)

  return (
    <NewFromFileForm
      fileId={file.id}
      fileName={file.name}
      entityId={entityId}
      entityName={entityName}
      initialRecipients={initialRecipients}
      payees={payees}
    />
  )
}
