"use client"

import { useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowLeft, Pencil, FileSignature, FileText, Download, Fuel, Link2 as LinkIcon,
  ExternalLink, Boxes,
} from "lucide-react"
import { entityDossierAction } from "@/actions/cms/entities"
import { updateEntityAction } from "@/actions/cms/legal"
import { getFileUrlAction } from "@/actions/cms/files"
import {
  LEGAL_ENTITY_CATEGORY_LABELS, SWAP_STATUS_LABELS, DESERTION_STATUS_LABELS,
  type EntityDossier as DossierData, type LegalEntityCategory,
} from "@/lib/financials/legal/shapes"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const dsl = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("en-US", { maximumFractionDigits: 8 })}`)
const short = (s: string, n = 8) => (s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-4)}` : s)

const CAT_CLS: Record<LegalEntityCategory, string> = {
  FUNDED_INVESTOR: "bg-emerald-900/40 text-emerald-300",
  DESERTER: "bg-amber-900/40 text-amber-300",
  VOID_NONFUNDER: "bg-red-900/40 text-red-300",
  COUNTERPARTY: "bg-sky-900/40 text-sky-300",
  EMPLOYEE: "bg-indigo-900/40 text-indigo-300",
}
const STATUS_CLS = (status: string): string =>
  status === "completed" || status === "signed" ? "bg-emerald-900/40 text-emerald-300"
    : status === "declined" || status === "voided" || status === "expired" ? "bg-red-900/40 text-red-300"
      : "bg-sky-900/40 text-sky-300"

type Tab = "overview" | "documents" | "financials" | "onchain" | "fuel"

type Linkables = {
  users: { id: string; name: string | null; email: string }[]
  shareholders: { id: string; name: string }[]
  payees: { id: string; name: string }[]
}

export function EntityDossier({ dossier: initial, canEdit, viewerHasFinancials }: {
  dossier: DossierData
  canEdit: boolean
  viewerHasFinancials: boolean
} & Linkables) {
  const [dossier, setDossier] = useState(initial)
  const [tab, setTab] = useState<Tab>("overview")
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const { entity, payee, docGroups, signedFiles, onchain, fuel } = dossier

  const refresh = () => startTransition(async () => {
    const r = await entityDossierAction(entity.id)
    if (r.ok) setDossier(r.dossier)
  })

  const invoiceCount = payee?.invoices.length ?? 0
  const paymentCount = payee?.payments.length ?? 0
  const docCount = docGroups.reduce((s, g) => s + g.versions.length, 0) + signedFiles.length

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "documents", label: "Documents", badge: docCount },
    { key: "financials", label: "Financials", badge: invoiceCount + paymentCount },
    { key: "onchain", label: "On-chain", badge: onchain.length },
    { key: "fuel", label: "FUEL", badge: fuel.length },
  ]

  return (
    <div className="space-y-6">
      <Link href="/admin/entities" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={14} /> Back to Entities
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{entity.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">{entity.kind}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CAT_CLS[entity.category]}`}>{LEGAL_ENTITY_CATEGORY_LABELS[entity.category]}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{entity.scope}</span>
            {entity.email ? <span className="text-xs text-zinc-500">{entity.email}</span> : null}
          </div>
        </div>
        <Link href="/admin/legal" className="hidden shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 sm:inline-flex">
          <Pencil size={12} /> Legal register
        </Link>
      </div>

      {error ? <p className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "border-sky-500 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            {t.label}
            {t.badge ? <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab dossier={dossier} canEdit={canEdit} viewerHasFinancials={viewerHasFinancials}
          onError={setError} onSaved={refresh} />
      )}
      {tab === "documents" && <DocumentsTab dossier={dossier} onError={setError} />}
      {tab === "financials" && <FinancialsTab dossier={dossier} />}
      {tab === "onchain" && <OnchainTab dossier={dossier} viewerHasFinancials={viewerHasFinancials} />}
      {tab === "fuel" && <FuelTab dossier={dossier} />}
    </div>
  )
}

// ---- Overview -------------------------------------------------------------

