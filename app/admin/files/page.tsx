import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listFolderAction } from "@/actions/cms/files"
import { FilesManager } from "@/components/cms/files/FilesManager"

export const dynamic = "force-dynamic"

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>
}) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("files.read")) redirect("/admin")
  const canEdit = me.privileges.includes("files.edit")

  const { folder } = await searchParams
  const folderId = folder && folder.length ? folder : null
  const res = await listFolderAction(folderId)

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Documents</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Browse, upload, and organize files in the shared document archive.
      </p>
      {res.ok ? (
        <FilesManager initial={res.data} canEdit={canEdit} />
      ) : (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          Could not load files: {res.error}
        </div>
      )}
    </div>
  )
}
