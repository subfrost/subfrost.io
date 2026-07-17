"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { SkeletonTable } from "@/components/cms/Skeleton"
import {
  balanceSheetOverviewAction,
  createBalanceSheetItemAction,
  deleteBalanceSheetItemAction,
} from "@/actions/cms/balance-sheet"
import {
  SECTION_LABELS,
  type BalanceSheetView, type BalanceSheetSection,
} from "@/lib/financials/balance-sheet/shapes"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })
const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const SECTIONS: BalanceSheetSection[] = ["ASSET", "LIABILITY", "EQUITY"]

export function BalanceSheetManager() {
  const [view, setView] = useState<BalanceSheetView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await balanceSheetOverviewAction()
    if (res.ok) { setView(res.view); setError(null) } else setError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const remove = (id: string) =>
    startTransition(async () => {
      const r = await deleteBalanceSheetItemAction(id)
      if (r.ok) fetchData()
      else setError(r.error)
    })

  if (loading) return <SkeletonTable />
  if (!view) return <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error ?? "Could not load."}</div>

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}<button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

      {!view.treasuryAvailable && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          Treasury holdings aren&apos;t cached yet — open the Treasury page once (or set BSC_RPC_URL) so the
          treasury asset line populates. You can still add it as a manual line in the meantime.
        </div>
      )}
      {view.treasuryStale && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          Treasury figure is from the last-good snapshot (provider was unreachable on the latest fetch).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Total assets" value={usd(view.totalAssets)} />
        <Metric label="Liabilities + equity" value={usd(view.liabilitiesPlusEquity)} />
        <Metric
          label={view.balanced ? "Balanced" : "Difference"}
          value={view.balanced ? "✓" : usd(view.difference)}
          tone={view.balanced ? "ok" : "warn"}
        />
      </div>

      {/* 409A basis: assets − liabilities − SAFE senior preference. Should stay
          positive; the low 409A comes from the waterfall, not negative book equity. */}
      <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-emerald-200">Attributable to common (409A basis)</div>
            <div className="mt-0.5 text-xs text-emerald-300/70">
              assets − liabilities − SAFE senior preference ({usd(view.safePreferenceUsd)})
            </div>
          </div>
          <div className={`text-2xl font-semibold tabular-nums ${view.attributableToCommonUsd >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {usd(view.attributableToCommonUsd)}
          </div>
        </div>
      </div>

      {SECTIONS.map((s) => {
        const sec = view.sections[s]
        return (
          <div key={s} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">{SECTION_LABELS[s]}</h2>
              <span className="text-sm font-semibold text-zinc-300">{usd(sec.total)}</span>
            </div>
            {sec.lines.length === 0 ? (
              <p className="text-sm text-zinc-500">No lines yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {sec.lines.map((l) => (
                    <tr key={l.id} className="border-t border-zinc-900">
                      <td className="py-2 text-zinc-200">
                        {l.label}
                        {l.computed && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">computed</span>}
                        {l.note && <span className="ml-2 text-xs text-zinc-600">{l.note}</span>}
                      </td>
                      <td className="text-right text-zinc-300">{usd(l.amountUsd)}</td>
                      <td className="w-10 text-right">
                        {!l.computed && (
                          <button disabled={pending} onClick={() => remove(l.id)} className="text-xs text-zinc-500 hover:text-red-300">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <AddLineForm section={s} disabled={pending} onAdded={fetchData} onError={setError} />
          </div>
        )
      })}

      {view.memo.length > 0 && (
        <div className="rounded-xl border border-dashed border-amber-800/50 bg-amber-950/20 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-200">Memo — notional (not included in totals)</h2>
            <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300/80">off balance sheet</span>
          </div>
          <p className="mb-2 text-xs text-amber-300/70">
            Reference figures only — excluded from every total and from the assets = liabilities + equity check.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {view.memo.map((l) => (
                <tr key={l.id} className="border-t border-amber-900/40">
                  <td className="py-2 text-amber-100">
                    {l.label}
                    {l.note && <span className="ml-2 text-xs text-amber-500/70">{l.note}</span>}
                  </td>
                  <td className="text-right tabular-nums text-amber-200">{usd(l.amountUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AddLineForm({
  section, onAdded, onError, disabled,
}: {
  section: BalanceSheetSection
  onAdded: () => void
  onError: (m: string) => void
  disabled: boolean
}) {
  const [label, setLabel] = useState("")
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    try {
      const res = await createBalanceSheetItemAction({ section, label: label.trim(), amountUsd: Number(amount) || 0 })
      if (res.ok) { setLabel(""); setAmount(""); onAdded() }
      else onError(res.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="block text-xs text-zinc-400">Line
        <input className={`${INPUT} mt-1 min-w-[12rem]`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Bank cash (Mercury)" />
      </label>
      <label className="block text-xs text-zinc-400">Amount (USD)
        <input className={`${INPUT} mt-1`} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <Button size="sm" variant="ghost" disabled={disabled || busy || !label.trim()} onClick={add}>+ add line</Button>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const cls = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-white"
  return <div className="rounded-lg border border-zinc-800 p-3"><div className="text-xs text-zinc-500">{label}</div><div className={`mt-1 text-lg font-semibold ${cls}`}>{value}</div></div>
}
