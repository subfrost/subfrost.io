"use client"

import { useRef, useState } from "react"
import { X } from "lucide-react"
import { htmlToMarkdown } from "@/lib/cms/import-html"
import { Markdown } from "@/lib/cms/markdown"

export function ImportDocModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean
  onClose: () => void
  onImport: (markdown: string, mode: "replace" | "append") => void
}) {
  const [markdown, setMarkdown] = useState("")
  const pasteRef = useRef<HTMLDivElement>(null)

  if (!open) return null

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const html = event.clipboardData.getData("text/html")
    const md = html ? htmlToMarkdown(html) : event.clipboardData.getData("text/plain")
    event.preventDefault()
    if (md.trim()) setMarkdown(md.trim())
    if (pasteRef.current) pasteRef.current.textContent = ""
  }

  function handleClose() {
    setMarkdown("")
    onClose()
  }

  function done(mode: "replace" | "append") {
    if (!markdown.trim()) return
    onImport(markdown.trim(), mode)
    setMarkdown("")
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import from Doc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[10px] bg-[color:var(--ed-canvas,#fff)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--ed-hair)] px-5 py-3">
          <h2 className="text-sm font-medium text-[color:var(--ed-ink)]">Import from Doc</h2>
          <button type="button" aria-label="Close" onClick={handleClose} className="text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]">
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-[color:var(--ed-muted)]">Paste your Google Doc (Ctrl/Cmd+V)</p>
            <div
              ref={pasteRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Paste your Google Doc here"
              onPaste={onPaste}
              className="min-h-[40vh] w-full rounded-[8px] border border-dashed border-[color:var(--ed-hair)] p-3 text-sm outline-none"
            />
          </div>
          <div>
            <p className="mb-2 text-xs text-[color:var(--ed-muted)]">Preview</p>
            <div className="min-h-[40vh] rounded-[8px] border border-[color:var(--ed-hair)] p-3">
              {markdown.trim() ? <Markdown variant="article">{markdown}</Markdown> : (
                <span className="text-sm text-[color:var(--ed-muted)]">Converted article appears here.</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--ed-hair)] px-5 py-3">
          <button type="button" onClick={handleClose} className="h-9 rounded-[6px] px-3 text-sm text-[color:var(--ed-body)] hover:bg-[color:var(--ed-surface)]">Cancel</button>
          <button type="button" onClick={() => done("append")} disabled={!markdown.trim()} className="h-9 rounded-[6px] px-3 text-sm text-[color:var(--ed-body)] hover:bg-[color:var(--ed-surface)] disabled:opacity-45">Append to body</button>
          <button type="button" onClick={() => done("replace")} disabled={!markdown.trim()} className="h-9 rounded-[6px] bg-[color:var(--ed-ink)] px-3 text-sm text-[color:var(--ed-canvas,#fff)] disabled:opacity-45">Replace body</button>
        </div>
      </div>
    </div>
  )
}