function OverviewTab({ dossier, canEdit, viewerHasFinancials, onError, onSaved }: {
  dossier: DossierData; canEdit: boolean; viewerHasFinancials: boolean
  onError: (m: string) => void; onSaved: () => void
}) {
  const { entity, tags, addresses } = dossier
  const linkedPayee = entity.payeeId
  return (
    <div className="space-y-6">
      <Section title="Identity">
        <div className="grid gap-3 sm:grid-cols-3">
          <LinkCard label="Team member" value={entity.userName} href={null} />
          <LinkCard label="Payee" value={entity.payeeName} href={linkedPayee ? `/admin/financials/payees/${linkedPayee}` : null} />
          <LinkCard label="Shareholder" value={entity.shareholderName} href={null} />
        </div>
        {entity.notes ? <p className="mt-3 text-sm text-zinc-400">{entity.notes}</p> : null}
      </Section>

      <TagsAddresses
        entityId={entity.id} tags={tags} addresses={addresses} canEdit={canEdit}
        onError={onError} onSaved={onSaved}
      />

      {entity.deserter && (
        <Section title="Deserter — equity swap → DIESEL">
          <div className="rounded-lg border border-amber-900/30 bg-amber-950/10 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Vest status" value={DESERTION_STATUS_LABELS[entity.deserter.desertedVest]} />
              <Stat label="Swap equity" value={entity.deserter.deserterEquityPct != null ? `${entity.deserter.deserterEquityPct}%` : "—"} />
              <Stat label="DIESEL converted" value={dsl(entity.deserter.dieselConverted)} />
              <Stat label="Swap status" value={SWAP_STATUS_LABELS[entity.deserter.swapStatus]} />
            </div>
          </div>
        </Section>
      )}

      {entity.obligation && (
        <Section title="OYL obligation — funded SAFE → DIESEL">
          <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Funding" value={entity.obligation.funding === "UNFUNDED_VOID" ? "Void" : "Funded"} />
              <Stat label="Purchase" value={entity.obligation.purchaseUsd != null ? usd(entity.obligation.purchaseUsd) : "—"} />
              <Stat label="DIESEL owed" value={dsl(entity.obligation.dieselOwed)} />
              <Stat label="Claimable" value={dsl(entity.obligation.dieselClaimable)} />
            </div>
            {viewerHasFinancials && entity.obligation.onchainAddress ? (
              <div className="mt-2 font-mono text-xs text-zinc-500">{short(entity.obligation.onchainAddress)}</div>
            ) : null}
          </div>
        </Section>
      )}
    </div>
  )
}

