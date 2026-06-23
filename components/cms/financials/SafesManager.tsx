"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SkeletonTable } from "@/components/cms/Skeleton"
import {
  equityOverviewAction,
  createInstrumentAction,
  updateInstrumentAction,
  deleteInstrumentAction,
  listLinkableEnvelopesAction,
  type LinkableEnvelope,
} from "@/actions/cms/equity"
import {
  INSTRUMENT_TYPES, INSTRUMENT_TYPE_LABELS, SAFE_LIKE, TOKEN_LIKE, summarizeInstruments,
  type InstrumentRow, type InstrumentType, type InstrumentStatus, type SafeKind, type ShareholderRow,
} from "@/lib/financials/equity/shapes"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const STATUS_CLS: Record<InstrumentStatus, string> = {
  OUTSTANDING: "bg-sky-900/40 text-sky-300",
  CONVERTED: "bg-emerald-900/40 text-emerald-300",
  CANCELLED: "bg-zinc-800 text-zinc-400",
}

export function SafesManager() {
  const [instruments, setInstruments] = useState<InstrumentRow[]>([])
  const [shareholders, setShareholders] = useState<ShareholderRow[]>([])
  const [envelopes, setEnvelopes] = useState<LinkableEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<InstrumentRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ov, env] = await Promise.all([equityOverviewAction(), listLinkableEnvelopesAction()])
    if (ov.ok) {
      setInstruments(ov.overview.instruments)
      setShareholders(ov.overview.shareholders)
      setError(null)
    } else setError(ov.error)
    if (env.ok) setEnvelopes(env.envelopes)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const summary = useMemo(() => summarizeInstruments(instruments), [instruments])

  const setStatus = (i: InstrumentRow, status: InstrumentStatus) =>
    startTransition(async () => {
      const res = await updateInstrumentAction(i.id, { status })
      if (res.ok) fetchData()
      else setError(res.error)
    })

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteInstrumentAction(id)
      if (res.ok) fetchData()
      else setError(res.error)
    })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="SAFE / note raised" value={usd(summary.totalSafeRaisedUsd)} />
        <Metric label="Implied SAFE ownership" value={`${summary.impliedSafeOwnershipPct}%`} />
        <Metric label="Token agreements %" value={`${summary.totalTokenPct}%`} />
        <Metric label="Outstanding total" value={usd(summary.totalOutstandingUsd)} />
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => { setAdding((v) => !v); setEditing(null) }}>{adding ? "Close" : "New instrument"}</Button>
        <span className="text-xs text-zinc-500">{instruments.length} instrument(s)</span>
      </div>

      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}<button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

      {(adding || editing) && (
        <InstrumentForm
          key={editing?.id ?? "new"}
          existing={editing}
          shareholders={shareholders}
          envelopes={envelopes}
          onCancel={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); fetchData() }}
          onError={setError}
        />
      )}

      {loading ? <SkeletonTable /> : instruments.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">No instruments yet.</div>
      ) : (
        <ul className="space-y-2">
          {instruments.map((i) => (
            <li key={i.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{i.investorName}</span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">{INSTRUMENT_TYPE_LABELS[i.type]}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[i.status]}`}>{i.status}</span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    {usd(i.amountUsd)}
                    {i.valuationCap ? ` · cap ${usd(i.valuationCap)}` : ""}
                    {i.discountRate ? ` · ${Math.round(i.discountRate * 100)}% disc` : ""}
                    {i.tokenPct ? ` · ${i.tokenPct}% supply` : ""}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    signed {i.signedAt.slice(0, 10)}
                    {i.shareholderName ? ` · ${i.shareholderName}` : ""}
                    {i.mfn ? " · MFN" : ""}{i.proRata ? " · pro-rata" : ""}
                  </div>
                  <div className="mt-1 flex gap-3 text-xs">
                    {i.pdfUrl && <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">Signed PDF</a>}
                    {i.envelopeId && <Link href={`/admin/documents/${i.envelopeId}`} className="text-sky-400 underline">E-sign doc</Link>}
                    {!i.pdfUrl && !i.envelopeId && <span className="text-zinc-600">no document attached</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(i); setAdding(false) }}>Edit</Button>
                  {i.status === "OUTSTANDING" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus(i, "CONVERTED")}>Converted</Button>}
                  {i.status !== "CANCELLED" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus(i, "CANCELLED")}>Cancel</Button>}
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" disabled={pending} onClick={() => remove(i.id)}>Delete</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InstrumentForm({
  existing, shareholders, envelopes, onSaved, onCancel, onError,
}: {
  existing: InstrumentRow | null
  shareholders: ShareholderRow[]
  envelopes: LinkableEnvelope[]
  onSaved: () => void
  onCancel: () => void
  onError: (m: string) => void
}) {
  const [type, setType] = useState<InstrumentType>(existing?.type ?? "SAFE")
  const [status, setStatus] = useState<InstrumentStatus>(existing?.status ?? "OUTSTANDING")
  const [investorName, setInvestorName] = useState(existing?.investorName ?? "")
  const [investorEntity, setInvestorEntity] = useState(existing?.investorEntity ?? "")
  const [investorEmail, setInvestorEmail] = useState(existing?.investorEmail ?? "")
  const [shareholderId, setShareholderId] = useState(existing?.shareholderId ?? "")
  const [amountUsd, setAmountUsd] = useState(existing ? String(existing.amountUsd) : "")
  const [signedAt, setSignedAt] = useState(existing?.signedAt.slice(0, 10) ?? "")
  const [safeKind, setSafeKind] = useState<SafeKind>(existing?.safeKind ?? "POST_MONEY")
  const [valuationCap, setValuationCap] = useState(existing?.valuationCap != null ? String(existing.valuationCap) : "")
  const [discountPct, setDiscountPct] = useState(existing?.discountRate != null ? String(Math.round(existing.discountRate * 100)) : "")
  const [mfn, setMfn] = useState(existing?.mfn ?? false)
  const [proRata, setProRata] = useState(existing?.proRata ?? false)
  const [tokenPct, setTokenPct] = useState(existing?.tokenPct != null ? String(existing.tokenPct) : "")
  const [pdfUrl, setPdfUrl] = useState(existing?.pdfUrl ?? "")
  const [envelopeId, setEnvelopeId] = useState(existing?.envelopeId ?? "")
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  const isSafe = SAFE_LIKE.has(type)
  const isToken = TOKEN_LIKE.has(type)

  async function uploadPdf(file: File) {
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

  async function submit() {
    if (!investorName.trim()) return onError("Investor name is required.")
    if (!signedAt) return onError("Signed date is required.")
    setBusy(true)
    try {
      const input = {
        type, status, investorName: investorName.trim(),
        investorEntity: investorEntity.trim() || null, investorEmail: investorEmail.trim() || null,
        shareholderId: shareholderId || null, amountUsd: Number(amountUsd) || 0,
        signedAt: new Date(signedAt).toISOString(),
        safeKind: isSafe ? safeKind : null,
        valuationCap: isSafe && valuationCap ? Number(valuationCap) : null,
        discountRate: isSafe && discountPct ? Number(discountPct) / 100 : null,
        mfn, proRata,
        tokenPct: isToken && tokenPct ? Number(tokenPct) : null,
        pdfUrl: pdfUrl || null, envelopeId: envelopeId || null, notes: notes.trim() || null,
      }
      const res = existing
        ? await updateInstrumentAction(existing.id, input)
        : await createInstrumentAction(input)
      if (res.ok) onSaved()
      else onError(res.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-white">{existing ? "Edit instrument" : "New instrument"}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type">
          <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as InstrumentType)}>
            {INSTRUMENT_TYPES.map((t) => <option key={t} value={t}>{INSTRUMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value as InstrumentStatus)}>
            <option value="OUTSTANDING">Outstanding</option>
            <option value="CONVERTED">Converted</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </Field>
        <Field label="Amount (USD)"><input className={INPUT} type="number" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Investor name"><input className={INPUT} value={investorName} onChange={(e) => setInvestorName(e.target.value)} /></Field>
        <Field label="Entity (optional)"><input className={INPUT} value={investorEntity} onChange={(e) => setInvestorEntity(e.target.value)} /></Field>
        <Field label="Email (optional)"><input className={INPUT} value={investorEmail} onChange={(e) => setInvestorEmail(e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Signed date"><input className={INPUT} type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></Field>
        <Field label="Cap-table shareholder (optional)">
          <select className={INPUT} value={shareholderId} onChange={(e) => setShareholderId(e.target.value)}>
            <option value="">— none —</option>
            {shareholders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>

      {isSafe && (
        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 sm:grid-cols-4">
          <Field label="SAFE kind">
            <select className={INPUT} value={safeKind} onChange={(e) => setSafeKind(e.target.value as SafeKind)}>
              <option value="POST_MONEY">Post-money</option>
              <option value="PRE_MONEY">Pre-money</option>
            </select>
          </Field>
          <Field label="Valuation cap (USD)"><input className={INPUT} type="number" value={valuationCap} onChange={(e) => setValuationCap(e.target.value)} /></Field>
          <Field label="Discount %"><input className={INPUT} type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} /></Field>
          <div className="flex items-end gap-3 text-xs text-zinc-400">
            <label className="flex items-center gap-1"><input type="checkbox" checked={mfn} onChange={(e) => setMfn(e.target.checked)} /> MFN</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={proRata} onChange={(e) => setProRata(e.target.checked)} /> Pro-rata</label>
          </div>
        </div>
      )}

      {isToken && (
        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 sm:grid-cols-2">
          <Field label="Token allocation (% of supply)"><input className={INPUT} type="number" value={tokenPct} onChange={(e) => setTokenPct(e.target.value)} /></Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Signed contract PDF">
          <div className="flex items-center gap-2">
            {pdfUrl ? <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-sky-400 underline">View</a> : <span className="text-xs text-zinc-500">none</span>}
            <label className="cursor-pointer rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
              <input type="file" accept="application/pdf" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])} />
              {uploading ? "Uploading…" : pdfUrl ? "Replace" : "Upload"}
            </label>
            {pdfUrl && <button type="button" onClick={() => setPdfUrl("")} className="text-xs text-zinc-500 hover:text-red-300">clear</button>}
          </div>
        </Field>
        <Field label="…or link an e-sign document">
          <select className={INPUT} value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)}>
            <option value="">— none —</option>
            {envelopes.map((e) => <option key={e.id} value={e.id}>{e.subject} ({e.status})</option>)}
          </select>
        </Field>
      </div>

      <Field label="Notes"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

      <div className="flex gap-2">
        <Button disabled={busy || !investorName.trim()} onClick={submit}>{busy ? "Saving…" : existing ? "Save" : "Add instrument"}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-zinc-400">{label}<div className="mt-1">{children}</div></label>
}
