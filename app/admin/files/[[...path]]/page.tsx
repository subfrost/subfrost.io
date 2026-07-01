import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { currentUser } from "@/lib/cms/authz"
import {
  resolvePath, listFolder, listFileLinks, FilesError, filesPath, driveScopeFromSlug, DRIVES,
} from "@/lib/files/manager"
import { FilesManager } from "@/components/cms/files/FilesManager"
import { FileRenderer } from "@/components/cms/files/FileRenderer"

export const dynamic = "force-dynamic"

// Catch-all Files route. Path shape:
//   /admin/files                       → drive chooser (defaults to subfrost)
//   /admin/files/<drive>/<f>/<sub>     → folder explorer
//   /admin/files/<drive>/<f>/<slug>    → single-file renderer (terminal file)
export default async function FilesPage({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("files.read")) redirect("/admin")
  const canEdit = me.privileges.includes("files.edit")
  const canRequestSignatures = me.privileges.includes("documents.write")

  const { path = [] } = await params
  // No drive selected → default to the first drive's root.
  if (path.length === 0) redirect(filesPath(DRIVES[0].slug))

  const [driveSlug, ...segments] = path
  if (!driveScopeFromSlug(driveSlug)) redirect(filesPath(DRIVES[0].slug))

  let resolved
  try {
    resolved = await resolvePath(driveSlug, segments)
  } catch (e) {
    const msg = e instanceof FilesError ? e.message : "Could not resolve path"
    return (
      <div className="min-w-0">
        <h1 className="mb-2 text-xl font-bold text-white sm:text-2xl">Files</h1>
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{msg}</div>
      </div>
    )
  }

  // Slug-linked breadcrumb (drive root → …). Shared by both views.
  const crumbs: { label: string; href: string }[] = [
    { label: driveSlug.toUpperCase(), href: filesPath(driveSlug) },
    ...resolved.folderChain.map((f, i) => ({
      label: f.name,
      href: filesPath(driveSlug, resolved.folderChain.slice(0, i + 1).map((c) => c.slug)),
    })),
  ]

  // Terminal file → renderer.
  if (resolved.file) {
    const links = await listFileLinks(resolved.file.id)
    const backHref = crumbs[crumbs.length - 1].href
    return (
      <div className="min-w-0">
        <Breadcrumbs crumbs={[...crumbs, { label: resolved.file.name, href: "" }]} />
        <FileRenderer
          file={resolved.file}
          canRequestSignatures={canRequestSignatures}
          entityLinks={links.map((l) => ({ id: l.id, role: l.role, entity: { id: l.entity.id, name: l.entity.name } }))}
          backHref={backHref}
        />
      </div>
    )
  }

  // Folder → explorer.
  const listing = await listFolder(resolved.folderId, resolved.scope)
  return (
    <div className="min-w-0">
      <h1 className="mb-2 text-xl font-bold text-white sm:text-2xl">Files</h1>
      <p className="mb-4 text-sm text-zinc-500">
        Browse, upload, and organize files across the SUBFROST and OYL drives.
      </p>
      <FilesManager initial={listing} canEdit={canEdit} driveSlug={driveSlug} />
    </div>
  )
}

function Breadcrumbs({ crumbs }: { crumbs: { label: string; href: string }[] }) {
  return (
    <nav className="mb-4 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1 text-zinc-500">
          {i > 0 && <ChevronRight size={14} className="shrink-0" />}
          {c.href ? (
            <Link href={c.href} className="max-w-[12rem] truncate rounded px-1 py-1.5 text-zinc-300 hover:text-white">{c.label}</Link>
          ) : (
            <span className="max-w-[16rem] truncate px-1 py-1.5 text-white">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
