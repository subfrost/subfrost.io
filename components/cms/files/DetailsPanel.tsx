"use client"

import { useEffect, useState } from "react"
import { Loader2, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateFileAction } from "@/actions/cms/files"
import type { FileView } from "@/lib/files/manager"
import { humanSize, relTime, typeLabel } from "./util"

// Right-hand details panel for a selected file: read-only metadata plus, when
// canEdit, editable tags and a free-form notes field stored on metadata.notes.

export function DetailsPanel({
  file,
  canEdit,
  onClose,
  onSaved,
  onError,
}: {
  file: FileView
  canEdit: boolean
  onClose: () => void
  onSaved: (file: FileView) => void
  onError: (msg: string) => void
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

  return (
    <aside className="flex w-full flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 lg:w-80 lg:shrink-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{file.name}</div>
          <div className="text-xs text-zinc-500">Details</div>
        </div>
        <button className="text-zinc-500 hover:text-zinc-300" onClick={onClose}><X size={16} /></button>
      </div>

      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Type</dt><dd className="truncate text-zinc-300">{typeLabel(file.mimeType, file.name)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">MIME</dt><dd className="truncate text-zinc-300">{file.mimeType || "—"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Size</dt><dd className="text-zinc-300">{humanSize(file.size)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Created</dt><dd className="text-zinc-300" title={new Date(file.createdAt).toLocaleString()}>{relTime(file.createdAt)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">Modified</dt><dd className="text-zinc-300" title={new Date(file.updatedAt).toLocaleString()}>{relTime(file.updatedAt)}</dd></div>
      </dl>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs text-zinc-400"><Tag size={12} /> Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-xs text-zinc-600">No tags</span>}
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-300">
              {t}
              {canEdit && <button className="text-zinc-500 hover:text-red-400" onClick={() => setTags(tags.filter((x) => x !== t))}><X size={11} /></button>}
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
              className="h-8 bg-zinc-950 text-xs text-zinc-100 border-zinc-700"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={addTag} disabled={!tagDraft.trim()}>Add</Button>
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
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 size={14} className="animate-spin" />} Save details
        </Button>
      )}
    </aside>
  )
}
