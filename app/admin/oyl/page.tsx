import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listFolderAction } from "@/actions/cms/files"
import { FilesManager } from "@/components/cms/files/FilesManager"

export const dynamic = "force-dynamic"

// The OYL Drive: the same document manager as /admin/files, scoped to OYL so the
// OYL corpus (DLA Piper package, Subfrost↔OYL project, reconciliation reports)
// stays walled off from the SUBFROST drive.
export default async function OylDrivePage({
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
  const res = await listFolderAction(folderId, "OYL")

  return (
    <div className="min-w-0">
      <h1 className="mb-2 text-xl font-bold text-white sm:text-2xl">OYL Drive</h1>
      <p className="mb-6 text-sm text-zinc-500">
        OYL corporate &amp; legal corpus — SAFEs, token rights agreements, board consents,
        and reconciliation reports migrated from the OYL Google Drive.
      </p>
      {res.ok ? (
        <FilesManager initial={res.data} canEdit={canEdit} scope="OYL" basePath="/admin/oyl" />
      ) : (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          Could not load files: {res.error}
        </div>
      )}
    </div>
  )
}
