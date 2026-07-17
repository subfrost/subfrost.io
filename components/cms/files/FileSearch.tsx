"use client"

import { useEffect, useRef, useState } from "react"
import { Search, Loader2, X, ChevronRight, FileText } from "lucide-react"
import type { LegalScope } from "@prisma/client"
import { searchFilesAction } from "@/actions/cms/files"
import type { FileView, FileSearchHit } from "@/lib/files/manager"
import { humanSize, relTime, highlightSnippet } from "./util"
import { DocTypeBadge } from "./DocTypeBadge"

export function FileSearch({
  scope,
  onOpenFile,
}: {
  scope: LegalScope
  onOpenFile: (file: FileView) => void
}) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<FileSearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [scoped, setScoped] = useState(true) // limit to this drive vs all drives
  const seq = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) { setHits(null); setBusy(false); return }
    setBusy(true)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const r = await searchFilesAction(query, scoped ? scope : undefined)
      if (mine !== seq.current) return // a newer keystroke superseded this
      setBusy(false)
      setHits(r.ok ? r.hits : [])
    }, 250)
    return () => clearTimeout(t)
  }, [q, scope, scoped])

  const clear = () => { setQ(""); setHits(null); inputRef.current?.focus() }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents — filename or text inside…"
            className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-9 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
          />
          {busy ? (
            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-sky-400" />
          ) : q ? (
            <button aria-label="Clear search" onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:text-zinc-200"><X size={16} /></button>
          ) : null}
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={scoped} onChange={(e) => setScoped(e.target.checked)} className="accent-sky-500" />
          This drive only
        </label>
      </div>

      {hits !== null && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">
            {hits.length === 0 ? "No matches" : `${hits.length} result${hits.length === 1 ? "" : "s"} for “${q.trim()}”`}
          </div>
          <ul className="divide-y divide-zinc-800">
            {hits.map((h) => (
              <li key={h.file.id}>
                <button className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-900/60" onClick={() => onOpenFile(h.file)}>
                  <span className="mt-0.5 shrink-0"><FileText size={18} className="text-zinc-400" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm text-zinc-100">{h.file.name}</span>
                      <DocTypeBadge docType={h.file.docType} docStatus={h.file.docStatus} />
                    </span>
                    {/* breadcrumb path */}
                    <span className="mt-0.5 flex flex-wrap items-center text-[11px] text-zinc-500">
                      <span className="uppercase tracking-wide">{h.file.scope}</span>
                      {h.folderPath.map((c) => (
                        <span key={c.id} className="flex items-center"><ChevronRight size={11} className="mx-0.5 shrink-0" />{c.name}</span>
                      ))}
                      <span className="ml-2">· {humanSize(h.file.size)} · {relTime(h.file.updatedAt)}</span>
                    </span>
                    {h.snippet && (
                      <span
                        className="mt-1 block text-xs leading-relaxed text-zinc-400 [&_mark]:font-medium"
                        dangerouslySetInnerHTML={{ __html: highlightSnippet(h.snippet) }}
                      />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
