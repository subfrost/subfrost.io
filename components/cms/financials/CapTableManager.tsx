"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { SkeletonTable } from "@/components/cms/Skeleton"
import {
  equityOverviewAction, seedCommonStockAction,
  createShareClassAction, deleteShareClassAction,
  createShareholderAction, deleteShareholderAction,
  createHoldingAction, deleteHoldingAction,
} from "@/actions/cms/equity"
import {
  summarizeCapTable,
  type ShareClassRow, type ShareholderRow, type ShareHoldingRow, type ShareClassType, type HolderType,
} from "@/lib/financials/equity/shapes"

const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const num = (n: number) => n.toLocaleString("en-US")

export function CapTableManager() {
  const [classes, setClasses] = useState<ShareClassRow[]>([])
  const [shareholders, setShareholders] = useState<ShareholderRow[]>([])
  const [holdings, setHoldings] = useState<ShareHoldingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await equityOverviewAction()
    if (res.ok) {
      setClasses(res.overview.classes)
      setShareholders(res.overview.shareholders)
      setHoldings(res.overview.holdings)
      setError(null)
    } else setError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const cap = useMemo(() => summarizeCapTable(classes, holdings), [classes, holdings])
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn()
      if (r.ok) fetchData()
      else setError(r.error ?? "Error")
    })

  if (loading) return <SkeletonTable />

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}<button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Issued shares" value={num(cap.issuedShares)} />
        <Metric label="Authorized shares" value={num(cap.authorizedShares)} />
        <Metric label="Shareholders" value={num(cap.byHolder.length)} />
      </div>

      {/* Ownership */}
      <Section title="Ownership (issued basis)">
        {cap.byHolder.length === 0 ? <Empty>No holdings yet.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Shareholder</th><th className="text-right">Shares</th><th className="text-right">Ownership</th></tr></thead>
            <tbody>
              {cap.byHolder.map((h) => (
                <tr key={h.shareholderId} className="border-t border-zinc-900">
                  <td className="py-2 text-zinc-200">{h.name}</td>
                  <td className="text-right text-zinc-300">{num(h.shares)}</td>
                  <td className="text-right text-zinc-300">{h.ownershipPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Share classes */}
      <Section title="Share classes">
        {classes.length === 0 && (
          <div className="mb-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => seedCommonStockAction())}>Seed Common Stock (10,000,000)</Button>
          </div>
        )}
        {cap.byClass.length > 0 && (
          <table className="mb-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Class</th><th>Type</th><th className="text-right">Authorized</th><th className="text-right">Issued</th><th></th></tr></thead>
            <tbody>
              {cap.byClass.map((c) => (
                <tr key={c.shareClassId} className="border-t border-zinc-900">
                  <td className="py-2 text-zinc-200">{c.name}</td>
                  <td className="text-xs text-zinc-400">{c.type}</td>
                  <td className="text-right text-zinc-300">{num(c.authorizedShares)}</td>
                  <td className="text-right text-zinc-300">{num(c.issuedShares)}</td>
                  <td className="text-right"><button disabled={pending} onClick={() => run(() => deleteShareClassAction(c.shareClassId))} className="text-xs text-zinc-500 hover:text-red-300">delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <AddClassForm disabled={pending} onAdd={(input) => run(() => createShareClassAction(input))} />
      </Section>

      {/* Shareholders */}
      <Section title="Shareholders">
        {shareholders.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {shareholders.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-b border-zinc-900 py-1.5">
                <span className="text-zinc-200">{s.name} <span className="text-xs text-zinc-500">· {s.type}{s.email ? ` · ${s.email}` : ""}</span></span>
                <button disabled={pending} onClick={() => run(() => deleteShareholderAction(s.id))} className="text-xs text-zinc-500 hover:text-red-300">delete</button>
              </li>
            ))}
          </ul>
        )}
        <AddShareholderForm disabled={pending} onAdd={(input) => run(() => createShareholderAction(input))} />
      </Section>

      {/* Holdings */}
      <Section title="Holdings">
        {holdings.length > 0 && (
          <table className="mb-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Shareholder</th><th>Class</th><th className="text-right">Shares</th><th>Issued</th><th></th></tr></thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id} className="border-t border-zinc-900">
                  <td className="py-2 text-zinc-200">{h.shareholderName}</td>
                  <td className="text-xs text-zinc-400">{h.shareClassName}</td>
                  <td className="text-right text-zinc-300">{num(h.shares)}</td>
                  <td className="text-zinc-400">{h.issuedAt.slice(0, 10)}</td>
                  <td className="text-right"><button disabled={pending} onClick={() => run(() => deleteHoldingAction(h.id))} className="text-xs text-zinc-500 hover:text-red-300">delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {classes.length > 0 && shareholders.length > 0 ? (
          <AddHoldingForm classes={classes} shareholders={shareholders} disabled={pending} onAdd={(input) => run(() => createHoldingAction(input))} />
        ) : (
          <p className="text-xs text-zinc-500">Add at least one share class and one shareholder to record a holding.</p>
        )}
      </Section>
    </div>
  )
}

function AddClassForm({ onAdd, disabled }: { onAdd: (i: { name: string; type: ShareClassType; authorizedShares: number; parValue?: number | null }) => void; disabled: boolean }) {
  const [name, setName] = useState("")
  const [type, setType] = useState<ShareClassType>("COMMON")
  const [authorized, setAuthorized] = useState("")
  const [par, setPar] = useState("")
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Name"><input className={`${INPUT} min-w-[10rem]`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Common Stock" /></Field>
      <Field label="Type"><select className={INPUT} value={type} onChange={(e) => setType(e.target.value as ShareClassType)}><option value="COMMON">Common</option><option value="PREFERRED">Preferred</option></select></Field>
      <Field label="Authorized"><input className={INPUT} type="number" value={authorized} onChange={(e) => setAuthorized(e.target.value)} /></Field>
      <Field label="Par value"><input className={INPUT} type="number" step="0.0001" value={par} onChange={(e) => setPar(e.target.value)} /></Field>
      <Button size="sm" disabled={disabled || !name.trim() || !authorized} onClick={() => { onAdd({ name, type, authorizedShares: Number(authorized) || 0, parValue: par ? Number(par) : null }); setName(""); setAuthorized(""); setPar("") }}>Add class</Button>
    </div>
  )
}

function AddShareholderForm({ onAdd, disabled }: { onAdd: (i: { name: string; type: HolderType; email?: string | null }) => void; disabled: boolean }) {
  const [name, setName] = useState("")
  const [type, setType] = useState<HolderType>("PERSON")
  const [email, setEmail] = useState("")
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Name"><input className={`${INPUT} min-w-[10rem]`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Type"><select className={INPUT} value={type} onChange={(e) => setType(e.target.value as HolderType)}><option value="PERSON">Person</option><option value="ENTITY">Entity</option></select></Field>
      <Field label="Email"><input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Button size="sm" disabled={disabled || !name.trim()} onClick={() => { onAdd({ name, type, email: email.trim() || null }); setName(""); setEmail("") }}>Add holder</Button>
    </div>
  )
}

function AddHoldingForm({ classes, shareholders, onAdd, disabled }: {
  classes: ShareClassRow[]; shareholders: ShareholderRow[]
  onAdd: (i: { shareholderId: string; shareClassId: string; shares: number; issuedAt: string }) => void; disabled: boolean
}) {
  const [shareholderId, setShareholderId] = useState(shareholders[0]?.id ?? "")
  const [shareClassId, setShareClassId] = useState(classes[0]?.id ?? "")
  const [shares, setShares] = useState("")
  const [issuedAt, setIssuedAt] = useState("")
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Shareholder"><select className={INPUT} value={shareholderId} onChange={(e) => setShareholderId(e.target.value)}>{shareholders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Class"><select className={INPUT} value={shareClassId} onChange={(e) => setShareClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Shares"><input className={INPUT} type="number" value={shares} onChange={(e) => setShares(e.target.value)} /></Field>
      <Field label="Issued"><input className={INPUT} type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></Field>
      <Button size="sm" disabled={disabled || !shares || !issuedAt} onClick={() => { onAdd({ shareholderId, shareClassId, shares: Number(shares) || 0, issuedAt: new Date(issuedAt).toISOString() }); setShares("") }}>Add holding</Button>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-zinc-800 p-3"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 text-lg font-semibold text-white">{value}</div></div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><h2 className="mb-3 text-sm font-semibold text-white">{title}</h2>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-zinc-400">{label}<div className="mt-1">{children}</div></label>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>
}
