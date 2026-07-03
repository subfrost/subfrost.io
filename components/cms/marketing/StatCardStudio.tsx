"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, RefreshCw, Download } from "lucide-react"
import { METRIC_LABELS, WINDOW_LABELS, type MetricKey, type WindowKey } from "@/lib/marketing/opreturn-types"
import { syncOpReturnAction } from "@/actions/marketing/opreturn"

const METRICS = Object.keys(METRIC_LABELS) as MetricKey[]
const WINDOWS = Object.keys(WINDOW_LABELS) as WindowKey[]

export function StatCardStudio({ meta }: { meta: { count: number; latestDate: string | null; latestUpdatedAt: Date | null } }) {
  const router = useRouter()
  const [metric, setMetric] = useState<MetricKey>("alkanesTxShare")
  const [template, setTemplate] = useState<"hero" | "compare">("hero")
  const [window, setWindow] = useState<WindowKey>("avg7")
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const src = useMemo(() => {
    const q = new URLSearchParams({ metric, template, window, theme })
    return `/admin/marketing/cards/render?${q.toString()}`
  }, [metric, template, window, theme])

  async function sync() {
    setBusy(true); setMsg(null)
    const r = await syncOpReturnAction()
    setBusy(false)
    setMsg(r.ok ? `Synced ${r.value.upserted} days (latest ${r.value.latestDate})` : r.error)
    if (r.ok) router.refresh()
  }

  const select = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
  const label = "text-[11px] font-medium uppercase tracking-wide text-zinc-500"

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white"><Camera size={20} className="text-zinc-400" /> Stat cards</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{meta.count > 0 ? `${meta.count} days · latest ${meta.latestDate}` : "No data yet"}</span>
          <button onClick={sync} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Sync now</button>
        </div>
      </div>
      {msg && <p className="text-xs text-zinc-400">{msg}</p>}
      {meta.count === 0 && <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">No on-chain data yet — use the button above to pull the decoder history.</p>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div className="flex flex-col gap-1"><label className={label} htmlFor="m">Metric</label>
            <select id="m" aria-label="Metric" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className={select}>
              {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
            </select></div>
          <div className="flex flex-col gap-1"><label className={label} htmlFor="t">Template</label>
            <select id="t" aria-label="Template" value={template} onChange={(e) => setTemplate(e.target.value as "hero" | "compare")} className={select}>
              <option value="hero">Hero stat</option><option value="compare">Bytes composition</option>
            </select></div>
          <div className="flex flex-col gap-1"><label className={label} htmlFor="w">Window</label>
            <select id="w" aria-label="Window" value={window} onChange={(e) => setWindow(e.target.value as WindowKey)} className={select}>
              {WINDOWS.map((w) => <option key={w} value={w}>{WINDOW_LABELS[w]}</option>)}
            </select></div>
          <div className="flex flex-col gap-1"><label className={label} htmlFor="th">Theme</label>
            <select id="th" aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")} className={select}>
              <option value="dark">Dark</option><option value="light">Light</option>
            </select></div>
          <a href={src} download className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-sky-500/40 px-3 py-2 text-sm text-sky-300 hover:bg-sky-500/10"><Download size={15} /> Download PNG</a>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt="Card preview" className="w-full rounded-md" style={{ aspectRatio: "1200 / 675" }} />
        </div>
      </div>
    </div>
  )
}
