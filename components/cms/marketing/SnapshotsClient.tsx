"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { captureSnapshotAction, deleteSnapshotAction } from "@/actions/marketing/snapshots"
import { SNAPSHOT_CONTEXTS } from "@/lib/marketing/types"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import { fmtInt, fmtUsd } from "@/lib/marketing/format"

type ManualSnapshotContext = (typeof SNAPSHOT_CONTEXTS)[number]

export interface ArticleOption { id: string; title: string }

export function SnapshotsClient({ snapshots, articles }: { snapshots: SnapshotRow[]; articles: ArticleOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState("")
  const [context, setContext] = useState<ManualSnapshotContext>("GENERAL")
  const [refUrl, setRefUrl] = useState("")
  const [articleId, setArticleId] = useState("")
  const [note, setNote] = useState("")

  async function submit() {
    setBusy(true); setError(null)
    const r = await captureSnapshotAction({
      label, context, refUrl: refUrl || undefined, articleId: articleId || undefined, note: note || undefined,
    })
    setBusy(false)
    if (!r || !r.ok) { setError(r?.error ?? "Unknown error"); return }
    setOpen(false); setLabel(""); setRefUrl(""); setArticleId(""); setNote(""); setContext("GENERAL")
    router.refresh()
  }

  async function remove(id: string) {
    await deleteSnapshotAction(id)
    router.refresh()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Protocol snapshots</h1>
        <button onClick={() => setOpen(true)} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500">
          Capture snapshot
        </button>
      </div>

      {open && (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-400">Label
              <input aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white" />
            </label>
            <label className="text-sm text-zinc-400">Context
              <select aria-label="Context" value={context} onChange={(e) => setContext(e.target.value as ManualSnapshotContext)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white">
                {SNAPSHOT_CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-400">Post URL (optional)
              <input aria-label="Post URL" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="https://x.com/…"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white" />
            </label>
            <label className="text-sm text-zinc-400">Article (optional)
              <select aria-label="Article" value={articleId} onChange={(e) => setArticleId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white">
                <option value="">None</option>
                {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-400 sm:col-span-2">Note (optional)
              <textarea aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white" />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button disabled={busy} onClick={submit} className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Capturing…" : "Capture"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300">Cancel</button>
          </div>
        </div>
      )}

      {snapshots.length === 0 ? (
        <p className="text-sm text-zinc-500">No snapshots yet. Capture one before your next article or X post.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr><th className="py-2">When</th><th>Label</th><th>Context</th><th>DIESEL holders</th><th>DIESEL price</th><th>BTC locked</th><th>By</th><th></th></tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id} className="border-t border-zinc-800 text-zinc-300">
                <td className="py-2">{new Date(s.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                <td><Link href={`/admin/marketing/snapshots/${s.id}`} className="text-sky-300 hover:underline">{s.label}</Link></td>
                <td>{s.context}</td>
                <td>{fmtInt(s.payload.tokens.diesel.holders)}</td>
                <td>{fmtUsd(s.payload.tokens.diesel.priceUsd)}</td>
                <td>{fmtInt(s.payload.protocol.totalBtcLocked)}</td>
                <td>{s.createdByName ?? "—"}</td>
                <td><button onClick={() => remove(s.id)} className="text-rose-400 hover:underline">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
