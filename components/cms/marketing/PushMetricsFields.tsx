"use client"

import { useState } from "react"
import type { PushMetrics } from "@/lib/cms/marketing-analytics"
import { uploadInlineImage } from "@/lib/cms/inline-image-upload"

const FIELDS: { key: keyof PushMetrics; label: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "likes", label: "Likes" },
  { key: "reposts", label: "Reposts" },
  { key: "clicks", label: "Clicks" },
]

export function PushMetricsFields({
  metrics,
  screenshotUrl,
  onMetrics,
  onScreenshot,
}: {
  metrics: PushMetrics
  screenshotUrl: string | null
  onMetrics: (m: PushMetrics) => void
  onScreenshot: (url: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true); setErr(null)
    try {
      onScreenshot(await uploadInlineImage(file, fetch, "inline"))
    } catch (e) {
      // A gateway's non-JSON body must not surface as a raw JSON-parse error.
      const detail = e instanceof Error && e.message ? ` — ${e.message}` : ""
      setErr(`Upload failed${detail}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2 border-t pt-2">
      <div className="text-xs font-medium text-muted-foreground">Manual metrics (X / email / stat-card)</div>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {f.label}
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1 text-sm text-foreground"
              value={metrics[f.key] ?? ""}
              onChange={(e) => onMetrics({ ...metrics, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="file" accept="image/*" className="text-xs"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
        {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
        {screenshotUrl && <a href={screenshotUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">view print</a>}
        {screenshotUrl && <button type="button" className="text-xs text-red-600" onClick={() => onScreenshot(null)}>remove</button>}
      </div>
      {err && <div role="alert" className="text-xs text-red-600">{err}</div>}
    </div>
  )
}
