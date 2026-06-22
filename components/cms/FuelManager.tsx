"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { ChevronRight, Flame, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AddressChip } from "@/components/cms/address-profile/AddressProfilePanel"
import {
  listAllocationsAction,
  upsertAllocationsAction,
  deleteAllocationAction,
} from "@/actions/cms/fuel"
import {
  communityOverviewAction,
  communityDetailAction,
  type CommunityDetail,
} from "@/actions/cms/communities"
import type { FuelRow } from "@/lib/fuel/admin"
import type { CommunityOverview, CommunitySummary } from "@/lib/community/aggregate"

const inputCls = "bg-zinc-900 text-zinc-100 border-zinc-700"
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })

export function FuelManager({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="space-y-8">
      <FuelDistribution />
      <AllocationsEditor canEdit={canEdit} />
    </div>
  )
}

// --- Macro stats + community FUEL distribution tree ------------------------

function FuelDistribution() {
  const [ov, setOv] = useState<CommunityOverview | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, CommunityDetail>>({})
  const [, startTransition] = useTransition()

  useEffect(() => {
    communityOverviewAction().then((r) => { if (r.ok) setOv(r.overview) })
  }, [])

  const stats = useMemo(() => {
    if (!ov) return null
    const t = ov.totals
    const top10 = ov.communities.slice(0, 10).reduce((s, c) => s + c.totalFuel, 0)
    return {
      ...t,
      top10Share: t.totalFuelAllocated > 0 ? Math.round((top10 / t.totalFuelAllocated) * 1000) / 10 : 0,
      largest: ov.communities[0],
    }
  }, [ov])

  if (!ov || !stats) return <div className="py-6 text-sm text-zinc-500">Loading FUEL distribution…</div>

  const gross = stats.totalFuelAllocated || 1
  const maxCommunity = Math.max(1, ...ov.communities.map((c) => c.totalFuel))

  function toggle(c: CommunitySummary) {
    if (expanded === c.rootId) { setExpanded(null); return }
    setExpanded(c.rootId)
    if (!details[c.rootId]) startTransition(async () => {
      const r = await communityDetailAction(c.rootId)
      if (r.ok) setDetails((d) => ({ ...d, [c.rootId]: r.detail }))
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total FUEL" value={fmt(stats.totalFuelAllocated)} accent />
        <Stat label="Attributed" value={fmt(stats.attributedFuel)} />
        <Stat label="Unattributed" value={fmt(stats.unattributedFuel)} />
        <Stat label="Communities" value={String(stats.communityCount)} />
        <Stat label="Addresses" value={String(stats.addressCount)} />
        <Stat label="Top-10 share" value={`${stats.top10Share}%`} />
      </div>

      {/* concentration bar: top communities as a share of gross */}
      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-zinc-500">Distribution by community (share of gross)</div>
        <div className="flex h-3 overflow-hidden rounded-full bg-zinc-800">
          {ov.communities.slice(0, 12).map((c, i) => (
            <div key={c.rootId} title={`${c.rootCode}: ${fmt(c.totalFuel)} (${((c.totalFuel / gross) * 100).toFixed(1)}%)`}
              style={{ width: `${(c.totalFuel / gross) * 100}%`, background: `hsl(${(i * 31) % 360} 60% 55%)` }} />
          ))}
        </div>
      </div>

      {/* community FUEL tree */}
      <div className="space-y-1.5">
        {ov.communities.map((c) => (
          <div key={c.rootId} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            <button onClick={() => toggle(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-900/60">
              <ChevronRight size={14} className={`shrink-0 text-zinc-500 transition-transform ${expanded === c.rootId ? "rotate-90" : ""}`} />
              <span className="w-32 shrink-0 truncate font-semibold text-white">{c.rootCode}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full bg-sky-500/70" style={{ width: `${(c.totalFuel / maxCommunity) * 100}%` }} />
              </div>
              <span className="w-28 shrink-0 text-right text-sm text-sky-300">{fmt(c.totalFuel)}</span>
              <span className="hidden w-24 shrink-0 text-right text-xs text-zinc-500 sm:block">{((c.totalFuel / gross) * 100).toFixed(1)}% · {c.memberCount}</span>
            </button>
            {expanded === c.rootId && (
              <div className="border-t border-zinc-800 px-3 py-2">
                {!details[c.rootId] ? <div className="text-xs text-zinc-600">Loading…</div> : (
                  <MemberBars detail={details[c.rootId]} communityTotal={c.totalFuel} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberBars({ detail, communityTotal }: { detail: CommunityDetail; communityTotal: number }) {
  const [limit, setLimit] = useState(50)
  const max = Math.max(1, ...detail.members.map((m) => m.fuel))
  return (
    <div className="space-y-1">
      {detail.members.slice(0, limit).map((m) => (
        <div key={m.address} className="flex items-center gap-2 text-xs">
          <span className="w-56 shrink-0"><AddressChip address={m.address} showLeader={m.isLeader} /></span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-orange-400/70" style={{ width: `${(m.fuel / max) * 100}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right text-sky-300">{fmt(m.fuel)}</span>
          <span className="hidden w-16 shrink-0 text-right text-zinc-500 sm:block">{communityTotal > 0 ? ((m.fuel / communityTotal) * 100).toFixed(1) : "0"}%</span>
        </div>
      ))}
      {detail.members.length > limit && (
        <button onClick={() => setLimit((l) => l + 50)} className="mt-1 text-xs text-sky-400 hover:text-sky-300">Show more ({limit} of {detail.members.length})</button>
      )}
    </div>
  )
}

// --- Allocations editor (collapsible; the original FUEL CRUD) ---------------

interface FormEntry { address: string; amount: string; note: string }
const emptyEntry = (): FormEntry => ({ address: "", amount: "", note: "" })
const FIELD_ORDER: (keyof FormEntry)[] = ["address", "amount", "note"]
type SortKey = "amount" | "note" | "updatedAt"

function AllocationsEditor({ canEdit }: { canEdit: boolean }) {
  const [collapsed, setCollapsed] = useState(true)
  const [rows, setRows] = useState<FuelRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [pending, startTransition] = useTransition()

  const [showForm, setShowForm] = useState(false)
  const [entries, setEntries] = useState<FormEntry[]>([emptyEntry()])
  const [overwrite, setOverwrite] = useState<{ address: string; currentAmount: number }[] | null>(null)
  const [pendingEntries, setPendingEntries] = useState<{ address: string; amount: number; note: string | null }[]>([])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await listAllocationsAction()
    if (res.ok) { setRows(res.allocations); setTotal(res.totalAllocated); setError(null) } else setError(res.error)
    setLoading(false); setLoaded(true)
  }, [])

  function openPanel() {
    setCollapsed(false)
    if (!loaded) fetchRows()
  }

  const resetForm = () => { setShowForm(false); setEntries([emptyEntry()]); setOverwrite(null) }
  const updateEntry = (i: number, field: keyof FormEntry, value: string) =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)))
  const addMore = () => setEntries((prev) => [...prev, ...Array.from({ length: Math.min(9, 10 - prev.length) }, emptyEntry)])
  const removeEntry = (i: number) => setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, field: keyof FormEntry) => {
    const text = e.clipboardData.getData("text/plain")
    if (!text) return
    if (!text.includes("\t") && !text.includes("\n")) { e.preventDefault(); updateEntry(rowIndex, field, text.trim()); return }
    e.preventDefault()
    const pasteRows = text.split(/\r?\n/).filter((l) => l.length > 0)
    const startCol = FIELD_ORDER.indexOf(field)
    setEntries((prev) => {
      const next = [...prev]
      while (next.length < rowIndex + pasteRows.length && next.length < 10) next.push(emptyEntry())
      for (let r = 0; r < pasteRows.length && rowIndex + r < 10; r++) {
        const cells = pasteRows[r].split("\t")
        const updated = { ...next[rowIndex + r] }
        for (let c = 0; c < cells.length && startCol + c < FIELD_ORDER.length; c++) updated[FIELD_ORDER[startCol + c]] = cells[c].trim()
        next[rowIndex + r] = updated
      }
      return next
    })
  }

  const buildEntries = () =>
    entries.filter((e) => e.address.trim() && e.amount.trim())
      .map((e) => ({ address: e.address.trim(), amount: parseFloat(e.amount), note: e.note.trim() || null }))
      .filter((e) => !isNaN(e.amount) && e.amount >= 0)

  const save = (toSave: { address: string; amount: number; note: string | null }[]) =>
    startTransition(async () => {
      const res = await upsertAllocationsAction(toSave)
      if (res.ok) { resetForm(); fetchRows() } else setError(res.error)
    })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    const toSave = buildEntries()
    if (toSave.length === 0) { setError("Fill in at least one entry with an address and amount."); return }
    const existing = new Map(rows.map((r) => [r.address, r]))
    const clashes = toSave.filter((e) => existing.has(e.address)).map((e) => ({ address: e.address, currentAmount: existing.get(e.address)!.amount }))
    if (clashes.length > 0) { setOverwrite(clashes); setPendingEntries(toSave); return }
    save(toSave)
  }

  const onDelete = (a: FuelRow) => {
    if (!confirm(`Delete FUEL allocation for ${a.address}?`)) return
    startTransition(async () => { const res = await deleteAllocationAction(a.id); if (!res.ok) setError(res.error); fetchRows() })
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const visible = (() => {
    let list = search ? rows.filter((a) => a.address.toLowerCase().includes(search.toLowerCase()) || a.note?.toLowerCase().includes(search.toLowerCase())) : rows
    if (sortKey) list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === "amount") cmp = a.amount - b.amount
      else if (sortKey === "note") cmp = (a.note || "").localeCompare(b.note || "")
      else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      return sortDir === "asc" ? cmp : -cmp
    })
    return list
  })()

  const SortTh = ({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) => (
    <th className={`cursor-pointer select-none px-4 py-3 hover:text-zinc-200 ${align === "right" ? "text-right" : "text-left"}`} onClick={() => toggleSort(k)}>
      {children}{sortKey !== k ? <span className="ml-1 text-zinc-600">↕</span> : <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </th>
  )

  if (collapsed) {
    return (
      <button onClick={openPanel} className="flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900/60">
        <SlidersHorizontal size={15} className="text-zinc-500" /> Manage allocations (add / edit / delete)
      </button>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200"><SlidersHorizontal size={15} /> Manage allocations <span className="text-xs text-zinc-500">· {total.toLocaleString()} FUEL · {rows.length} addr</span></div>
        <div className="flex gap-2">
          {canEdit && <Button size="sm" variant={showForm ? "ghost" : "default"} onClick={() => (showForm ? resetForm() : setShowForm(true))}>{showForm ? "Cancel" : "Add allocation"}</Button>}
          <Button size="sm" variant="ghost" onClick={() => setCollapsed(true)}>Close</Button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}<button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

      {showForm && canEdit && (
        <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="hidden gap-3 text-xs text-zinc-500 sm:flex">
            <div className="flex-[3]">Wallet address</div><div className="flex-1">FUEL amount</div><div className="flex-[2]">Name (optional)</div>{entries.length > 1 && <div className="w-8" />}
          </div>
          {entries.map((entry, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Input value={entry.address} onChange={(e) => updateEntry(i, "address", e.target.value)} onPaste={(e) => handlePaste(e, i, "address")} placeholder="bc1p… or bc1q…" className={`flex-[3] font-mono ${inputCls}`} />
              <Input value={entry.amount} inputMode="decimal" onChange={(e) => updateEntry(i, "amount", e.target.value)} onPaste={(e) => handlePaste(e, i, "amount")} placeholder="0.00" className={`flex-1 ${inputCls}`} />
              <Input value={entry.note} onChange={(e) => updateEntry(i, "note", e.target.value)} onPaste={(e) => handlePaste(e, i, "note")} placeholder="e.g. Beta tester" className={`flex-[2] ${inputCls}`} />
              {entries.length > 1 && <button type="button" onClick={() => removeEntry(i)} className="h-9 w-8 shrink-0 rounded-md text-red-400 hover:bg-red-950/40" title="Remove">×</button>}
            </div>
          ))}
          {entries.length < 10 && <button type="button" onClick={addMore} className="rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200">+ Add more entries</button>}
          {overwrite ? (
            <div className="rounded-lg border border-yellow-700/40 bg-yellow-950/30 p-4">
              <p className="mb-2 text-sm text-yellow-300">These addresses already have an allocation:</p>
              <ul className="mb-3 space-y-1">{overwrite.map((o) => <li key={o.address} className="font-mono text-xs text-yellow-200">{o.address.slice(0, 14)}…{o.address.slice(-6)} <span className="text-yellow-400">({o.currentAmount})</span></li>)}</ul>
              <div className="flex gap-2"><Button size="sm" disabled={pending} onClick={() => save(pendingEntries)}>Confirm overwrite</Button><Button size="sm" variant="ghost" onClick={() => setOverwrite(null)}>Back</Button></div>
            </div>
          ) : <Button type="submit" disabled={pending}>Save allocation</Button>}
        </form>
      )}

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by address or note…" className={`max-w-md ${inputCls}`} />

      {loading ? <div className="text-zinc-500">Loading…</div> : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="px-4 py-3 text-left">Address</th><SortTh k="amount" align="right">Amount</SortTh><SortTh k="note">Community</SortTh><SortTh k="updatedAt">Updated</SortTh><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">{search ? "No matching allocations." : "No allocations yet."}</td></tr>}
              {visible.map((a) => (
                <tr key={a.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3"><AddressChip address={a.address} /></td>
                  <td className="px-4 py-3 text-right font-medium text-white">{a.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-zinc-400">{a.note || "—"}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{new Date(a.updatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">{canEdit && <Button size="sm" variant="ghost" disabled={pending} className="text-red-400 hover:text-red-300" onClick={() => onDelete(a)}>Delete</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1 text-base font-semibold ${accent ? "text-sky-300" : "text-white"}`}>{accent && <Flame size={13} className="text-orange-400/80" />}{value}</div>
    </div>
  )
}
