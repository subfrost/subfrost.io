"use client"

import { useState, useTransition } from "react"
import { treasuryOverviewAction, type TreasuryResult } from "@/actions/cms/financials"
import { AddressCell } from "./AddressCell"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })
const amt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 6 })

export function TreasuryManager({ initial }: { initial: TreasuryResult }) {
  const [result, setResult] = useState<TreasuryResult>(initial)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => setResult(await treasuryOverviewAction({ refresh: true })))
  }

  if (!result.ok) {
    const msg =
      result.error === "not_configured"
        ? "Treasury data source is not configured (GOLDRUSH_API_KEY missing)."
        : result.error === "upstream"
          ? "Treasury data is temporarily unavailable. Try again shortly."
          : "You do not have access to financials."
    return <p className="text-sm text-zinc-400">{msg}</p>
  }

  const { snapshot, stale } = result
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold text-white">{usd(snapshot.grandTotalUsd)}</div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Total across {snapshot.wallets.length} wallet(s)</span>
            {stale ? (
              <span className="rounded bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                cached
              </span>
            ) : null}
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={pending}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {snapshot.wallets.map((w) => (
        <div key={w.address} className="rounded-lg border border-zinc-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <AddressCell address={w.address} label={w.label} className="min-w-0" />
            <div className="shrink-0 text-lg font-semibold text-white">{usd(w.totalUsd)}</div>
          </div>
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5">Token</th><th className="text-right">Amount</th><th className="text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {w.tokens.map((t) => (
                <tr key={t.contract} className="border-t border-zinc-900">
                  <td data-label="Token" className="py-1.5 text-zinc-200">
                    {t.symbol}
                    {t.isNative ? <span className="ml-1 text-[10px] text-zinc-500">native</span> : null}
                  </td>
                  <td data-label="Amount" className="py-1.5 text-right text-zinc-400">{amt(t.amount)}</td>
                  <td data-label="USD" className="py-1.5 text-right text-zinc-200">
                    {t.usd === null ? "—" : usd(t.usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
