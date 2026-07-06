"use client"

import Link from "next/link"
import { useState, useTransition, type ReactNode } from "react"
import {
  accountingOverviewAction, createInvoiceAction, createPayeeAction,
  exportLedgerCsvAction, linkPaymentAction, recordPaymentAction, updateInvoiceStatusAction,
  type AccountingOverviewResult,
} from "@/actions/cms/accounting"
import {
  totalsByPayee, totalsByPeriod, periodReportCsv, type InvoiceRow, type InvoiceStatus,
  type PayeeRow, type PayeeType, type PaymentRow, type PeriodGranularity,
} from "@/lib/financials/accounting/shapes"
import { PeriodReportChart } from "@/components/cms/financials/PeriodReportChart"
import { explorerTxUrl } from "@/lib/explorers"
import { useDieselUsd, sumSettlingUsd } from "@/components/cms/financials/use-diesel-usd"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })
const approxUsd = (n: number) => `~${n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`
const dsl = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 8 })} DIESEL`
const short = (s: string, n = 8) => (s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-4)}` : s)

const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const STATUS_STYLE: Record<InvoiceStatus, string> = {
  OPEN: "bg-sky-900/40 text-sky-300",
  PAID: "bg-emerald-900/40 text-emerald-300",
  VOID: "bg-zinc-800 text-zinc-400",
}

type View = "invoices" | "payees" | "payments" | "reports"

