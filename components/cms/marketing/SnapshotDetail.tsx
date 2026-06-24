"use client"

import { useMemo, useState } from "react"
import { liveSnapshotAction } from "@/actions/marketing/snapshots"
import { diffSnapshots, type DiffRow } from "@/lib/marketing/diff"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload, SnapshotTokenBlock } from "@/lib/marketing/types"
import { fmtInt, fmtUsd, fmtNum } from "@/lib/marketing/format"

const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

function TokenCard({ t }: { t: SnapshotTokenBlock }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="mb-2 font-semibold text-white">{t.name ?? t.id} <span className="text-zinc-500">{t.id}</span></h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-300">
        <dt className="text-zinc-500">Holders</dt><dd>{fmtInt(t.holders)}</dd>
        <dt className="text-zinc-500">Price</dt><dd>{fmtUsd(t.priceUsd)}</dd>
        <dt className="text-zinc-500">Market cap</dt><dd>{fmtUsd(t.marketcapUsd)}</dd>
        <dt className="text-zinc-500">FDV</dt><dd>{fmtUsd(t.fdvUsd)}</dd>
        <dt className="text-zinc-500">24h volume</dt><dd>{fmtUsd(t.volume24hUsd)}</dd>
        <dt className="text-zinc-500">24h change</dt><dd>{fmtNum(t.priceChange24h)}%</dd>
      </dl>
    </div>
  )
}

export function SnapshotDetail({ snapshot, others }: { snapshot: SnapshotRow; others: SnapshotRow[] }) {
  const [compareId, setCompareId] = useState("")
  const [livePayload, setLivePayload] = useState<SnapshotPayload | null>(null)
  const p = snapshot.payload

  const comparePayload: SnapshotPayload | null = useMemo(() => {
    if (compareId === "live") return livePayload
    return others.find((o) => o.id === compareId)?.payload ?? null
  }, [compareId, livePayload, others])

  const rows: DiffRow[] = comparePayload ? diffSnapshots(comparePayload, p) : []

  async function pick(value: string) {
    setCompareId(value)
    if (value === "live" && !livePayload) {
      const r = await liveSnapshotAction()
      if (r.ok) setLivePayload(r.value)
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">{snapshot.label}</h1>
      <p className="mb-4 text-sm text-zinc-500">
        {snapshot.context} · captured {new Date(snapshot.createdAt).toISOString().slice(0, 16).replace("T", " ")} by {snapshot.createdByName ?? "—"}
        {snapshot.refUrl && <> · <a href={snapshot.refUrl} className="text-sky-300 hover:underline" target="_blank" rel="noreferrer">post ↗</a></>}
        {snapshot.payload.partial && <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">partial</span>}
      </p>
      {snapshot.note && <p className="mb-4 text-sm text-zinc-400">{snapshot.note}</p>}

      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="mb-2 font-semibold text-white">Protocol</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-300 sm:grid-cols-4">
          <dt className="text-zinc-500">Total BTC Locked</dt><dd>{fmtInt(p.protocol.totalBtcLocked)}</dd>
          <dt className="text-zinc-500">BTC price</dt><dd>{fmtUsd(p.protocol.btcUsd)}</dd>
          <dt className="text-zinc-500">BTC/DIESEL</dt><dd>{fmtNum(p.ratios.btcDiesel)}</dd>
          <dt className="text-zinc-500">BTC/FIRE</dt><dd>{fmtNum(p.ratios.btcFire)}</dd>
        </dl>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <TokenCard t={p.tokens.diesel} />
        <TokenCard t={p.tokens.fire} />
        <TokenCard t={p.tokens.frbtc} />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <label className="text-sm text-zinc-400">Compare with{" "}
          <select aria-label="Compare with" value={compareId} onChange={(e) => pick(e.target.value)}
            className="ml-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-white">
            <option value="">—</option>
            <option value="live">Live now</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.label} ({new Date(o.createdAt).toISOString().slice(0, 10)})</option>)}
          </select>
        </label>
        {rows.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-zinc-500"><tr><th className="py-1">Metric</th><th>Before</th><th>After</th><th>Δ</th><th>Δ%</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.path} className="border-t border-zinc-800 text-zinc-300">
                  <td className="py-1">{r.label}</td>
                  <td>{r.before === null ? "—" : r.before.toLocaleString("en-US")}</td>
                  <td>{r.after === null ? "—" : r.after.toLocaleString("en-US")}</td>
                  <td className={r.deltaAbs && r.deltaAbs > 0 ? "text-emerald-400" : r.deltaAbs && r.deltaAbs < 0 ? "text-rose-400" : ""}>
                    {r.deltaAbs === null ? "—" : sign(Number(r.deltaAbs.toFixed(2)))}
                  </td>
                  <td>{r.deltaPct === null ? "—" : `${sign(Number(r.deltaPct.toFixed(2)))}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
