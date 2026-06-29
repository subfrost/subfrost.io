"use client"

import { useEffect, useState } from "react"
import { Download, FolderInput, Loader2, Pencil, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getFileUrlAction, updateFileAction } from "@/actions/cms/files"
import type { FileView } from "@/lib/files/manager"
import { humanSize, relTime, typeLabel } from "./util"
import { FileEntityLinks } from "./FileEntityLinks"

// Details panel for a selected file: read-only metadata plus, when canEdit,
// editable tags and a free-form notes field stored on metadata.notes. On large
// screens it renders as a right-hand sidebar; on small screens it becomes a
// dismissible bottom sheet.

export function DetailsPanel({
  file,
  canEdit,
  onClose,
  onSaved,
  onError,
  onRename,
  onMove,
}: {
  file: FileView
  canEdit: boolean
  onClose: () => void
  onSaved: (file: FileView) => void
  onError: (msg: string) => void
  onRename?: () => void
  onMove?: () => void
}) {
  const [tags, setTags] = useState<string[]>(file.tags)
  const [tagDraft, setTagDraft] = useState("")
  const [notes, setNotes] = useState<string>(typeof file.metadata?.notes === "string" ? (file.metadata.notes as string) : "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTags(file.tags)
    setNotes(typeof file.metadata?.notes === "string" ? (file.metadata.notes as string) : "")
    setTagDraft("")
  }, [file])

  const dirty =
    JSON.stringify(tags) !== JSON.stringify(file.tags) ||
    notes !== (typeof file.metadata?.notes === "string" ? file.metadata.notes : "")

  const addTag = () => {
    const t = tagDraft.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagDraft("")
  }

  const save = async () => {
    setSaving(true)
    const metadata = { ...file.metadata, notes }
    const r = await updateFileAction(file.id, { tags, metadata })
    setSaving(false)
    if (r.ok) onSaved(r.file)
    else onError(r.error)
  }

  const download = async () => {
    const r = await getFileUrlAction(file.id, true)
    if (r.ok) window.open(r.url, "_blank", "noopener")
    else onError(r.error)
  }

  return (
    <>
      {/* Backdrop only on mobile, where the panel is a bottom sheet */}
      <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
      <aside className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 p-4 lg:static lg:z-auto lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-xl lg:bg-zinc-900/60">
      <div className="-mx-4 -mt-4 flex items-start justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-3 lg:mx-0 lg:mt-0 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{file.name}</div>
          <div className="text-xs text-zinc-500">Details</div>
        </div>
        <button aria-label="Close" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" onClick={onClose}><X size={18} /></button>
      </div>

      {/* Quick actions — primary way to reach rename/move/download on mobile */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 lg:flex-none" onClick={download}><Download size={14} /> Download</Button>
        {canEdit && onRename && <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 lg:flex-none" onClick={onRename}><Pencil size={14} /> Rename</Button>}
        {canEdit && onMove && <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 lg:flex-none" onClick={onMove}><FolderInput size={14} /> Move</Button>}
      </div>

      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Type</dt><dd className="truncate text-zinc-300">{typeLabel(file.mimeType, file.name)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">MIME</dt><dd className="truncate text-zinc-300">{file.mimeType || "—"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Size</dt><dd className="text-zinc-300">{humanSize(file.size)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Created</dt><dd className="text-zinc-300" title={new Date(file.createdAt).toLocaleString()}>{relTime(file.createdAt)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Modified</dt><dd className="text-zinc-300" title={new Date(file.updatedAt).toLocaleString()}>{relTime(file.updatedAt)}</dd></div>
      </dl>

      <FileEntityLinks
        fileId={file.id}
        canEdit={canEdit}
        suggested={Array.isArray(file.metadata?.suggestedEntities) ? (file.metadata.suggestedEntities as string[]) : []}
        onError={onError}
      />

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs text-zinc-400"><Tag size={12} /> Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-xs text-zinc-600">No tags</span>}
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-300">
              {t}
              {canEdit && <button aria-label={`Remove tag ${t}`} className="inline-flex h-5 w-5 items-center justify-center text-zinc-500 hover:text-red-400" onClick={() => setTags(tags.filter((x) => x !== t))}><X size={12} /></button>}
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
              placeholder="Add a tag…"
              className="h-10 bg-zinc-950 text-xs text-zinc-100 border-zinc-700 sm:h-8"
            />
            <Button size="sm" variant="outline" className="h-10 sm:h-8" onClick={addTag} disabled={!tagDraft.trim()}>Add</Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-zinc-400">Notes</Label>
        {canEdit ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notes about this file…"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
          />
        ) : (
          <p className="whitespace-pre-wrap text-xs text-zinc-400">{notes || <span className="text-zinc-600">No notes</span>}</p>
        )}
      </div>

      {canEdit && (
        <Button size="sm" className="h-10 sm:h-9" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 size={14} className="animate-spin" />} Save details
        </Button>
      )}
      </aside>
    </>
  )
}