export function AccountingManager({ initial }: { initial: AccountingOverviewResult }) {
  const [result, setResult] = useState<AccountingOverviewResult>(initial)
  const [view, setView] = useState<View>("invoices")
  const [open, setOpen] = useState<null | "payee" | "invoice" | "payment">(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { values: usdValues } = useDieselUsd(result.ok ? result.overview.payments : [])

  if (!result.ok) {
    return <p className="text-sm text-zinc-400">You do not have access to financials.</p>
  }

  const { payees, invoices, payments, metrics } = result.overview
  const payeeById = new Map(payees.map((p) => [p.id, p]))
  const unlinked = payments.filter((p) => p.invoiceId === null)
  const openInvoices = invoices.filter((i) => i.status === "OPEN")
  const payeeTotals = totalsByPayee(payees, invoices, payments)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? "Action failed")
      else {
        setOpen(null)
        setResult(await accountingOverviewAction())
      }
    })
  }

  async function exportCsv() {
    const r = await exportLedgerCsvAction()
    if (!r.ok) {
      setError(r.error)
      return
    }
    const blob = new Blob([r.value], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "accounting-ledger.csv"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total paid (USD)" value={usd(metrics.totalPaidUsd)} />
        <Metric label="Total paid (DIESEL)" value={dsl(metrics.totalPaidDiesel)} />
        <Metric label="Open invoices" value={String(metrics.openInvoices)} />
        <Metric label="Unlinked payments" value={String(metrics.unlinkedPayments)} accent={metrics.unlinkedPayments > 0} />
      </div>

      {error ? <p className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {unlinked.length > 0 ? (
        <div className="rounded-lg border border-yellow-800/60 bg-yellow-900/10 p-4">
          <div className="mb-2 text-sm font-semibold text-yellow-300">
            {unlinked.length} unlinked payment(s) — tie each to an invoice
          </div>
          <div className="space-y-2">
            {unlinked.map((p) => (
              <UnlinkedRow
                key={p.id}
                payment={p}
                openInvoices={openInvoices}
                disabled={pending}
                onLink={(invoiceId) => run(() => linkPaymentAction(p.id, invoiceId))}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["invoices", "payees", "payments", "reports"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Toolbtn onClick={() => setOpen("payee")}>New payee</Toolbtn>
          <Toolbtn onClick={() => setOpen("invoice")}>New invoice</Toolbtn>
          <Toolbtn onClick={() => setOpen("payment")}>Record payment</Toolbtn>
          <Toolbtn onClick={exportCsv}>Export CSV</Toolbtn>
        </div>
      </div>

      {open === "payee" ? (
        <PayeeForm disabled={pending} onCancel={() => setOpen(null)} onSubmit={(input) => run(() => createPayeeAction(input))} />
      ) : null}
      {open === "invoice" ? (
        <InvoiceForm payees={payees} disabled={pending} onError={setError} onCancel={() => setOpen(null)} onSubmit={(input) => run(() => createInvoiceAction(input))} />
      ) : null}
      {open === "payment" ? (
        <PaymentForm disabled={pending} onCancel={() => setOpen(null)} onSubmit={(input) => run(() => recordPaymentAction(input))} />
      ) : null}

      {view === "invoices" ? (
        invoices.length === 0 ? (
          <Empty>No invoices yet.</Empty>
        ) : (
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5">Ref</th><th>Payee</th><th className="text-right">Value</th><th className="text-right">USD value</th>
                <th>Status</th><th>Settled by</th><th>PDF</th><th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const pe = payeeById.get(i.payeeId)
                const settling = payments.filter((p) => p.invoiceId === i.id)
                const valuedUsd = i.amountDiesel != null ? sumSettlingUsd(settling, usdValues) : null
                return (
                  <tr key={i.id} className="border-t border-zinc-900">
                    <td data-label="Ref" className="py-2 font-mono text-zinc-300">{i.ref}</td>
                    <td data-label="Payee" className="text-zinc-200">{i.payeeName}{pe?.kycIntakeId ? <KycBadge /> : null}</td>
                    <td data-label="Value" className="whitespace-nowrap text-right text-zinc-200">{i.amountDiesel != null ? dsl(i.amountDiesel) : usd(i.amountUsd)}</td>
                    <td data-label="USD value" className="text-right text-zinc-400">{i.amountDiesel != null ? (valuedUsd == null ? <span className="text-zinc-600">—</span> : approxUsd(valuedUsd)) : <span className="text-zinc-600">—</span>}</td>
                    <td data-label="Status"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                    <td data-label="Settled by" className="font-mono text-xs text-zinc-400">
                      {settling.length === 0 ? "—" : settling.map((p) => (
                        <a key={p.id} href={explorerTxUrl("bitcoin", p.txid)} target="_blank" rel="noreferrer" className="mr-1 underline">{short(p.txid)}</a>
                      ))}
                    </td>
                    <td data-label="PDF">{i.docHref ? <Link href={i.docHref} className="text-sky-400 underline">PDF</Link> : i.pdfUrl ? <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">PDF</a> : "—"}</td>
                    <td data-fullwidth className="whitespace-nowrap text-right">
                      {i.status !== "PAID" ? (
                        <button disabled={pending} onClick={() => run(() => updateInvoiceStatusAction(i.id, "PAID"))} className="mr-2 text-xs text-emerald-400 hover:underline disabled:opacity-40">Mark paid</button>
                      ) : null}
                      {i.status !== "VOID" ? (
                        <button disabled={pending} onClick={() => run(() => updateInvoiceStatusAction(i.id, "VOID"))} className="text-xs text-zinc-500 hover:underline disabled:opacity-40">Void</button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      ) : null}

      {view === "payees" ? (
        payees.length === 0 ? (
          <Empty>No payees yet.</Empty>
        ) : (
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5">Name</th><th>Type</th><th className="text-right">Invoices</th>
                <th className="text-right">Paid (USD)</th><th className="text-right">Paid (DIESEL)</th>
              </tr>
            </thead>
            <tbody>
              {payeeTotals.map((t) => {
                const pe = payeeById.get(t.payeeId)
                return (
                  <tr key={t.payeeId} className="border-t border-zinc-900">
                    <td data-label="Name" className="py-2 text-zinc-200">
                      <Link href={`/admin/financials/payees/${t.payeeId}`} className="text-sky-300 hover:underline">{t.payeeName}</Link>
                      {pe?.kycIntakeId ? <KycBadge /> : null}
                    </td>
                    <td data-label="Type" className="text-zinc-400">{pe?.type}</td>
                    <td data-label="Invoices" className="text-right text-zinc-300">{t.invoiceCount}</td>
                    <td data-label="Paid (USD)" className="text-right text-zinc-200">{usd(t.totalUsd)}</td>
                    <td data-label="Paid (DIESEL)" className="text-right text-zinc-200">{dsl(t.totalDiesel)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      ) : null}

      {view === "payments" ? (
        payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5">Txid</th><th className="text-right">DIESEL</th><th className="text-right">USD (at payment)</th><th>Recipient</th>
                <th>Paid</th><th>Invoice</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-zinc-900">
                  <td data-label="Txid" className="py-2 font-mono text-xs text-zinc-300">
                    <a href={explorerTxUrl("bitcoin", p.txid)} target="_blank" rel="noreferrer" className="underline">{short(p.txid)}</a>
                  </td>
                  <td data-label="DIESEL" className="text-right text-zinc-200">{p.amountDiesel.toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                  <td data-label="USD (at payment)" className="text-right text-emerald-400/80" title="USD value at the block this payment settled in">{usdValues[p.id] ? approxUsd(usdValues[p.id].paymentUsd) : <span className="text-zinc-600">—</span>}</td>
                  <td data-label="Recipient" className="font-mono text-xs text-zinc-400">{short(p.recipientAddress)}</td>
                  <td data-label="Paid" className="text-zinc-400">{p.paidAt.slice(0, 10)}</td>
                  <td data-label="Invoice" className="text-zinc-300">{p.invoiceRef ?? <span className="text-yellow-400">unlinked</span>}</td>
                  <td data-label="Source" className="text-zinc-500">{p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {view === "reports" ? <ReportsView payees={payees} invoices={invoices} payments={payments} /> : null}
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-yellow-800/60 bg-yellow-900/10" : "border-zinc-800"}`}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}

function Toolbtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
      {children}
    </button>
  )
}

function KycBadge() {
  return <span className="ml-1.5 rounded bg-emerald-900/40 px-1 py-0.5 text-[9px] font-medium text-emerald-300">KYC</span>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">{children}</p>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function FormShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">{title}</div>
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
      </div>
      {children}
    </div>
  )
}

function UnlinkedRow({ payment, openInvoices, onLink, disabled }: {
  payment: PaymentRow; openInvoices: InvoiceRow[]; onLink: (invoiceId: string) => void; disabled: boolean
}) {
  const [sel, setSel] = useState("")
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-mono text-zinc-400">{short(payment.txid)}</span>
      <span className="text-zinc-300">{payment.amountDiesel} DIESEL</span>
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100">
        <option value="">Link to invoice…</option>
        {openInvoices.map((i) => <option key={i.id} value={i.id}>{i.ref} — {i.payeeName}</option>)}
      </select>
      <button disabled={disabled || !sel} onClick={() => onLink(sel)} className="rounded bg-sky-700 px-2 py-1 text-white disabled:opacity-40">Link</button>
    </div>
  )
}

function ReportsView({ payees, invoices, payments }: {
  payees: PayeeRow[]; invoices: InvoiceRow[]; payments: PaymentRow[]
}) {
  const [granularity, setGranularity] = useState<PeriodGranularity>("month")
  const [payeeId, setPayeeId] = useState("") // "" = all payees
  const filtered = payeeId ? invoices.filter((i) => i.payeeId === payeeId) : invoices
  const rows = totalsByPeriod(filtered, payments, granularity)

  function exportReport() {
    const blob = new Blob([periodReportCsv(rows)], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `accounting-report-${granularity}${payeeId ? `-${payeeId}` : ""}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["month", "quarter", "year"] as PeriodGranularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded-md px-3 py-1.5 text-sm ${granularity === g ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={payeeId}
          onChange={(e) => setPayeeId(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        >
          <option value="">All payees</option>
          {payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="ml-auto"><Toolbtn onClick={exportReport}>Export CSV</Toolbtn></div>
      </div>
      <PeriodReportChart rows={rows} />
      {rows.length === 0 ? (
        <Empty>No invoices to report.</Empty>
      ) : (
        <table className="w-full text-sm rtable">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1.5">Period</th><th className="text-right">Invoices</th>
              <th className="text-right">Issued (USD)</th><th className="text-right">Paid (USD)</th>
              <th className="text-right">DIESEL Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="border-t border-zinc-900">
                <td data-label="Period" className="py-2 font-mono text-zinc-300">{r.period}</td>
                <td data-label="Invoices" className="text-right text-zinc-300">{r.invoiceCount}</td>
                <td data-label="Issued (USD)" className="text-right text-zinc-200">{usd(r.issuedUsd)}</td>
                <td data-label="Paid (USD)" className="text-right text-zinc-200">{usd(r.paidUsd)}</td>
                <td data-label="DIESEL Paid" className="text-right text-zinc-200">{dsl(r.dieselPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function PayeeForm({ onSubmit, onCancel, disabled }: {
  onSubmit: (input: { name: string; type: PayeeType; notes?: string | null }) => void
  onCancel: () => void; disabled: boolean
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<PayeeType>("PERSON")
  const [notes, setNotes] = useState("")
  return (
    <FormShell title="New payee" onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as PayeeType)}>
            <option value="PERSON">Person</option>
            <option value="ORG">Organization</option>
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button disabled={disabled || !name.trim()} onClick={() => onSubmit({ name, type, notes: notes || null })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Create payee</button>
    </FormShell>
  )
}

function InvoiceForm({ payees, onSubmit, onCancel, onError, disabled }: {
  payees: PayeeRow[]
  onSubmit: (input: { ref: string; payeeId: string; description: string; amountUsd: number; amountDiesel?: number | null; issuedAt: string; pdfUrl?: string | null }) => void
  onCancel: () => void; onError: (msg: string) => void; disabled: boolean
}) {
  const [ref, setRef] = useState("")
  const [payeeId, setPayeeId] = useState(payees[0]?.id ?? "")
  const [description, setDescription] = useState("")
  const [amountUsd, setAmountUsd] = useState("")
  const [amountDiesel, setAmountDiesel] = useState("")
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10))
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/upload-pdf", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")
      setPdfUrl(json.url)
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const valid = ref.trim() && payeeId && description.trim() && Number(amountUsd) > 0
  return (
    <FormShell title="New invoice" onCancel={onCancel}>
      {payees.length === 0 ? <p className="text-xs text-yellow-400">Create a payee first.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ref"><input className={INPUT} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="INV-014" /></Field>
        <Field label="Payee">
          <select className={INPUT} value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
            {payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Amount USD"><input className={INPUT} type="number" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} /></Field>
        <Field label="Amount DIESEL (optional)"><input className={INPUT} type="number" value={amountDiesel} onChange={(e) => setAmountDiesel(e.target.value)} /></Field>
        <Field label="Issued"><input className={INPUT} type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></Field>
        <Field label="PDF (optional)"><input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="text-xs text-zinc-400" /></Field>
      </div>
      <Field label="Description"><input className={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {pdfUrl ? <p className="text-xs text-emerald-400">PDF attached ✓</p> : uploading ? <p className="text-xs text-zinc-400">Uploading…</p> : null}
      <button disabled={disabled || uploading || !valid} onClick={() => onSubmit({ ref, payeeId, description, amountUsd: Number(amountUsd), amountDiesel: amountDiesel ? Number(amountDiesel) : null, issuedAt, pdfUrl })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Create invoice</button>
    </FormShell>
  )
}

function PaymentForm({ onSubmit, onCancel, disabled }: {
  onSubmit: (input: { txid: string; vout?: number | null; amountDiesel: number; recipientAddress: string; paidAt: string }) => void
  onCancel: () => void; disabled: boolean
}) {
  const [txid, setTxid] = useState("")
  const [vout, setVout] = useState("")
  const [amountDiesel, setAmountDiesel] = useState("")
  const [recipientAddress, setRecipientAddress] = useState("")
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const valid = txid.trim() && Number(amountDiesel) > 0 && recipientAddress.trim()
  return (
    <FormShell title="Record DIESEL payment" onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Txid"><input className={INPUT} value={txid} onChange={(e) => setTxid(e.target.value)} /></Field>
        <Field label="Vout (optional)"><input className={INPUT} type="number" value={vout} onChange={(e) => setVout(e.target.value)} /></Field>
        <Field label="Amount DIESEL"><input className={INPUT} type="number" value={amountDiesel} onChange={(e) => setAmountDiesel(e.target.value)} /></Field>
        <Field label="Recipient address"><input className={INPUT} value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} /></Field>
        <Field label="Paid at"><input className={INPUT} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
      </div>
      <button disabled={disabled || !valid} onClick={() => onSubmit({ txid, vout: vout ? Number(vout) : null, amountDiesel: Number(amountDiesel), recipientAddress, paidAt })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Record payment</button>
    </FormShell>
  )
}
