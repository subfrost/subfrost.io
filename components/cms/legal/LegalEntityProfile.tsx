"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil, FileText, Download, Loader2 } from "lucide-react"
import {
  entityProfileAction, updateEntityAction, createAgreementAction, deleteAgreementAction,
  upsertDeserterAction, upsertObligationAction,
} from "@/actions/cms/legal"
import { listEntityFilesAction, getFileUrlAction, unlinkEntityFileAction } from "@/actions/cms/files"
import type { EntityFileView } from "@/lib/files/manager"
import { DocTypeBadge } from "@/components/cms/files/DocTypeBadge"
import { explorerTxUrl } from "@/lib/explorers"
import {
  LEGAL_ENTITY_CATEGORY_LABELS, LEGAL_AGREEMENT_TYPES, LEGAL_AGREEMENT_TYPE_LABELS,
  SWAP_STATUS_LABELS, DESERTION_STATUS_LABELS, dieselFromSafe, swapEligible,
  type LegalEntityProfile as ProfileData, type LegalAgreementType,
  type LegalAgreementStatus, type LegalScope, type DesertionStatus, type SwapStatus, type OylFunding,
} from "@/lib/financials/legal/shapes"

const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const num = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }))
const usd = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }))
const short = (s: string, n = 8) => (s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-4)}` : s)
const AGR_STATUS_CLS: Record<LegalAgreementStatus, string> = {
  DRAFT: "bg-zinc-800 text-zinc-400", SENT: "bg-sky-900/40 text-sky-300",
  SIGNED: "bg-emerald-900/40 text-emerald-300", VOID: "bg-red-900/40 text-red-300",
}

type Linkables = {
  users: { id: string; name: string | null; email: string }[]
  shareholders: { id: string; name: string }[]
  payees: { id: string; name: string }[]
}

export function LegalEntityProfile({ profile: initial, canEdit, viewerHasFinancials, users, shareholders, payees }: {
  profile: ProfileData
  canEdit: boolean
  viewerHasFinancials: boolean
} & Linkables) {
  const [profile, setProfile] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const { entity, agreements } = profile
  const linkedPayee = entity.payeeId

  function run(p: Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const r = await p
      if (!r.ok) { setError(r.error ?? "Failed"); return }
      after?.()
      const fresh = await entityProfileAction(entity.id)
      if (fresh.ok) setProfile(fresh.profile)
    })
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/legal" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={14} /> Back to Legal
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{entity.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">{entity.kind}</span>
            <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">{LEGAL_ENTITY_CATEGORY_LABELS[entity.category]}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{entity.scope}</span>
            {entity.email ? <span className="text-xs text-zinc-500">{entity.email}</span> : null}
          </div>
        </div>
        {canEdit && (
          <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
            <Pencil size={13} /> {editing ? "Close" : "Edit"}
          </button>
        )}
      </div>

      {error ? <p className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {canEdit && editing && (
        <EditEntityForm
          entity={entity} users={users} shareholders={shareholders} payees={payees} disabled={pending}
          onSave={(patch) => run(updateEntityAction(entity.id, patch), () => setEditing(false))}
        />
      )}

      {/* Links */}
      <Section title="Identity links">
        <div className="grid gap-3 sm:grid-cols-3">
          <LinkCard label="Team member" value={entity.userName} href={null} />
          <LinkCard label="Payee" value={entity.payeeName} href={linkedPayee ? `/admin/financials/payees/${linkedPayee}` : null} />
          <LinkCard label="Shareholder" value={entity.shareholderName} href={null} />
        </div>
      </Section>

      {/* Deserter card */}
      {(entity.category === "DESERTER" || entity.deserter) && (
        <DeserterCard entity={entity} canEdit={canEdit} disabled={pending}
          onSave={(p) => run(upsertDeserterAction(entity.id, p))} />
      )}

      {/* Obligation card */}
      {(entity.category === "FUNDED_INVESTOR" || entity.category === "VOID_NONFUNDER" || entity.obligation) && (
        <ObligationCard entity={entity} canEdit={canEdit} disabled={pending} viewerHasFinancials={viewerHasFinancials}
          onSave={(p) => run(upsertObligationAction(entity.id, p))} />
      )}

      {/* Agreements */}
      <Section title={`Agreements (${agreements.length})`}>
        {canEdit && <AddAgreement entityId={entity.id} scope={entity.scope} disabled={pending}
          onAdd={(input) => run(createAgreementAction(input))} />}
        {agreements.length === 0 ? (
          <Empty>No agreements recorded for this entity.</Empty>
        ) : (
          <ul className="space-y-2">
            {agreements.map((a) => (
              <li key={a.id} className="flex items-start justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{a.title}</span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{LEGAL_AGREEMENT_TYPE_LABELS[a.type]}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${AGR_STATUS_CLS[a.status]}`}>{a.status}</span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{a.scope}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {a.counterpartyName ? `${a.counterpartyName} · ` : ""}{a.signedAt ? `signed ${a.signedAt.slice(0, 10)}` : "unsigned"}
                    {a.notes ? ` · ${a.notes}` : ""}
                  </div>
                  <div className="mt-1 flex gap-3 text-xs">
                    {a.pdfUrl && <a href={a.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">Signed PDF</a>}
                    {a.envelopeId && <Link href={`/admin/documents/${a.envelopeId}`} className="text-sky-400 underline">E-sign doc</Link>}
                  </div>
                </div>
                {canEdit && <button disabled={pending} onClick={() => run(deleteAgreementAction(a.id))} className="text-xs text-zinc-500 hover:text-red-300">Delete</button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Linked documents (the file↔entity graph, from the drive ingest) */}
      <EntityDocuments entityId={entity.id} canEdit={canEdit} onError={setError} />
    </div>
  )
}

