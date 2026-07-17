"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

/** In-browser .docx renderer (Word/Google-Docs-style pages) via docx-preview.
 *  Fetches the file bytes from its signed URL and renders paginated HTML — no
 *  third-party viewer, so confidential contracts never leave our origin. */
export function DocxViewer({ url, maxHeight = "80vh" }: { url: string; maxHeight?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [msg, setMsg] = useState("")

  useEffect(() => {
    let alive = true
    ;(async () => {
      setState("loading")
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`fetch ${resp.status}`)
        const blob = await resp.blob()
        const { renderAsync } = await import("docx-preview")
        if (!alive || !host.current) return
        host.current.innerHTML = ""
        await renderAsync(blob, host.current, undefined, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: true,
          useBase64URL: true,
        })
        if (alive) setState("ready")
      } catch (e) {
        if (alive) { setState("error"); setMsg(String(e).slice(0, 140)) }
      }
    })()
    return () => { alive = false }
  }, [url])

  return (
    <div>
      {state === "loading" && (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> Rendering document…
        </div>
      )}
      {state === "error" && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          Couldn&apos;t render this document ({msg}). Try downloading it instead.
        </div>
      )}
      <div
        ref={host}
        className="docx-host overflow-auto rounded-lg bg-zinc-300"
        style={{ maxHeight, display: state === "ready" ? "block" : "none" }}
      />
    </div>
  )
}