function TagsAddresses({ entityId, tags, addresses, canEdit, onError, onSaved }: {
  entityId: string; tags: string[]; addresses: string[]; canEdit: boolean
  onError: (m: string) => void; onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [tagsText, setTagsText] = useState(tags.join(", "))
  const [addrText, setAddrText] = useState(addresses.join("\n"))
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const r = await updateEntityAction(entityId, {
      tags: tagsText.split(",").map((s) => s.trim()).filter(Boolean),
      addresses: addrText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    })
    setBusy(false)
    if (!r.ok) { onError(r.error); return }
    setEditing(false)
    onSaved()
  }

  return (
    <Section title="Tags & addresses">
      {!editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {tags.length === 0 ? <span className="text-sm text-zinc-600">No tags.</span> : tags.map((t) => (
              <span key={t} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{t}</span>
            ))}
          </div>
          <div>
            <div className="mb-1 text-xs text-zinc-500">Addresses (taproot / EVM — used to join FUEL &amp; on-chain)</div>
            {addresses.length === 0 ? (
              <p className="text-sm text-zinc-600">No addresses recorded — FUEL and on-chain joins stay empty until you add one.</p>
            ) : (
              <ul className="space-y-1">
                {addresses.map((a) => <li key={a} className="font-mono text-xs text-zinc-300">{a}</li>)}
              </ul>
            )}
          </div>
          {canEdit && <button onClick={() => setEditing(true)} className="text-xs text-sky-400 hover:underline">Edit tags &amp; addresses</button>}
        </div>
      ) : (
        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <label className="block text-xs text-zinc-400">Tags (comma-separated)
            <input className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
          </label>
          <label className="block text-xs text-zinc-400">Addresses (one per line)
            <textarea rows={3} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100" value={addrText} onChange={(e) => setAddrText(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button disabled={busy} onClick={save} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(false)} className="text-sm text-zinc-400">Cancel</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ---- Documents ------------------------------------------------------------

function DocumentsTab({ dossier, onError }: { dossier: DossierData; onError: (m: string) => void }) {
  const { docGroups, signedFiles } = dossier

  const download = async (fileId: string) => {
    const r = await getFileUrlAction(fileId, true)
    if (r.ok) window.open(r.url, "_blank", "noopener")
    else onError(r.error)
  }

  return (
    <div className="space-y-6">
      <Section title={`E-sign agreements (${docGroups.length})`}>
        {docGroups.length === 0 ? (
          <Empty>No e-sign envelopes linked to this entity. Launch one from the E-Sign tab or a file.</Empty>
        ) : (
          <ul className="space-y-3">
            {docGroups.map((g) => (
              <li key={g.key} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <FileSignature size={14} className="text-zinc-500" />
                  <span className="font-medium text-white">{g.label}</span>
                  {g.versions.length > 1 ? <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{g.versions.length} versions</span> : null}
                </div>
                <ul className="space-y-1">
                  {g.versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={v.href} className="flex min-w-0 items-center gap-2 text-sky-400 hover:underline">
                        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">v{v.version}</span>
                        <span className="truncate">{v.subject || v.kind}</span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS(v.status)}`}>{v.status}</span>
                        <span className="text-[11px] text-zinc-500">{v.createdAt.slice(0, 10)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Signed files (${signedFiles.length})`}>
        {signedFiles.length === 0 ? (
          <Empty>No signed files linked. Link them from the Files drive (file → Entities &amp; signatories).</Empty>
        ) : (
          <ul className="space-y-2">
            {signedFiles.map((f) => (
              <li key={f.linkId} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={15} className="shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-200">{f.name}</div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">{f.role}</span>
                      <span>{f.scope}</span>
                      {f.annotation ? <span className="truncate italic">{f.annotation}</span> : null}
                    </div>
                  </div>
                </div>
                <button aria-label="Download" onClick={() => download(f.fileId)} className="inline-flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><Download size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

// ---- Financials -----------------------------------------------------------

function FinancialsTab({ dossier }: { dossier: DossierData }) {
  const { payee } = dossier
  if (!payee) {
    return (
      <Empty>
        No payee linked to this entity, so there are no invoices or payments to show. Link a payee to this
        entity from the Legal register to surface its accounting here.
      </Empty>
    )
  }
  const { invoices, payments, totals } = payee
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Invoices" value={String(totals.invoiceCount)} />
        <Metric label="Paid (USD)" value={usd(totals.totalUsd)} />
        <Metric label="Paid (DIESEL)" value={dsl(totals.totalDiesel)} />
        <Metric label="Open" value={String(invoices.filter((i) => i.status === "OPEN").length)} />
      </div>

      <Section title={`Invoices (${invoices.length})`}>
        {invoices.length === 0 ? <Empty>No invoices.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Ref</th><th className="text-right">USD</th><th>Status</th><th>PDF</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-zinc-900">
                    <td className="py-2 font-mono text-zinc-300">{i.ref}</td>
                    <td className="text-right text-zinc-200">{usd(i.amountUsd)}</td>
                    <td><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${i.status === "PAID" ? "bg-emerald-900/40 text-emerald-300" : i.status === "OPEN" ? "bg-sky-900/40 text-sky-300" : "bg-zinc-800 text-zinc-400"}`}>{i.status}</span></td>
                    <td>{i.pdfUrl ? <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">PDF</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Payments received (${payments.length})`}>
        {payments.length === 0 ? <Empty>No DIESEL payments settling this entity&apos;s invoices.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Txid</th><th className="text-right">DIESEL</th><th>Paid</th><th>Invoice</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-900">
                    <td className="py-2 font-mono text-xs text-zinc-300">{short(p.txid)}</td>
                    <td className="text-right text-zinc-200">{dsl(p.amountDiesel)}</td>
                    <td className="text-zinc-400">{p.paidAt.slice(0, 10)}</td>
                    <td className="text-zinc-300">{p.invoiceRef ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

// ---- On-chain -------------------------------------------------------------

function OnchainTab({ dossier, viewerHasFinancials }: { dossier: DossierData; viewerHasFinancials: boolean }) {
  const { onchain } = dossier
  if (onchain.length === 0) {
    return <Empty>No on-chain settlement recorded. Add the entity&apos;s addresses or record an OYL obligation txid.</Empty>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
          <tr><th className="px-3 py-2">Source</th><th>Chain</th><th>Tx</th><th className="text-right">Amount</th><th>Date</th>{viewerHasFinancials ? <th>Address</th> : null}</tr>
        </thead>
        <tbody>
          {onchain.map((t) => (
            <tr key={`${t.txid}-${t.source}`} className="border-t border-zinc-900">
              <td className="px-3 py-2 text-zinc-300">{t.source === "OYL_OBLIGATION" ? "OYL SAFE" : "DIESEL payment"}</td>
              <td><span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">{t.chain}</span></td>
              <td className="font-mono text-xs"><a href={t.txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 underline">{short(t.txid)} <ExternalLink size={11} /></a></td>
              <td className="text-right text-zinc-200">{t.amount != null ? `${dsl(t.amount)} ${t.unit ?? ""}`.trim() : "—"}</td>
              <td className="text-zinc-400">{t.date ? t.date.slice(0, 10) : "—"}</td>
              {viewerHasFinancials ? (
                <td className="font-mono text-xs text-zinc-400">{t.address ? (t.addrUrl ? <a href={t.addrUrl} target="_blank" rel="noreferrer" className="underline">{short(t.address)}</a> : short(t.address)) : "—"}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- FUEL -----------------------------------------------------------------

function FuelTab({ dossier }: { dossier: DossierData }) {
  const { fuel, fuelTotal, addresses } = dossier
  if (fuel.length === 0) {
    return (
      <Empty>
        {addresses.length === 0
          ? "No addresses recorded for this entity, so no FUEL can be matched. Add addresses in the Overview tab."
          : "None of this entity's addresses have a FUEL allocation."}
      </Empty>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <Fuel size={16} className="text-amber-400" />
        <span className="text-sm text-zinc-300">Total FUEL across matched addresses</span>
        <span className="ml-auto text-lg font-semibold text-white">{fuelTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
            <tr><th className="px-3 py-2">Address</th><th className="text-right">FUEL</th><th>Note</th></tr>
          </thead>
          <tbody>
            {fuel.map((f) => (
              <tr key={f.address} className="border-t border-zinc-900">
                <td className="px-3 py-2 font-mono text-xs"><a href={f.addrUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">{short(f.address)}</a></td>
                <td className="text-right text-zinc-200">{f.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                <td className="text-zinc-400">{f.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---- shared bits ----------------------------------------------------------

function LinkCard({ label, value, href }: { label: string; value: string | null; href: string | null }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center gap-1 text-xs text-zinc-500"><LinkIcon size={11} /> {label}</div>
      <div className="mt-1 text-sm text-zinc-200">
        {value ? (href ? <Link href={href} className="text-sky-400 hover:underline">{value}</Link> : value) : <span className="text-zinc-600">not linked</span>}
      </div>
    </div>
  )
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-zinc-500">{label}</div><div className="mt-0.5 text-base font-semibold text-white">{value}</div></div>
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-zinc-800 p-3"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 text-lg font-semibold text-white">{value}</div></div>
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-300"><Boxes size={14} className="text-zinc-500" />{title}</div><div className="space-y-2">{children}</div></div>
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">{children}</p>
}