const DOC_ROLE_LABEL: Record<string, string> = {
  SIGNATORY: "Signatory", COUNTERPARTY: "Counterparty", SUBJECT: "Subject", MENTIONED: "Mentioned",
}

function EntityDocuments({ entityId, canEdit, onError }: {
  entityId: string; canEdit: boolean; onError: (m: string) => void
}) {
  const [docs, setDocs] = useState<EntityFileView[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDocs(null)
    listEntityFilesAction(entityId).then((r) => {
      if (r.ok) setDocs(r.files)
      else { onError(r.error); setDocs([]) }
    })
  }, [entityId, onError])

  const download = async (fileId: string) => {
    const r = await getFileUrlAction(fileId, true)
    if (r.ok) window.open(r.url, "_blank", "noopener")
    else onError(r.error)
  }
  const unlink = async (linkId: string) => {
    setBusy(true)
    const r = await unlinkEntityFileAction(linkId)
    setBusy(false)
    if (r.ok) setDocs((cur) => (cur ?? []).filter((d) => d.id !== linkId))
    else onError(r.error)
  }

  return (
    <Section title={`Documents${docs ? ` (${docs.length})` : ""}`}>
      {docs === null ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 size={13} className="animate-spin" /> Loading…</div>
      ) : docs.length === 0 ? (
        <Empty>No documents linked to this entity yet. Link them from the Documents drive (file → Entities &amp; signatories).</Empty>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={15} className="shrink-0 text-zinc-500" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-zinc-200">{d.file.name}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                    <span className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">{DOC_ROLE_LABEL[d.role] ?? d.role}</span>
                    {(d.file.docType || d.file.docStatus) && <DocTypeBadge docType={d.file.docType} docStatus={d.file.docStatus} />}
                    <span>{d.file.scope}</span>
                    {d.annotation && <span className="truncate italic">{d.annotation}</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button aria-label="Download" onClick={() => download(d.file.id)} className="inline-flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><Download size={14} /></button>
                {canEdit && <button onClick={() => unlink(d.id)} disabled={busy} className="text-xs text-zinc-500 hover:text-red-300">Unlink</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function DeserterCard({ entity, canEdit, onSave, disabled }: {
  entity: ProfileData["entity"]; canEdit: boolean
  onSave: (p: Parameters<typeof upsertDeserterAction>[1]) => void; disabled: boolean
}) {
  const d = entity.deserter
  const [open, setOpen] = useState(false)
  const eligible = d ? swapEligible(d) : false
  return (
    <Section title="Deserter — equity swap → DIESEL">
      <div className="rounded-lg border border-amber-900/30 bg-amber-950/10 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Vest status" value={d ? DESERTION_STATUS_LABELS[d.desertedVest] : "—"} />
          <Stat label="OYL allocation" value={d?.oylTokenPct != null ? `${num(d.oylTokenPct)}%` : "—"} />
          <Stat label="Swap equity" value={d?.deserterEquityPct != null ? `${num(d.deserterEquityPct)}%` : "—"} />
          <Stat label="DIESEL converted" value={num(d?.dieselConverted)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-medium text-zinc-300">{d ? SWAP_STATUS_LABELS[d.swapStatus] : "Not started"}</span>
          <SignBadge label="Arca" on={!!d?.arcaSignedOff} />
          <SignBadge label="Alec" on={!!d?.alecSignedOff} />
          {eligible && <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 font-medium text-emerald-300">swap-ready</span>}
        </div>
        {canEdit && (
          <div className="mt-3">
            <button onClick={() => setOpen((v) => !v)} className="text-xs text-sky-400 hover:underline">{open ? "Close editor" : "Edit deserter terms"}</button>
            {open && <DeserterForm d={d} disabled={disabled} onSave={(p) => { onSave(p); setOpen(false) }} />}
          </div>
        )}
      </div>
    </Section>
  )
}

function DeserterForm({ d, onSave, disabled }: {
  d: ProfileData["entity"]["deserter"]
  onSave: (p: Parameters<typeof upsertDeserterAction>[1]) => void; disabled: boolean
}) {
  const [desertedVest, setDesertedVest] = useState<DesertionStatus>(d?.desertedVest ?? "UNDECIDED")
  const [swapStatus, setSwapStatus] = useState<SwapStatus>(d?.swapStatus ?? "NOT_STARTED")
  const [oylRole, setOylRole] = useState(d?.oylRole ?? "")
  const [oylTokenPct, setOylTokenPct] = useState(d?.oylTokenPct != null ? String(d.oylTokenPct) : "")
  const [equityPct, setEquityPct] = useState(d?.deserterEquityPct != null ? String(d.deserterEquityPct) : "")
  const [diesel, setDiesel] = useState(d?.dieselConverted != null ? String(d.dieselConverted) : "")
  const [arca, setArca] = useState(d?.arcaSignedOff ?? false)
  const [alec, setAlec] = useState(d?.alecSignedOff ?? false)
  const [notes, setNotes] = useState(d?.notes ?? "")
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 duration-200 animate-in fade-in slide-in-from-top-1 sm:grid-cols-3">
      <Field label="Vest status">
        <select className={INPUT} value={desertedVest} onChange={(e) => setDesertedVest(e.target.value as DesertionStatus)}>
          <option value="UNDECIDED">Undecided</option><option value="RETAINED">Retained vest</option><option value="DESERTED">Deserted vest</option>
        </select>
      </Field>
      <Field label="Swap status">
        <select className={INPUT} value={swapStatus} onChange={(e) => setSwapStatus(e.target.value as SwapStatus)}>
          {(Object.keys(SWAP_STATUS_LABELS) as SwapStatus[]).map((s) => <option key={s} value={s}>{SWAP_STATUS_LABELS[s]}</option>)}
        </select>
      </Field>
      <Field label="OYL role"><input className={INPUT} value={oylRole} onChange={(e) => setOylRole(e.target.value)} /></Field>
      <Field label="OYL allocation %"><input className={INPUT} type="number" value={oylTokenPct} onChange={(e) => setOylTokenPct(e.target.value)} /></Field>
      <Field label="Swap equity %"><input className={INPUT} type="number" value={equityPct} onChange={(e) => setEquityPct(e.target.value)} /></Field>
      <Field label="DIESEL converted"><input className={INPUT} type="number" value={diesel} onChange={(e) => setDiesel(e.target.value)} /></Field>
      <div className="flex items-end gap-4 text-xs text-zinc-400">
        <label className="flex items-center gap-1"><input type="checkbox" checked={arca} onChange={(e) => setArca(e.target.checked)} /> Arca signed</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={alec} onChange={(e) => setAlec(e.target.checked)} /> Alec signed</label>
      </div>
      <div className="sm:col-span-3"><Field label="Notes"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      <div className="sm:col-span-3">
        <button disabled={disabled} onClick={() => onSave({
          desertedVest, swapStatus, oylRole: oylRole.trim() || null,
          oylTokenPct: oylTokenPct ? Number(oylTokenPct) : null,
          deserterEquityPct: equityPct ? Number(equityPct) : null,
          dieselConverted: diesel ? Number(diesel) : null,
          arcaSignedOff: arca, alecSignedOff: alec, notes: notes.trim() || null,
        })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Save deserter terms</button>
      </div>
    </div>
  )
}

function ObligationCard({ entity, canEdit, onSave, disabled, viewerHasFinancials }: {
  entity: ProfileData["entity"]; canEdit: boolean; viewerHasFinancials: boolean
  onSave: (p: Parameters<typeof upsertObligationAction>[1]) => void; disabled: boolean
}) {
  const o = entity.obligation
  const [open, setOpen] = useState(false)
  return (
    <Section title="OYL obligation — funded SAFE → DIESEL">
      <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Funding" value={o?.funding === "UNFUNDED_VOID" ? "Void (unfunded)" : o ? "Funded" : "—"} />
          <Stat label="Purchase" value={usd(o?.purchaseUsd)} />
          <Stat label="DIESEL owed" value={num(o?.dieselOwed)} />
          <Stat label="Claimable now" value={num(o?.dieselClaimable)} />
        </div>
        {o?.onchainTxid ? (
          <div className="mt-3 text-xs text-zinc-400">
            On-chain:{" "}
            <a href={explorerTxUrl("ethereum", o.onchainTxid)} target="_blank" rel="noreferrer" className="font-mono text-sky-400 underline">{short(o.onchainTxid)}</a>
            {o.fundedAt ? ` · ${o.fundedAt.slice(0, 10)}` : ""}{viewerHasFinancials && o.onchainAddress ? ` · ${short(o.onchainAddress)}` : ""}
          </div>
        ) : <div className="mt-3 text-xs text-zinc-600">No on-chain settlement recorded.</div>}
        {o?.vestingNote ? <div className="mt-1 text-xs text-zinc-500">{o.vestingNote}</div> : null}
        {canEdit && (
          <div className="mt-3">
            <button onClick={() => setOpen((v) => !v)} className="text-xs text-sky-400 hover:underline">{open ? "Close editor" : "Edit obligation"}</button>
            {open && <ObligationForm o={o} disabled={disabled} onSave={(p) => { onSave(p); setOpen(false) }} />}
          </div>
        )}
      </div>
    </Section>
  )
}

function ObligationForm({ o, onSave, disabled }: {
  o: ProfileData["entity"]["obligation"]
  onSave: (p: Parameters<typeof upsertObligationAction>[1]) => void; disabled: boolean
}) {
  const [funding, setFunding] = useState<OylFunding>(o?.funding ?? "FUNDED")
  const [purchaseUsd, setPurchaseUsd] = useState(o?.purchaseUsd != null ? String(o.purchaseUsd) : "")
  const [valuationCap, setValuationCap] = useState(o?.valuationCap != null ? String(o.valuationCap) : "")
  const [dieselOwed, setDieselOwed] = useState(o?.dieselOwed != null ? String(o.dieselOwed) : "")
  const [dieselClaimable, setDieselClaimable] = useState(o?.dieselClaimable != null ? String(o.dieselClaimable) : "")
  const [onchainTxid, setOnchainTxid] = useState(o?.onchainTxid ?? "")
  const [onchainAddress, setOnchainAddress] = useState(o?.onchainAddress ?? "")
  const [fundedAt, setFundedAt] = useState(o?.fundedAt ? o.fundedAt.slice(0, 10) : "")
  const [vestingNote, setVestingNote] = useState(o?.vestingNote ?? "")
  const derived = dieselFromSafe(Number(purchaseUsd) || 0, Number(valuationCap) || 0)
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 duration-200 animate-in fade-in slide-in-from-top-1 sm:grid-cols-3">
      <Field label="Funding">
        <select className={INPUT} value={funding} onChange={(e) => setFunding(e.target.value as OylFunding)}>
          <option value="FUNDED">Funded</option><option value="UNFUNDED_VOID">Void (unfunded)</option>
        </select>
      </Field>
      <Field label="Purchase (USD)"><input className={INPUT} type="number" value={purchaseUsd} onChange={(e) => setPurchaseUsd(e.target.value)} /></Field>
      <Field label="Valuation cap (USD)"><input className={INPUT} type="number" value={valuationCap} onChange={(e) => setValuationCap(e.target.value)} /></Field>
      <Field label={`DIESEL owed${derived ? ` (formula: ${num(derived)})` : ""}`}>
        <div className="flex gap-2">
          <input className={INPUT} type="number" value={dieselOwed} onChange={(e) => setDieselOwed(e.target.value)} />
          {derived > 0 && <button type="button" onClick={() => setDieselOwed(String(derived))} className="whitespace-nowrap rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800">use formula</button>}
        </div>
      </Field>
      <Field label="Claimable now"><input className={INPUT} type="number" value={dieselClaimable} onChange={(e) => setDieselClaimable(e.target.value)} /></Field>
      <Field label="Funded at"><input className={INPUT} type="date" value={fundedAt} onChange={(e) => setFundedAt(e.target.value)} /></Field>
      <Field label="On-chain txid"><input className={INPUT} value={onchainTxid} onChange={(e) => setOnchainTxid(e.target.value)} /></Field>
      <Field label="On-chain address"><input className={INPUT} value={onchainAddress} onChange={(e) => setOnchainAddress(e.target.value)} /></Field>
      <div className="sm:col-span-3"><Field label="Vesting note"><input className={INPUT} value={vestingNote} onChange={(e) => setVestingNote(e.target.value)} /></Field></div>
      <div className="sm:col-span-3">
        <button disabled={disabled} onClick={() => onSave({
          funding, purchaseUsd: purchaseUsd ? Number(purchaseUsd) : null,
          valuationCap: valuationCap ? Number(valuationCap) : null,
          dieselOwed: dieselOwed ? Number(dieselOwed) : 0,
          dieselClaimable: dieselClaimable ? Number(dieselClaimable) : 0,
          onchainTxid: onchainTxid.trim() || null, onchainAddress: onchainAddress.trim() || null,
          fundedAt: fundedAt ? new Date(fundedAt).toISOString() : null, vestingNote: vestingNote.trim() || null,
        })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Save obligation</button>
      </div>
    </div>
  )
}

function AddAgreement({ entityId, scope, onAdd, disabled }: {
  entityId: string; scope: LegalScope
  onAdd: (input: Parameters<typeof createAgreementAction>[0]) => void; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<LegalAgreementType>("OTHER")
  const [status, setStatus] = useState<LegalAgreementStatus>("DRAFT")
  const [counterparty, setCounterparty] = useState("")
  const [signedAt, setSignedAt] = useState("")
  const [pdfUrl, setPdfUrl] = useState("")
  if (!open) return <button onClick={() => setOpen(true)} className="mb-2 text-xs text-sky-400 hover:underline">+ Add agreement</button>
  return (
    <div className="mb-3 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 duration-200 animate-in fade-in slide-in-from-top-1 sm:grid-cols-3">
      <Field label="Title"><input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Type">
        <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as LegalAgreementType)}>
          {LEGAL_AGREEMENT_TYPES.map((t) => <option key={t} value={t}>{LEGAL_AGREEMENT_TYPE_LABELS[t]}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value as LegalAgreementStatus)}>
          <option value="DRAFT">Draft</option><option value="SENT">Sent</option><option value="SIGNED">Signed</option><option value="VOID">Void</option>
        </select>
      </Field>
      <Field label="Counterparty"><input className={INPUT} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></Field>
      <Field label="Signed date"><input className={INPUT} type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></Field>
      <Field label="PDF URL"><input className={INPUT} value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} /></Field>
      <div className="sm:col-span-3 flex gap-2">
        <button disabled={disabled || !title.trim()} onClick={() => { onAdd({
          entityId, type, status, title: title.trim(), scope,
          counterpartyName: counterparty.trim() || null,
          signedAt: signedAt ? new Date(signedAt).toISOString() : null, pdfUrl: pdfUrl.trim() || null,
        }); setOpen(false); setTitle("") }} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Add</button>
        <button onClick={() => setOpen(false)} className="text-sm text-zinc-400">Cancel</button>
      </div>
    </div>
  )
}

function EditEntityForm({ entity, users, shareholders, payees, onSave, disabled }: Linkables & {
  entity: ProfileData["entity"]
  onSave: (patch: Parameters<typeof updateEntityAction>[1]) => void; disabled: boolean
}) {
  const [name, setName] = useState(entity.name)
  const [email, setEmail] = useState(entity.email ?? "")
  const [userId, setUserId] = useState(entity.userId ?? "")
  const [payeeId, setPayeeId] = useState(entity.payeeId ?? "")
  const [shareholderId, setShareholderId] = useState(entity.shareholderId ?? "")
  const [notes, setNotes] = useState(entity.notes ?? "")
  return (
    <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 duration-200 animate-in fade-in slide-in-from-top-1 sm:grid-cols-3">
      <Field label="Name"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Email"><input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <div />
      <Field label="Team member">
        <select className={INPUT} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">— none —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
        </select>
      </Field>
      <Field label="Payee">
        <select className={INPUT} value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
          <option value="">— none —</option>{payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Shareholder">
        <select className={INPUT} value={shareholderId} onChange={(e) => setShareholderId(e.target.value)}>
          <option value="">— none —</option>{shareholders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-3"><Field label="Notes"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      <div className="sm:col-span-3">
        <button disabled={disabled || !name.trim()} onClick={() => onSave({
          name: name.trim(), email: email.trim() || null, userId: userId || null,
          payeeId: payeeId || null, shareholderId: shareholderId || null, notes: notes.trim() || null,
        })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Save</button>
      </div>
    </div>
  )
}

function LinkCard({ label, value, href }: { label: string; value: string | null; href: string | null }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm text-zinc-200">
        {value ? (href ? <Link href={href} className="text-sky-400 hover:underline">{value}</Link> : value) : <span className="text-zinc-600">not linked</span>}
      </div>
    </div>
  )
}
function SignBadge({ label, on }: { label: string; on: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${on ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}>{on ? "✓" : "○"} {label}</span>
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-zinc-500">{label}</div><div className="mt-0.5 text-base font-semibold text-white">{value}</div></div>
}
function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="block text-xs text-zinc-400">{label}<div className="mt-1">{children}</div></label>
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-300"><FileText size={14} className="text-zinc-500" />{title}</div><div className="space-y-2">{children}</div></div>
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">{children}</p>
}
