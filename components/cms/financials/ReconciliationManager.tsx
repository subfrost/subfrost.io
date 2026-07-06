"use client"

import { useMemo, useState } from "react"
import type { InvoiceRow, PaymentRow, InvoiceStatus } from "@/lib/financials/accounting/shapes"
import { explorerTxUrl } from "@/lib/explorers"
import { useDieselUsd } from "./use-diesel-usd"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const dsl = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 })
const short = (s: string, n = 10) => (s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-6)}` : s)
const STATUS_CLS: Record<InvoiceStatus, string> = {
  OPEN: "bg-sky-900/40 text-sky-300", PAID: "bg-emerald-900/40 text-emerald-300", VOID: "bg-zinc-800 text-zinc-400",
}

type Filter = "ALL" | "MATCHED" | "UNMATCHED"

const approxUsd = (n: number) => `~${n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`

export function ReconciliationManager({ invoices, payments }: { invoices: InvoiceRow[]; payments: PaymentRow[] }) {
  const [filter, setFilter] = useState<Filter>("ALL")
  const { values: usdValues } = useDieselUsd(payments)

  const byInvoice = useMemo(() => {
    const m = new Map<string, PaymentRow[]>()
    for (const p of payments) if (p.invoiceId) m.set(p.invoiceId, [...(m.get(p.invoiceId) ?? []), p])
    return m
  }, [payments])

  const unlinked = useMemo(() => payments.filter((p) => !p.invoiceId), [payments])

  const rows = useMemo(() => {
    const enriched = invoices.map((inv) => ({ inv, settling: byInvoice.get(inv.id) ?? [] }))
    if (filter === "MATCHED") return enriched.filter((r) => r.settling.length > 0)
    if (filter === "UNMATCHED") return enriched.filter((r) => r.settling.length === 0)
    return enriched
  }, [invoices, byInvoice, filter])

  const matchedCount = invoices.filter((i) => (byInvoice.get(i.id) ?? []).length > 0).length
  const totalDiesel = payments.reduce((s, p) => s + p.amountDiesel, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Invoices" value={String(invoices.length)} />
        <Metric label="Matched to on-chain" value={`${matchedCount}/${invoices.length}`} />
        <Metric label="Unlinked payments" value={String(unlinked.length)} />
        <Metric label="Total DIESEL settled" value={dsl(totalDiesel)} />
      </div>

      <div className="flex gap-2">
        {(["ALL", "MATCHED", "UNMATCHED"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-sky-700 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>{f.toLowerCase()}</button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[680px] text-sm rtable">
          <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
            <tr><th className="px-3 py-2">Invoice</th><th>Payee</th><th className="text-right">USD</th><th>Status</th><th>Settled by (on-chain DIESEL)</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td data-fullwidth colSpan={5} className="px-3 py-8 text-center text-zinc-500">No invoices in this view.</td></tr>
            ) : rows.map(({ inv, settling }) => (
              <tr key={inv.id} className="border-t border-zinc-900 align-top">
                <td data-label="Invoice" className="px-3 py-2 font-mono text-zinc-300">{inv.ref}</td>
                <td data-label="Payee" className="text-zinc-300">{inv.payeeName}</td>
                <td data-label="USD" className="text-right text-zinc-200">{usd(inv.amountUsd)}</td>
                <td data-label="Status"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[inv.status]}`}>{inv.status}</span></td>
                <td data-label="Settled by" className="py-2">
                  {settling.length === 0 ? <span className="text-zinc-600">— no on-chain match</span> : (
                    <div className="space-y-1">
                      {settling.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 text-xs">
                          <a href={explorerTxUrl("bitcoin", p.txid)} target="_blank" rel="noreferrer" className="font-mono text-sky-400 underline">{short(p.txid)}</a>
                          <span className="text-zinc-300">{dsl(p.amountDiesel)} DIESEL</span>
                          {usdValues[p.id] ? <span className="text-emerald-400/80" title="USD value at the block this payment settled in">{approxUsd(usdValues[p.id].paymentUsd)}</span> : <span className="text-zinc-600">—</span>}
                          <span className="text-zinc-500">{p.paidAt.slice(0, 10)}</span>
                          {p.blockHeight ? <span className="text-zinc-600">#{p.blockHeight}</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unlinked.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold text-zinc-300">Unlinked on-chain payments ({unlinked.length})</div>
          <div className="overflow-x-auto rounded-xl border border-amber-900/30">
            <table className="w-full min-w-[520px] text-sm rtable">
              <thead className="bg-amber-950/20 text-left text-xs text-amber-300/70">
                <tr><th className="px-3 py-2">Txid</th><th className="text-right">DIESEL</th><th className="text-right">USD (at payment)</th><th>Recipient</th><th>Paid</th></tr>
              </thead>
              <tbody>
                {unlinked.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-900">
                    <td data-label="Txid" className="px-3 py-2 font-mono text-xs"><a href={explorerTxUrl("bitcoin", p.txid)} target="_blank" rel="noreferrer" className="text-sky-400 underline">{short(p.txid)}</a></td>
                    <td data-label="DIESEL" className="text-right text-zinc-200">{dsl(p.amountDiesel)}</td>
                    <td data-label="USD (at payment)" className="text-right text-emerald-400/80">{usdValues[p.id] ? approxUsd(usdValues[p.id].paymentUsd) : <span className="text-zinc-600">—</span>}</td>
                    <td data-label="Recipient" className="font-mono text-xs text-zinc-400">{short(p.recipientAddress)}</td>
                    <td data-label="Paid" className="text-zinc-400">{p.paidAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}
