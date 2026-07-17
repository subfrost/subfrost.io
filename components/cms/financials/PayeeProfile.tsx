"use client"

import { useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil, Link2, Unlink, FileText, ShieldCheck } from "lucide-react"
import { payeeProfileAction, updatePayeeAction, type LinkableUser, type LinkableKycIntake } from "@/actions/cms/accounting"
import type { InvoiceStatus, PayeeProfile as PayeeProfileData, PayeeType } from "@/lib/financials/accounting/shapes"
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

type Patch = Parameters<typeof updatePayeeAction>[1]

export function PayeeProfile({ profile: initial, linkableUsers, linkableKycIntakes }: { profile: PayeeProfileData; linkableUsers: LinkableUser[]; linkableKycIntakes: LinkableKycIntake[] }) {
  const [profile, setProfile] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { payee, user, kyc, invoices, payments, envelopes, totals } = profile
  const { values: usdValues } = useDieselUsd(payments)

  // Split USD by how the invoice settled. USD-denominated invoices (amountDiesel
  // == null) contribute to the headline "Paid (USD)"; DIESEL-denominated invoices
  // instead surface two numbers under "Paid (DIESEL)": the manually-invoiced USD
  // face value, and the market value (spot USD of the DIESEL that settled them,
  // i.e. the sum of the invoices table's USD column).
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  let paidUsdOnly = 0
  let invoicedUsd = 0
  let marketUsd = 0
  for (const i of invoices) {
    if (i.amountDiesel != null) {
      invoicedUsd += i.amountUsd
      marketUsd += sumSettlingUsd(payments.filter((p) => p.invoiceId === i.id), usdValues) ?? 0
    } else if (i.status === "PAID") {
      paidUsdOnly += i.amountUsd
    }
  }

  function run(patch: Patch, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const r = await updatePayeeAction(payee.id, patch)
      if (!r.ok) { setError(r.error); return }
      after?.()
      const fresh = await payeeProfileAction(payee.id)
      if (fresh.ok) setProfile(fresh.profile)
    })
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/financials/accounting" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={14} /> Back to Accounting
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{payee.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">{payee.type}</span>
            {kyc ? <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">KYC: {kyc.status}</span> : null}
          </div>
        </div>
        <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
          <Pencil size={13} /> {editing ? "Close" : "Edit"}
        </button>
      </div>

      {error ? <p className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {editing ? <EditForm payee={payee} disabled={pending} onSave={(patch) => run(patch, () => setEditing(false))} /> : null}

      <UserCard user={user} linkableUsers={linkableUsers} disabled={pending}
        onLink={(userId) => run({ userId })} onUnlink={() => run({ userId: null })} />

      <KycCard kyc={kyc} linkableKycIntakes={linkableKycIntakes} disabled={pending}
        onLink={(kycIntakeId) => run({ kycIntakeId })} onUnlink={() => run({ kycIntakeId: null })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Paid (USD)" value={usd(paidUsdOnly)} />
        <Metric label="Paid (DIESEL)" value={dsl(totals.totalDiesel)}>
          <div className="mt-1.5 space-y-0.5 text-xs">
            <div className="flex items-baseline justify-between gap-2"><span className="text-zinc-500">Invoiced $:</span><span className="text-zinc-300">{usd(invoicedUsd)}</span></div>
            <div className="flex items-baseline justify-between gap-2"><span className="text-zinc-500">Market $:</span><span className="text-zinc-300">{`~${usd(marketUsd)}`}</span></div>
          </div>
        </Metric>
        <Metric label="Invoices" value={String(totals.invoiceCount)} />
        <Metric label="Open invoices" value={String(invoices.filter((i) => i.status === "OPEN").length)} />
      </div>

      <AgreementCard url={payee.agreementUrl} disabled={pending}
        onUploaded={(agreementUrl) => run({ agreementUrl })} onClear={() => run({ agreementUrl: null })} onError={setError} />

      <Section title={`Payments (${payments.length})`}>
        {payments.length === 0 ? <Empty>No DIESEL payments tied to this payee.</Empty> : (
          <table className="w-full text-sm rtable">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Invoice</th><th>Txid</th><th>Date</th><th className="text-right">DIESEL Paid</th><th className="text-right">USD Paid</th><th className="text-right">Market Price</th></tr></thead>
            <tbody>
              {payments.map((p) => {
                const priced = usdValues[p.id]
                // "USD Paid" only applies to payments settled in USD. A payment is
                // USD-denominated when the invoice it settled is (amountDiesel == null);
                // DIESEL settlements show "—" (their USD is under Market Price instead).
                const settledInvoice = p.invoiceId != null ? invoiceById.get(p.invoiceId) : undefined
                const usdPaid = settledInvoice && settledInvoice.amountDiesel == null ? settledInvoice.amountUsd : null
                return (
                  <tr key={p.id} className="border-t border-zinc-900">
                    <td data-label="Invoice" className="py-2 text-zinc-300">{p.invoiceRef ?? "—"}</td>
                    <td data-label="Txid" className="font-mono text-xs text-zinc-300"><a href={explorerTxUrl("bitcoin", p.txid)} target="_blank" rel="noreferrer" className="underline">{short(p.txid)}</a></td>
                    <td data-label="Date" className="text-zinc-400">{p.paidAt.slice(0, 10)}</td>
                    <td data-label="DIESEL Paid" className="text-right text-zinc-200">{p.amountDiesel.toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                    <td data-label="USD Paid" className="text-right text-zinc-200">{usdPaid == null ? <span className="text-zinc-600">—</span> : usd(usdPaid)}</td>
                    <td data-label="Market Price" className="text-right text-zinc-200">{priced ? approxUsd(priced.paymentUsd) : <span className="text-zinc-600">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Invoices (${invoices.length})`}>
        {invoices.length === 0 ? <Empty>No invoices for this payee.</Empty> : (
          <table className="w-full text-sm rtable">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Ref</th><th className="text-right">USD</th><th>Status</th><th>Settled by</th><th>PDF</th></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const settling = payments.filter((p) => p.invoiceId === i.id)
                const valuedUsd = i.amountDiesel != null ? sumSettlingUsd(settling, usdValues) : null
                return (
                  <tr key={i.id} className="border-t border-zinc-900">
                    <td data-label="Ref" className="py-2 font-mono text-zinc-300">{i.ref}</td>
                    <td data-label="USD" className="text-right text-zinc-200">{i.amountDiesel != null ? (valuedUsd == null ? <span className="text-zinc-600">—</span> : approxUsd(valuedUsd)) : usd(i.amountUsd)}</td>
                    <td data-label="Status"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                    <td data-label="Settled by" className="font-mono text-xs text-zinc-400">{settling.length === 0 ? "—" : settling.map((p) => <a key={p.id} href={explorerTxUrl("bitcoin", p.txid)} target="_blank" rel="noreferrer" className="mr-1 underline">{short(p.txid)}</a>)}</td>
                    <td data-label="PDF">{i.docHref ? <Link href={i.docHref} className="text-sky-400 underline">PDF</Link> : i.pdfUrl ? <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">PDF</a> : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Signed paperwork (${envelopes.length})`}>
        {envelopes.length === 0 ? (
          <Empty>
            No e-sign documents linked to this payee.{" "}
            <Link href="/admin/documents" className="text-sky-400 underline">Send one →</Link>
          </Empty>
        ) : (
          <table className="w-full text-sm rtable">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Document</th><th>Kind</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {envelopes.map((e) => (
                <tr key={e.id} className="border-t border-zinc-900">
                  <td data-label="Document" className="py-2 text-zinc-200"><Link href={`/admin/documents/${e.id}`} className="text-sky-400 hover:underline">{e.subject}</Link></td>
                  <td data-label="Kind" className="text-xs text-zinc-400">{e.kind}</td>
                  <td data-label="Status"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${e.status === "completed" ? "bg-emerald-900/40 text-emerald-300" : e.status === "declined" || e.status === "voided" || e.status === "expired" ? "bg-red-900/40 text-red-300" : "bg-sky-900/40 text-sky-300"}`}>{e.status}</span></td>
                  <td data-label="Created" className="text-zinc-400">{e.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function EditForm({ payee, onSave, disabled }: {
  payee: PayeeProfileData["payee"]
  onSave: (patch: { name: string; type: PayeeType; notes: string | null }) => void
  disabled: boolean
}) {
  const [name, setName] = useState(payee.name)
  const [type, setType] = useState<PayeeType>(payee.type)
  const [notes, setNotes] = useState(payee.notes ?? "")
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as PayeeType)}>
            <option value="PERSON">Person</option>
            <option value="ORG">Organization</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button disabled={disabled || !name.trim()} onClick={() => onSave({ name, type, notes: notes.trim() || null })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Save</button>
    </div>
  )
}

function UserCard({ user, linkableUsers, onLink, onUnlink, disabled }: {
  user: PayeeProfileData["user"]; linkableUsers: LinkableUser[]
  onLink: (userId: string) => void; onUnlink: () => void; disabled: boolean
}) {
  const [sel, setSel] = useState("")
  if (user) {
    return (
      <div className="flex items-start justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-start gap-3">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="h-12 w-12 rounded-full bg-zinc-800" />}
          <div>
            <div className="font-semibold text-white">{user.name ?? user.email}</div>
            <div className="text-xs text-zinc-500">{user.email} · {user.role}</div>
            {user.bio ? <p className="mt-1 max-w-md text-sm text-zinc-400">{user.bio}</p> : null}
            {user.status ? <p className="mt-0.5 text-xs text-zinc-500">{user.status}</p> : null}
          </div>
        </div>
        <button disabled={disabled} onClick={onUnlink} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40"><Unlink size={12} /> Unlink</button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-zinc-800 p-4">
      <span className="inline-flex items-center gap-1 text-sm text-zinc-400"><Link2 size={13} /> Link to a team member:</span>
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100">
        <option value="">Select a user…</option>
        {linkableUsers.map((u) => <option key={u.id} value={u.id}>{(u.name ?? u.email)} ({u.email})</option>)}
      </select>
      <button disabled={disabled || !sel} onClick={() => onLink(sel)} className="rounded bg-sky-700 px-2 py-1 text-sm text-white disabled:opacity-40">Link</button>
    </div>
  )
}

function KycCard({ kyc, linkableKycIntakes, onLink, onUnlink, disabled }: {
  kyc: PayeeProfileData["kyc"]; linkableKycIntakes: LinkableKycIntake[]
  onLink: (id: string) => void; onUnlink: () => void; disabled: boolean
}) {
  const [sel, setSel] = useState("")
  if (kyc) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span className="text-zinc-200">{kyc.customerName}</span>
          <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">{kyc.status}</span>
        </div>
        <button disabled={disabled} onClick={onUnlink} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40"><Unlink size={12} /> Unlink KYC</button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-zinc-800 p-4">
      <span className="inline-flex items-center gap-1 text-sm text-zinc-400"><ShieldCheck size={13} /> Link a KYC identity:</span>
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100">
        <option value="">Select a KYC intake…</option>
        {linkableKycIntakes.map((k) => <option key={k.id} value={k.id}>{k.customerName} ({k.status})</option>)}
      </select>
      <button disabled={disabled || !sel} onClick={() => onLink(sel)} className="rounded bg-sky-700 px-2 py-1 text-sm text-white disabled:opacity-40">Link</button>
    </div>
  )
}

function AgreementCard({ url, onUploaded, onClear, onError, disabled }: {
  url: string | null; onUploaded: (url: string) => void; onClear: () => void; onError: (m: string) => void; disabled: boolean
}) {
  const [uploading, setUploading] = useState(false)
  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/upload-pdf", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")
      onUploaded(json.url)
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <span className="inline-flex items-center gap-1 text-sm text-zinc-300"><FileText size={14} /> Contract / agreement</span>
      {url ? <a href={url} target="_blank" rel="noreferrer" className="text-sky-400 underline">View PDF</a> : <span className="text-sm text-zinc-500">None attached</span>}
      <label className="cursor-pointer text-xs text-zinc-400">
        <input type="file" accept="application/pdf" className="hidden" disabled={disabled || uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <span className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800">{uploading ? "Uploading…" : url ? "Replace" : "Upload"}</span>
      </label>
      {url ? <button disabled={disabled} onClick={onClear} className="text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40">Remove</button> : null}
    </div>
  )
}

function Metric({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {children}
    </div>
  )
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-zinc-400">{label}<div className="mt-1">{children}</div></label>
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><div className="mb-2 text-sm font-semibold text-zinc-300">{title}</div><div className="space-y-2">{children}</div></div>
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">{children}</p>
}
