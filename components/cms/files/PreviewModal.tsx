"use client"

import { useEffect, useState } from "react"
import { Download, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getFileUrlAction } from "@/actions/cms/files"
import type { FileView } from "@/lib/files/manager"
import { humanSize, previewKind, renderMarkdown } from "./util"

export function PreviewModal({ file, onClose }: { file: FileView; onClose: () => void }) {
  const kind = previewKind(file.mimeType, file.name)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [textBody, setTextBody] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const isMarkdown = /\.(md|markdown)$/i.test(file.name)

  useEffect(() => {
    let alive = true
    getFileUrlAction(file.id).then(async (r) => {
      if (!alive) return
      if (!r.ok) { setError(r.error); return }
      setUrl(r.url)
      if (kind === "text") {
        try {
          const resp = await fetch(r.url)
          const body = await resp.text()
          if (alive) setTextBody(body.length > 500_000 ? body.slice(0, 500_000) + "\n… (truncated)" : body)
        } catch {
          if (alive) setError("Could not load file contents")
        }
      }
    })
    return () => { alive = false }
  }, [file.id, kind])

  const download = async () => {
    setDownloading(true)
    const r = await getFileUrlAction(file.id, true)
    setDownloading(false)
    if (r.ok) window.open(r.url, "_blank", "noopener")
    else setError(r.error)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/70 p-0 sm:items-start sm:p-4" onClick={onClose}>
      <div className="flex min-h-full w-full flex-col border-zinc-800 bg-zinc-900 sm:my-6 sm:min-h-0 sm:max-w-4xl sm:rounded-xl sm:border" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3 sm:static">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{file.name}</div>
            <div className="text-xs text-zinc-500">{file.mimeType || "unknown"} · {humanSize(file.size)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" className="h-10 sm:h-9" disabled={downloading} onClick={download}>
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
            </Button>
            <Button size="sm" variant="ghost" aria-label="Close preview" className="h-10 w-10 p-0 sm:h-9 sm:w-9" onClick={onClose}><X size={18} /></Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:max-h-[75vh] sm:flex-none">
          {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
          {!error && !url && <div className="flex items-center gap-2 py-12 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Loading preview…</div>}

          {url && !error && kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
          )}
          {url && !error && kind === "video" && (
            <video src={url} controls className="mx-auto max-h-[70vh] w-full rounded-lg" />
          )}
          {url && !error && kind === "audio" && (
            <div className="py-8"><audio src={url} controls className="w-full" /></div>
          )}
          {url && !error && kind === "pdf" && (
            <iframe src={url} title={file.name} className="h-[70vh] w-full rounded-lg border border-zinc-800 bg-white" />
          )}
          {url && !error && kind === "text" && textBody === null && (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Loading contents…</div>
          )}
          {url && !error && kind === "text" && textBody !== null && (
            isMarkdown ? (
              <div className="prose-invert text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(textBody) }} />
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-4 text-xs text-zinc-300">{textBody}</pre>
            )
          )}
          {url && !error && kind === "other" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-zinc-400">No inline preview available for this file type.</p>
              <Button size="sm" onClick={download}><Download size={14} /> Download</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
