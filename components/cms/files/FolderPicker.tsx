"use client"

import { useEffect, useState } from "react"
import { ChevronRight, Folder, FolderOpen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { listFolderAction } from "@/actions/cms/files"
import type { FolderView } from "@/lib/files/manager"

// A modal that lets the user pick a destination folder (or Root) to move an
// item into. Folders are loaded lazily as the tree is expanded.

interface NodeState {
  loaded: boolean
  loading: boolean
  children: FolderView[]
  open: boolean
}

export function FolderPicker({
  title,
  /** Folder ids that may not be chosen (the moved item itself + its subtree, when known). */
  disabledIds,
  currentParentId,
  onPick,
  onClose,
}: {
  title: string
  disabledIds?: Set<string>
  currentParentId: string | null
  onPick: (folderId: string | null) => void
  onClose: () => void
}) {
  // key: folderId or "__root__"
  const [nodes, setNodes] = useState<Record<string, NodeState>>({})
  const [selected, setSelected] = useState<string | null>(currentParentId)
  const [error, setError] = useState<string | null>(null)

  const load = async (key: string, folderId: string | null) => {
    setNodes((p) => ({ ...p, [key]: { ...(p[key] ?? { children: [], open: false }), loaded: p[key]?.loaded ?? false, loading: true, open: true } }))
    const r = await listFolderAction(folderId)
    if (!r.ok) { setError(r.error); return }
    setNodes((p) => ({
      ...p,
      [key]: { loaded: true, loading: false, open: true, children: r.data.folders },
    }))
  }

  useEffect(() => { void load("__root__", null) }, [])

  const toggle = (key: string, folderId: string | null) => {
    const n = nodes[key]
    if (n?.loaded) setNodes((p) => ({ ...p, [key]: { ...n, open: !n.open } }))
    else void load(key, folderId)
  }

  const Row = ({ folder, depth }: { folder: FolderView; depth: number }) => {
    const key = folder.id
    const n = nodes[key]
    const disabled = disabledIds?.has(folder.id) ?? false
    return (
      <div>
        <div
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
            disabled ? "opacity-40" : "cursor-pointer hover:bg-zinc-800/60"
          } ${selected === folder.id ? "bg-sky-950/50 text-sky-200" : "text-zinc-300"}`}
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() => !disabled && setSelected(folder.id)}
        >
          <button
            type="button"
            className="shrink-0 text-zinc-500 hover:text-zinc-300"
            onClick={(e) => { e.stopPropagation(); toggle(key, folder.id) }}
          >
            {n?.loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} className={n?.open ? "rotate-90 transition" : "transition"} />}
          </button>
          {n?.open ? <FolderOpen size={15} className="shrink-0 text-amber-400/80" /> : <Folder size={15} className="shrink-0 text-amber-400/80" />}
          <span className="truncate">{folder.name}</span>
        </div>
        {n?.open && n.children.map((c) => <Row key={c.id} folder={c} depth={depth + 1} />)}
      </div>
    )
  }

  const root = nodes["__root__"]
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold text-white">{title}</div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-1">
          <div
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
              selected === null ? "bg-sky-950/50 text-sky-200" : "cursor-pointer text-zinc-300 hover:bg-zinc-800/60"
            }`}
            onClick={() => setSelected(null)}
          >
            <FolderOpen size={15} className="text-amber-400/80" /> Root
          </div>
          {root?.loading && !root?.loaded && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-500"><Loader2 size={13} className="animate-spin" /> Loading…</div>
          )}
          {root?.children.map((c) => <Row key={c.id} folder={c} depth={1} />)}
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onPick(selected)} disabled={selected === currentParentId}>Move here</Button>
        </div>
      </div>
    </div>
  )
}
