"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Download, FileSignature, Loader2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getFileUrlAction } from "@/actions/cms/files"
import type { FileView } from "@/lib/files/manager"
import { humanSize, previewKind, renderMarkdown, typeLabel } from "./util"
import { DocTypeBadge } from "./DocTypeBadge"

export interface FileEntityLink {
  id: string
  role: string
  entity: { id: string; name: string }
}

// Full-page, slug-routed renderer for a single file: images / video / audio /
// pdf / text render inline; other types fall back to a download. Mirrors the
// MIME handling of PreviewModal but as a page (its own /admin/files/<…>/<slug>
// URL), with a details rail, download, and the WS3 "Request Signatures" action.
export function FileRenderer({
  file, canRequestSignatures, entityLinks, backHref,
}: {
  file: FileView
  canRequestSignatures: boolean
  entityLinks: FileEntityLink[]
  backHref: string
}) {
  const kind = previewKind(file.mimeType, file.name)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [textBody, setTextBody] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const isMarkdown = /\.(md|markdown)$/i.test(file.name)
  const isPdf = kind === "pdf"

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
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-white">{file.name}</div>
            <div className="text-xs text-zinc-500">{file.mimeType || "unknown"} · {humanSize(file.size)}</div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-10 sm:h-9" disabled={downloading} onClick={download}>
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
            </Button>
            {canRequestSignatures && isPdf && (
              <Button asChild size="sm" className="h-10 sm:h-9">
                <Link href={`/admin/documents/new?fromFile=${file.id}`}>
                  <FileSignature size={14} /> Request signatures
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
          {!error && !url && <div className="flex items-center gap-2 py-12 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>}

          {url && !error && kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="mx-auto max-h-[75vh] rounded-lg object-contain" />
          )}
          {url && !error && kind === "video" && (
            <video src={url} controls className="mx-auto max-h-[75vh] w-full rounded-lg" />
          )}
          {url && !error && kind === "audio" && (
            <div className="py-8"><audio src={url} controls className="w-full" /></div>
          )}
          {url && !error && isPdf && (
            <iframe src={url} title={file.name} className="h-[80vh] w-full rounded-lg border border-zinc-800 bg-white" />
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

      {/* Details rail */}
      <aside className="w-full shrink-0 space-y-4 lg:w-72">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Details</div>
          <dl className="space-y-1.5 text-zinc-300">
            <div className="flex justify-between gap-2"><dt className="text-zinc-500">Type</dt><dd>{typeLabel(file.mimeType, file.name)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-zinc-500">Size</dt><dd>{humanSize(file.size)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-zinc-500">Drive</dt><dd>{file.scope}</dd></div>
          </dl>
          {(file.docType || file.docStatus) && (
            <div className="mt-2">
              <DocTypeBadge docType={file.docType} docStatus={file.docStatus} />
              {typeof (file.metadata?.classification as { summary?: string } | undefined)?.summary === "string" && (
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{(file.metadata!.classification as { summary?: string }).summary}</p>
              )}
            </div>
          )}
          {file.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {file.tags.map((t) => (
                <span key={t} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{t}</span>
              ))}
            </div>
          )}
          <Link href={backHref} className="mt-3 inline-block text-xs text-sky-400 hover:underline">← Back to folder</Link>
        </div>

        {entityLinks.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Link2 size={12} /> Linked entities
            </div>
            <ul className="space-y-1.5">
              {entityLinks.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/entities/${l.entity.id}`} className="truncate text-zinc-200 hover:text-white">{l.entity.name}</Link>
                  <span className="shrink-0 text-xs text-zinc-500">{l.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
