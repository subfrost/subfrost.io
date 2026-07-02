"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronRight, Download, File as FileIcon, FileText, Film, Folder, FolderPlus,
  Image as ImageIcon, Info, Loader2, Music, Pencil, Search, Trash2, Upload, FolderInput, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createFolderAction, deleteFileAction, deleteFolderAction, finalizeUploadAction,
  getFileUrlAction, prepareUploadAction, updateFileAction, updateFolderAction,
} from "@/actions/cms/files"
import type { FileView, FolderView } from "@/lib/files/manager"
import { filesPath } from "@/lib/files/paths"
import type { LegalScope } from "@prisma/client"
import { humanSize, previewKind, relTime, typeLabel } from "./util"
import { DetailsPanel } from "./DetailsPanel"
import { DocTypeBadge } from "./DocTypeBadge"
import { DOC_TYPE_LABEL } from "@/lib/files/doc-types"
import { FolderPicker } from "./FolderPicker"

type View = {
  folderId: string | null
  scope?: LegalScope
  breadcrumb: FolderView[]
  folders: FolderView[]
  files: FileView[]
}

type UploadJob = { id: string; name: string; status: "uploading" | "error"; error?: string }

function fileIcon(mime: string, name: string) {
  switch (previewKind(mime, name)) {
    case "image": return <ImageIcon size={18} className="text-sky-400" />
    case "video": return <Film size={18} className="text-purple-400" />
    case "audio": return <Music size={18} className="text-pink-400" />
    case "pdf": return <FileText size={18} className="text-red-400" />
    case "text": return <FileText size={18} className="text-emerald-400" />
    default: return <FileIcon size={18} className="text-zinc-400" />
  }
}

