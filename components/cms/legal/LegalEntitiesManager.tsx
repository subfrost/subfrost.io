"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { legalEntitiesAction, createEntityAction } from "@/actions/cms/legal"
import {
  LEGAL_ENTITY_CATEGORIES, LEGAL_ENTITY_CATEGORY_LABELS,
  type LegalEntityRow, type LegalEntityCategory, type LegalEntityKind, type LegalScope,
} from "@/lib/financials/legal/shapes"

const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const CAT_CLS: Record<LegalEntityCategory, string> = {
  FUNDED_INVESTOR: "bg-emerald-900/40 text-emerald-300",
  DESERTER: "bg-amber-900/40 text-amber-300",
  VOID_NONFUNDER: "bg-red-900/40 text-red-300",
  COUNTERPARTY: "bg-sky-900/40 text-sky-300",
  EMPLOYEE: "bg-indigo-900/40 text-indigo-300",
}

type Linkables = {
  users: { id: string; name: string | null; email: string }[]
  shareholders: { id: string; name: string }[]
  payees: { id: string; name: string }[]
}

export function LegalEntitiesManager({ initial, canEdit, users, shareholders, payees }: {
  initial: LegalEntityRow[]
  canEdit: boolean
} & Linkables) {
  const [entities, setEntities] = useState(initial)
  const [filter, setFilter] = useState<LegalEntityCategory | "ALL">("ALL")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await legalEntitiesAction()
      if (res.ok) setEntities(res.entities)
    })
  }, [])

  const counts = useMemo(() => {
    const m = new Map<LegalEntityCategory, number>()
    for (const e of entities) m.set(e.category, (m.get(e.category) ?? 0) + 1)
    return m
  }, [entities])

  const shown = useMemo(
    () => (filter === "ALL" ? entities : entities.filter((e) => e.category === filter)),
    [entities, filter],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>All ({entities.length})</FilterChip>
        {LEGAL_ENTITY_CATEGORIES.map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {LEGAL_ENTITY_CATEGORY_LABELS[c]} ({counts.get(c) ?? 0})
          </FilterChip>
        ))}
        {canEdit && <Button size="sm" className="ml-auto" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "New entity"}</Button>}
      </div>

      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}<button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

      {canEdit && adding && (
        <NewEntityForm
          users={users} shareholders={shareholders} payees={payees}
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); refresh() }}
          onError={setError}
        />
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">No entities in this view.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
              <tr><th className="px-3 py-2">Name</th><th>Category</th><th>Scope</th><th>Linked to</th><th className="text-right">Agreements</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-t border-zinc-900 hover:bg-zinc-900/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/legal/entities/${e.id}`} className="font-medium text-white hover:underline">{e.name}</Link>
                    <span className="ml-2 rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">{e.kind}</span>
                  </td>
                  <td><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CAT_CLS[e.category]}`}>{LEGAL_ENTITY_CATEGORY_LABELS[e.category]}</span></td>
                  <td className="text-xs text-zinc-400">{e.scope}</td>
                  <td className="text-xs text-zinc-400">
                    {e.userName ? `user: ${e.userName}` : e.payeeName ? `payee: ${e.payeeName}` : e.shareholderName ? `holder: ${e.shareholderName}` : "—"}
                  </td>
                  <td className="text-right text-zinc-300">{e.agreementCount}</td>
                  <td className="px-3 text-right"><Link href={`/admin/legal/entities/${e.id}`} className="text-xs text-sky-400 hover:underline">Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewEntityForm({ users, shareholders, payees, onSaved, onCancel, onError }: Linkables & {
  onSaved: () => void; onCancel: () => void; onError: (m: string) => void
}) {
  const [name, setName] = useState("")
  const [kind, setKind] = useState<LegalEntityKind>("PERSON")
  const [category, setCategory] = useState<LegalEntityCategory>("COUNTERPARTY")
  const [scope, setScope] = useState<LegalScope>("SUBFROST")
  const [email, setEmail] = useState("")
  const [userId, setUserId] = useState("")
  const [payeeId, setPayeeId] = useState("")
  const [shareholderId, setShareholderId] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return onError("Name is required.")
    setBusy(true)
    try {
      const res = await createEntityAction({
        name: name.trim(), kind, category, scope,
        email: email.trim() || null, userId: userId || null,
        payeeId: payeeId || null, shareholderId: shareholderId || null,
      })
      if (res.ok) onSaved()
      else onError(res.error)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-white">New legal entity</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Kind">
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as LegalEntityKind)}>
            <option value="PERSON">Person</option><option value="ORG">Organization</option>
          </select>
        </Field>
        <Field label="Email"><input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Category">
          <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value as LegalEntityCategory)}>
            {LEGAL_ENTITY_CATEGORIES.map((c) => <option key={c} value={c}>{LEGAL_ENTITY_CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
        <Field label="Scope">
          <select className={INPUT} value={scope} onChange={(e) => setScope(e.target.value as LegalScope)}>
            <option value="SUBFROST">SUBFROST</option><option value="OYL">OYL</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Link team member">
          <select className={INPUT} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— none —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
          </select>
        </Field>
        <Field label="Link payee">
          <select className={INPUT} value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
            <option value="">— none —</option>
            {payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Link shareholder">
          <select className={INPUT} value={shareholderId} onChange={(e) => setShareholderId(e.target.value)}>
            <option value="">— none —</option>
            {shareholders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button disabled={busy || !name.trim()} onClick={submit}>{busy ? "Saving…" : "Add entity"}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? "bg-sky-700 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>{children}</button>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-zinc-400">{label}<div className="mt-1">{children}</div></label>
}