export function FilesManager({
  initial, canEdit, driveSlug,
}: {
  initial: View; canEdit: boolean; driveSlug: string
}) {
  const view = initial
  const scope: LegalScope = view.scope ?? "SUBFROST"
  const router = useRouter()
  const [navPending, startNav] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // modals / panels
  const [details, setDetails] = useState<FileView | null>(null)
  const [renaming, setRenaming] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null)
  const [moving, setMoving] = useState<{ kind: "file" | "folder"; id: string; name: string; currentParent: string | null } | null>(null)
  const [newFolder, setNewFolder] = useState(false)

  // uploads
  const [uploads, setUploads] = useState<UploadJob[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // classification filter (category + free text over name/summary/tags), applied to this folder's files
  const [catFilter, setCatFilter] = useState<string>("")
  const [query, setQuery] = useState<string>("")

  // Slug chain to the folder currently in view (empty at a drive root).
  const crumbSlugs = view.breadcrumb.map((c) => c.slug)
  const refresh = useCallback(() => router.refresh(), [router])

  const goRoot = () => { setError(null); startNav(() => router.push(filesPath(driveSlug))) }
  const goCrumb = (i: number) => {
    setError(null)
    startNav(() => router.push(filesPath(driveSlug, view.breadcrumb.slice(0, i + 1).map((c) => c.slug))))
  }
  const goFolder = (f: FolderView) => {
    setError(null)
    startNav(() => router.push(filesPath(driveSlug, [...crumbSlugs, f.slug])))
  }
  const goFile = (f: FileView) => {
    setError(null)
    startNav(() => router.push(filesPath(driveSlug, [...crumbSlugs, f.slug])))
  }

  // --- uploads -------------------------------------------------------------
  const uploadOne = useCallback(async (file: File) => {
    const job: UploadJob = { id: `${file.name}-${Date.now()}-${Math.random()}`, name: file.name, status: "uploading" }
    setUploads((u) => [...u, job])
    const finish = (patch: Partial<UploadJob>) =>
      setUploads((u) => u.map((j) => (j.id === job.id ? { ...j, ...patch } : j)))
    const remove = () => setTimeout(() => setUploads((u) => u.filter((j) => j.id !== job.id)), 1200)
    try {
      const mimeType = file.type || "application/octet-stream"
      const prep = await prepareUploadAction({ name: file.name, folderId: view.folderId, mimeType })
      if (!prep.ok) { finish({ status: "error", error: prep.error }); return }
      const put = await fetch(prep.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file })
      if (!put.ok) { finish({ status: "error", error: `Upload failed (${put.status})` }); return }
      const fin = await finalizeUploadAction(prep.file.id)
      if (!fin.ok) { finish({ status: "error", error: fin.error }); return }
      remove()
    } catch (e) {
      finish({ status: "error", error: e instanceof Error ? e.message : "Upload failed" })
    }
  }, [view.folderId])

  const uploadMany = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setError(null)
    await Promise.all(list.map(uploadOne))
    refresh()
  }, [uploadOne, refresh])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (!canEdit) return
    if (e.dataTransfer.files?.length) void uploadMany(e.dataTransfer.files)
  }

  // --- item actions --------------------------------------------------------
  const doDeleteFile = (f: FileView) => {
    if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return
    startNav(async () => {
      const r = await deleteFileAction(f.id)
      if (!r.ok) setError(r.error)
      else { if (details?.id === f.id) setDetails(null); setNotice(`Deleted ${f.name}`); refresh() }
    })
  }
  const doDeleteFolder = (f: FolderView) => {
    if (!confirm(`Delete folder "${f.name}" and all its contents? This cannot be undone.`)) return
    startNav(async () => {
      const r = await deleteFolderAction(f.id)
      if (!r.ok) setError(r.error)
      else { setNotice(`Deleted folder ${f.name}`); refresh() }
    })
  }

  // Document-types actually present in this folder, for the filter dropdown.
  const typesPresent = Array.from(new Set(view.files.map((f) => f.docType).filter(Boolean) as string[]))
    .sort((a, b) => (DOC_TYPE_LABEL[a] ?? a).localeCompare(DOC_TYPE_LABEL[b] ?? b))
  const q = query.trim().toLowerCase()
  const shownFiles = view.files.filter((f) => {
    if (catFilter && f.docType !== catFilter) return false
    if (q) {
      const summary = typeof (f.metadata?.classification as { summary?: string } | undefined)?.summary === "string"
        ? ((f.metadata!.classification as { summary?: string }).summary as string) : ""
      const hay = [f.name, summary, ...(f.tags || []), f.docType ?? ""].join(" ").toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const filterActive = !!catFilter || !!q

  const isEmpty = view.folders.length === 0 && view.files.length === 0
  const busy = navPending

  return (
    <div className="space-y-4">
      {/* Breadcrumb + toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
          <button className="rounded px-1 py-1.5 text-zinc-300 hover:text-white disabled:opacity-50" disabled={busy} onClick={goRoot}>{driveSlug.toUpperCase()}</button>
          {view.breadcrumb.map((c, i) => (
            <span key={c.id} className="flex min-w-0 items-center gap-1 text-zinc-500">
              <ChevronRight size={14} className="shrink-0" />
              <button
                className={`max-w-[12rem] truncate rounded px-1 py-1.5 hover:text-white disabled:opacity-50 ${i === view.breadcrumb.length - 1 ? "text-white" : "text-zinc-300"}`}
                disabled={busy}
                onClick={() => goCrumb(i)}
              >
                {c.name}
              </button>
            </span>
          ))}
          {busy && <Loader2 size={14} className="ml-1 animate-spin text-zinc-500" />}
        </nav>

        {canEdit && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 sm:flex-none" onClick={() => { setError(null); setNewFolder(true) }}>
              <FolderPlus size={15} /> New folder
            </Button>
            <Button size="sm" className="h-10 flex-1 sm:h-9 sm:flex-none" onClick={() => fileInput.current?.click()}>
              <Upload size={15} /> Upload
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) void uploadMany(e.target.files); e.target.value = "" }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400/70 hover:text-red-300"><X size={15} /></button>
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-emerald-950/30 p-3 text-sm text-emerald-300">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-emerald-400/70 hover:text-emerald-300"><X size={15} /></button>
        </div>
      )}

      {/* Active uploads */}
      {uploads.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          {uploads.map((j) => (
            <div key={j.id} className="flex items-center gap-2 text-xs">
              {j.status === "uploading" ? <Loader2 size={13} className="animate-spin text-sky-400" /> : <X size={13} className="text-red-400" />}
              <span className="truncate text-zinc-300">{j.name}</span>
              <span className={j.status === "error" ? "text-red-400" : "text-zinc-500"}>
                {j.status === "error" ? j.error : "uploading…"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Classification filter — only when this folder has classified docs */}
      {typesPresent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200"
          >
            <option value="">All types ({view.files.length})</option>
            {typesPresent.map((t) => (
              <option key={t} value={t}>{DOC_TYPE_LABEL[t] ?? t} ({view.files.filter((f) => f.docType === t).length})</option>
            ))}
          </select>
          <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, summary, tags…"
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 pl-7 pr-2 text-xs text-zinc-100"
            />
          </div>
          {filterActive && (
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => { setCatFilter(""); setQuery("") }}>
              Clear · {shownFiles.length} shown
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Listing + dropzone */}
        <div
          className={`min-w-0 flex-1 rounded-xl border ${dragging ? "border-sky-500 bg-sky-950/20" : "border-zinc-800"} transition-colors`}
          onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragging(true) } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
          onDrop={onDrop}
        >
          {dragging && (
            <div className="pointer-events-none flex items-center justify-center gap-2 border-b border-sky-500/40 py-2 text-xs text-sky-300">
              <Upload size={14} /> Drop files to upload to this folder
            </div>
          )}

          {isEmpty ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <Folder size={28} className="text-zinc-700" />
              <p className="text-sm text-zinc-500">This folder is empty.</p>
              {canEdit && (
                <>
                  <p className="hidden text-xs text-zinc-600 sm:block">Drag files here or use the Upload button.</p>
                  <Button size="sm" className="h-10" onClick={() => fileInput.current?.click()}>
                    <Upload size={15} /> Upload files
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <ul className="divide-y divide-zinc-800 sm:hidden">
                {view.folders.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2.5">
                    <button className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left text-zinc-200" onClick={() => goFolder(f)}>
                      <Folder size={20} className="shrink-0 text-amber-400/80" />
                      <span className="min-w-0">
                        <span className="block truncate">{f.name}</span>
                        <span className="block text-xs text-zinc-500">Folder · {relTime(f.createdAt)}</span>
                      </span>
                    </button>
                    {canEdit && (
                      <div className="flex shrink-0 items-center">
                        <IconBtn title="Rename" onClick={() => setRenaming({ kind: "folder", id: f.id, name: f.name })}><Pencil size={16} /></IconBtn>
                        <IconBtn title="Move" onClick={() => setMoving({ kind: "folder", id: f.id, name: f.name, currentParent: f.parentId })}><FolderInput size={16} /></IconBtn>
                        <IconBtn title="Delete" danger onClick={() => doDeleteFolder(f)}><Trash2 size={16} /></IconBtn>
                      </div>
                    )}
                  </li>
                ))}
                {shownFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2.5">
                    <button className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left text-zinc-200" onClick={() => goFile(f)}>
                      <span className="shrink-0">{fileIcon(f.mimeType, f.name)}</span>
                      <span className="min-w-0">
                        <span className="block truncate">{f.name}</span>
                        {(f.docType || f.docStatus) && <DocTypeBadge docType={f.docType} docStatus={f.docStatus} className="my-0.5" />}
                        <span className="block truncate text-xs text-zinc-500">{typeLabel(f.mimeType, f.name)} · {humanSize(f.size)} · {relTime(f.updatedAt)}</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center">
                      <IconBtn title="Details" onClick={() => setDetails(f)}><Info size={16} /></IconBtn>
                      <IconBtn title="Download" onClick={async () => { const r = await getFileUrlAction(f.id, true); if (r.ok) window.open(r.url, "_blank", "noopener"); else setError(r.error) }}><Download size={16} /></IconBtn>
                      {canEdit && (
                        <IconBtn title="Delete" danger onClick={() => doDeleteFile(f)}><Trash2 size={16} /></IconBtn>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tablet/desktop: table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Type</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Size</th>
                      <th className="px-4 py-3 hidden md:table-cell">Modified</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.folders.map((f) => (
                      <tr key={f.id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                        <td className="px-4 py-3">
                          <button className="flex items-center gap-2 text-left text-zinc-200 hover:text-white" onClick={() => goFolder(f)}>
                            <Folder size={18} className="shrink-0 text-amber-400/80" />
                            <span className="truncate">{f.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 hidden text-zinc-500 sm:table-cell">Folder</td>
                        <td className="px-4 py-3 hidden text-zinc-500 sm:table-cell">—</td>
                        <td className="px-4 py-3 hidden text-zinc-500 md:table-cell" title={new Date(f.createdAt).toLocaleString()}>{relTime(f.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {canEdit && (
                            <div className="flex justify-end gap-1">
                              <IconBtn title="Rename" onClick={() => setRenaming({ kind: "folder", id: f.id, name: f.name })}><Pencil size={14} /></IconBtn>
                              <IconBtn title="Move" onClick={() => setMoving({ kind: "folder", id: f.id, name: f.name, currentParent: f.parentId })}><FolderInput size={14} /></IconBtn>
                              <IconBtn title="Delete" danger onClick={() => doDeleteFolder(f)}><Trash2 size={14} /></IconBtn>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {shownFiles.map((f) => (
                      <tr key={f.id} className={`border-t border-zinc-800 hover:bg-zinc-900/40 ${details?.id === f.id ? "bg-zinc-900/60" : ""}`}>
                        <td className="px-4 py-3">
                          <button className="flex items-center gap-2 text-left text-zinc-200 hover:text-white" onClick={() => goFile(f)}>
                            <span className="shrink-0">{fileIcon(f.mimeType, f.name)}</span>
                            <span className="min-w-0">
                              <span className="block truncate">{f.name}</span>
                              {(f.docType || f.docStatus) && <DocTypeBadge docType={f.docType} docStatus={f.docStatus} className="mt-0.5" />}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 hidden text-zinc-500 sm:table-cell">{typeLabel(f.mimeType, f.name)}</td>
                        <td className="px-4 py-3 hidden text-zinc-400 sm:table-cell">{humanSize(f.size)}</td>
                        <td className="px-4 py-3 hidden text-zinc-500 md:table-cell" title={new Date(f.updatedAt).toLocaleString()}>{relTime(f.updatedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <IconBtn title="Details" onClick={() => setDetails(f)}><Info size={14} /></IconBtn>
                            <IconBtn title="Download" onClick={async () => { const r = await getFileUrlAction(f.id, true); if (r.ok) window.open(r.url, "_blank", "noopener"); else setError(r.error) }}><Download size={14} /></IconBtn>
                            {canEdit && <>
                              <IconBtn title="Rename" onClick={() => setRenaming({ kind: "file", id: f.id, name: f.name })}><Pencil size={14} /></IconBtn>
                              <IconBtn title="Move" onClick={() => setMoving({ kind: "file", id: f.id, name: f.name, currentParent: f.folderId })}><FolderInput size={14} /></IconBtn>
                              <IconBtn title="Delete" danger onClick={() => doDeleteFile(f)}><Trash2 size={14} /></IconBtn>
                            </>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {details && (
          <DetailsPanel
            file={details}
            canEdit={canEdit}
            onClose={() => setDetails(null)}
            onSaved={(f) => { setDetails(f); setNotice("Details saved"); refresh() }}
            onError={setError}
            onRename={() => setRenaming({ kind: "file", id: details.id, name: details.name })}
            onMove={() => setMoving({ kind: "file", id: details.id, name: details.name, currentParent: details.folderId })}
          />
        )}
      </div>

      {newFolder && (
        <NewFolderModal
          parentId={view.folderId}
          scope={scope}
          onClose={() => setNewFolder(false)}
          onCreated={() => { setNewFolder(false); setNotice("Folder created"); refresh() }}
          onError={setError}
        />
      )}

      {renaming && (
        <RenameModal
          item={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => { setRenaming(null); setNotice("Renamed"); refresh() }}
          onError={setError}
        />
      )}

      {moving && (
        <FolderPicker
          title={`Move "${moving.name}"`}
          currentParentId={moving.currentParent}
          disabledIds={moving.kind === "folder" ? new Set([moving.id]) : undefined}
          onClose={() => setMoving(null)}
          onPick={(dest) => {
            const item = moving
            setMoving(null)
            startNav(async () => {
              const r = item.kind === "folder"
                ? await updateFolderAction(item.id, { parentId: dest })
                : await updateFileAction(item.id, { folderId: dest })
              if (!r.ok) setError(r.error)
              else { setNotice(`Moved ${item.name}`); refresh() }
            })
          }}
        />
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 sm:h-auto sm:w-auto sm:p-1.5 ${danger ? "hover:text-red-400" : "hover:text-zinc-100"}`}
    >
      {children}
    </button>
  )
}

function NewFolderModal({ parentId, scope, onClose, onCreated, onError }: {
  parentId: string | null; scope: LegalScope; onClose: () => void; onCreated: () => void; onError: (m: string) => void
}) {
  const [name, setName] = useState("")
  const [pending, start] = useTransition()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const r = await createFolderAction(name, parentId, scope)
      if (r.ok) onCreated()
      else onError(r.error)
    })
  }
  return (
    <Modal title="New folder" icon={<FolderPlus size={16} />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Folder name</Label>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-950 text-zinc-100 border-zinc-700" />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" type="button" className="h-10 sm:h-9" onClick={onClose}>Cancel</Button>
          <Button size="sm" type="submit" className="h-10 sm:h-9" disabled={pending || !name.trim()}>{pending && <Loader2 size={14} className="animate-spin" />} Create</Button>
        </div>
      </form>
    </Modal>
  )
}

function RenameModal({ item, onClose, onSaved, onError }: {
  item: { kind: "file" | "folder"; id: string; name: string }
  onClose: () => void; onSaved: () => void; onError: (m: string) => void
}) {
  const [name, setName] = useState(item.name)
  const [pending, start] = useTransition()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const r = item.kind === "folder"
        ? await updateFolderAction(item.id, { name })
        : await updateFileAction(item.id, { name })
      if (r.ok) onSaved()
      else onError(r.error)
    })
  }
  return (
    <Modal title={`Rename ${item.kind}`} icon={<Pencil size={15} />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Name</Label>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-950 text-zinc-100 border-zinc-700" />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" type="button" className="h-10 sm:h-9" onClick={onClose}>Cancel</Button>
          <Button size="sm" type="submit" className="h-10 sm:h-9" disabled={pending || !name.trim() || name === item.name}>{pending && <Loader2 size={14} className="animate-spin" />} Save</Button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-0 sm:items-start sm:p-4" onClick={onClose}>
      <div className="my-0 max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 p-5 sm:my-12 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-sm font-semibold text-white">{icon} {title}</div>
        {children}
      </div>
    </div>
  )
}
