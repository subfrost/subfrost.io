"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { ChevronRight, Plus, Layers, Flame, Check, Power, Trash2, Download, Pencil, X, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AddressChip } from "@/components/cms/address-profile/AddressProfilePanel"
import { SkeletonList, SkeletonText } from "@/components/cms/Skeleton"
import {
  getAnnotatedCodeTreeAction,
  codeRedeemersAction,
  createCodeAction,
  bulkCreateCodesAction,
  toggleCodeAction,
  updateCodeAction,
  deleteCodeAction,
  addAddressToCodeAction,
  removeAddressFromCodeAction,
  exportRedemptionsCsvAction,
} from "@/actions/cms/codes"
import type { AnnotatedCodeNode, CodeRedeemer } from "@/lib/referral/admin"

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })

/** A mainnet Taproot address: `bc1p` prefix (case-insensitive) and 62 chars. */
const isTaprootAddress = (address: string) => address.length === 62 && /^bc1p/i.test(address)

// Keep a node if it (or any descendant) matches the code/owner search and the
// redeemed-address search. `addr` matches against the code's redeemer addresses
// (and its owner address), so searching an address surfaces the codes it claimed.
function filterTree(nodes: AnnotatedCodeNode[], q: string, addr: string): AnnotatedCodeNode[] {
  const out: AnnotatedCodeNode[] = []
  for (const n of nodes) {
    const kids = filterTree(n.children, q, addr)
    const codeMatch =
      !q || n.code.toLowerCase().includes(q) || (n.ownerTaprootAddress ?? "").toLowerCase().includes(q)
    const addrMatch =
      !addr ||
      (n.ownerTaprootAddress ?? "").toLowerCase().includes(addr) ||
      n.redeemerAddresses.some((a) => a.toLowerCase().includes(addr))
    if ((codeMatch && addrMatch) || kids.length) out.push({ ...n, children: kids })
  }
  return out
}

export function CodesManager({ canEdit }: { canEdit: boolean }) {
  const [tree, setTree] = useState<AnnotatedCodeNode[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [addressSearch, setAddressSearch] = useState("")
  const [form, setForm] = useState<{ type: "child" | "bulk" | "address"; parentId: string | null } | null>(null)
  const [, startTransition] = useTransition()

  async function reload() {
    const res = await getAnnotatedCodeTreeAction()
    if (res.ok) setTree(res.tree)
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  const q = search.trim().toLowerCase()
  const addr = addressSearch.trim().toLowerCase()
  const filtered = useMemo(() => (tree ? filterTree(tree, q, addr) : []), [tree, q, addr])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <Button size="sm" onClick={() => setForm({ type: "child", parentId: null })}><Plus size={14} /> New Parent Code</Button>
          </>
        )}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or owner…" className="h-9 max-w-xs bg-zinc-900 text-zinc-100 border-zinc-700" />
        <Input value={addressSearch} onChange={(e) => setAddressSearch(e.target.value)} placeholder="Search address…" className="h-9 max-w-xs bg-zinc-900 text-zinc-100 border-zinc-700" />
        <Button size="sm" variant="ghost" className="ml-auto"
          onClick={() => startTransition(async () => { const r = await exportRedemptionsCsvAction(); if (r.ok) downloadCsv(r.csv, r.filename) })}>
          <Download size={14} /> Export redemptions
        </Button>
      </div>

      {form?.parentId === null && (
        <NodeForm type={form.type} parentId={null} onDone={() => { setForm(null); reload() }} onCancel={() => setForm(null)} />
      )}

      {loading ? (
        <SkeletonList rows={10} height="h-8" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-zinc-600">No codes match.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/30">
          {filtered.map((n) => (
            <TreeRow key={n.id} node={n} depth={0} canEdit={canEdit} form={form} setForm={setForm} reload={reload} isCommunity />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeRow({ node, depth, canEdit, form, setForm, reload, isCommunity }: {
  node: AnnotatedCodeNode; depth: number; canEdit: boolean
  form: { type: "child" | "bulk" | "address"; parentId: string | null } | null
  setForm: (f: { type: "child" | "bulk" | "address"; parentId: string | null } | null) => void
  reload: () => void; isCommunity?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [redeemers, setRedeemers] = useState<CodeRedeemer[] | null>(null)
  const [limit, setLimit] = useState(50)
  const [editingAddr, setEditingAddr] = useState(false)
  const [addrDraft, setAddrDraft] = useState("")
  const [addrError, setAddrError] = useState<string | null>(null)
  const [savingAddr, startAddrTransition] = useTransition()
  const [, startTransition] = useTransition()
  const hasChildren = node.children.length > 0
  const expandable = hasChildren || node.redemptionCount > 0

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && node.redemptionCount > 0 && !redeemers) {
      startTransition(async () => { const r = await codeRedeemersAction(node.id); if (r.ok) setRedeemers(r.redeemers) })
    }
  }

  function startEditAddr() {
    setAddrDraft(node.ownerTaprootAddress ?? "")
    setAddrError(null)
    setEditingAddr(true)
  }

  function removeRedeemer(r: CodeRedeemer) {
    const warning =
      r.fuel != null
        ? `Remove ${r.address} from ${node.code}?\n\nThe address will no longer be a redeemer of this code. Because it has FUEL allocated, it stays in the system and will appear under "Unattributed" in /admin/fuel.`
        : `Remove ${r.address} from ${node.code}?\n\nThe address will no longer be a redeemer of this code. It has no FUEL allocated, so it will be deleted from the system entirely.`
    if (!confirm(warning)) return
    startTransition(async () => {
      const res = await removeAddressFromCodeAction({ codeId: node.id, taprootAddress: r.address })
      if (res.ok) {
        setRedeemers((prev) => (prev ? prev.filter((x) => x.address !== r.address) : prev))
        reload()
      }
    })
  }

  function saveAddr() {
    const address = addrDraft.trim()
    if (!isTaprootAddress(address)) { setAddrError("Incorrect Taproot format"); return }
    setAddrError(null)
    startAddrTransition(async () => {
      const r = await updateCodeAction(node.id, { ownerTaprootAddress: address })
      if (r.ok) { setEditingAddr(false); reload() }
      else setAddrError(r.error)
    })
  }

  return (
    <div className={depth > 0 ? "border-t border-zinc-800/50" : ""}>
      <div className="flex w-max min-w-full items-center gap-2 px-3 py-2 hover:bg-zinc-900/40" style={{ paddingLeft: 12 + depth * 18 }}>
        <button onClick={toggle} disabled={!expandable} className={`shrink-0 ${expandable ? "text-zinc-500" : "text-transparent"}`}>
          <ChevronRight size={15} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <span className={`font-mono ${isCommunity ? "font-semibold text-white" : "text-zinc-200"}`}>{node.code}</span>
        <span title={node.isActive ? "active" : "inactive"} className={`h-1.5 w-1.5 rounded-full ${node.isActive ? "bg-emerald-400" : "bg-zinc-600"}`} />
        {node.redemptionCount > 0
          ? <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-300">{node.redemptionCount} claimed</span>
          : <span className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] text-amber-300/90">unclaimed</span>}
        <span title="Total FUEL across the owner, all sub-code owners, and every redeemer in this subtree" className="inline-flex items-center gap-1 rounded bg-violet-900/40 px-1.5 py-0.5 text-[10px] text-violet-200">
          <Flame size={9} className="text-orange-400/80" />{fmt(node.totalFuel)} total
        </span>

        {editingAddr ? (
          <span className="relative ml-1 flex items-center gap-1">
            {addrError && (
              <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-red-950 px-1.5 py-0.5 text-[10px] font-medium text-red-300 ring-1 ring-red-800">
                {addrError}
              </span>
            )}
            <Input
              autoFocus
              value={addrDraft}
              onChange={(e) => setAddrDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveAddr(); if (e.key === "Escape") setEditingAddr(false) }}
              placeholder="bc1p…"
              className="h-7 w-[560px] max-w-[60vw] bg-zinc-950 font-mono text-xs text-zinc-100 border-zinc-700"
            />
            <IconBtn title="Save address" onClick={saveAddr}>{savingAddr ? <span className="text-[10px]">…</span> : <Check size={13} />}</IconBtn>
            <IconBtn title="Cancel" onClick={() => setEditingAddr(false)}><X size={13} /></IconBtn>
          </span>
        ) : node.ownerTaprootAddress ? (
          <span className="ml-1 flex items-center gap-1">
            <AddressChip address={node.ownerTaprootAddress} />
            {node.ownerRedeemed && <Check size={12} className="text-emerald-400" aria-label="owner redeemed own code" />}
            {node.ownerFuel != null && <span className="inline-flex items-center gap-0.5 rounded bg-sky-900/40 px-1 text-[10px] text-sky-300"><Flame size={9} className="text-orange-400/80" />{fmt(node.ownerFuel)}</span>}
          </span>
        ) : null}

        {canEdit && (
          <span className="ml-auto flex items-center gap-1">
            {!editingAddr && <IconBtn title="Edit owner address" onClick={startEditAddr}><Pencil size={13} /></IconBtn>}
            <IconBtn title="Add child code" onClick={() => setForm({ type: "child", parentId: node.id })}><Plus size={13} /></IconBtn>
            <IconBtn title="Add address to this code" onClick={() => setForm({ type: "address", parentId: node.id })}><UserPlus size={13} /></IconBtn>
            <IconBtn title={node.isActive ? "Deactivate" : "Activate"} onClick={() => startTransition(async () => { await toggleCodeAction(node.id, !node.isActive); reload() })}><Power size={13} /></IconBtn>
            <IconBtn title="Delete" danger onClick={() => { if (confirm(`Delete ${node.code}? Redemptions cascade.`)) startTransition(async () => { await deleteCodeAction(node.id); reload() }) }}><Trash2 size={13} /></IconBtn>
          </span>
        )}
      </div>

      {form?.parentId === node.id && (
        <div style={{ paddingLeft: 12 + (depth + 1) * 18 }} className="pr-3 pb-2">
          <NodeForm type={form.type} parentId={node.id} code={node.code} onDone={() => { setForm(null); reload() }} onCancel={() => setForm(null)} />
        </div>
      )}

      {open && (
        <>
          {node.children.map((c) => (
            <TreeRow key={c.id} node={c} depth={depth + 1} canEdit={canEdit} form={form} setForm={setForm} reload={reload} />
          ))}
          {node.redemptionCount > 0 && (
            <div style={{ paddingLeft: 12 + (depth + 1) * 18 }} className="border-t border-zinc-800/40 bg-zinc-950/40 py-2 pr-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Redeemers</div>
              {!redeemers ? <SkeletonText lines={4} /> : (
                <>
                  <div className="space-y-1">
                    {redeemers.slice(0, limit).map((r) => (
                      <div key={r.address} className="group flex items-center gap-2 text-xs">
                        <AddressChip address={r.address} />
                        {r.fuel != null
                          ? <span className="inline-flex items-center gap-0.5 rounded bg-sky-900/40 px-1 text-[10px] text-sky-300"><Flame size={9} className="text-orange-400/80" />{fmt(r.fuel)} FUEL</span>
                          : <span className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-500">no FUEL</span>}
                        <span className="text-zinc-600">{r.redeemedAt.slice(0, 10)}</span>
                        {canEdit && (
                          <span className="opacity-0 transition-opacity group-hover:opacity-100">
                            <IconBtn title="Remove address from this code" danger onClick={() => removeRedeemer(r)}><Trash2 size={12} /></IconBtn>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {redeemers.length > limit && (
                    <button onClick={() => setLimit((l) => l + 50)} className="mt-1 text-xs text-sky-400 hover:text-sky-300">Show more ({limit} of {redeemers.length})</button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function NodeForm({ type, parentId, code: nodeCode, onDone, onCancel }: {
  type: "child" | "bulk" | "address"; parentId: string | null; code?: string
  onDone: () => void; onCancel: () => void
}) {
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [owner, setOwner] = useState("")
  const [prefix, setPrefix] = useState("")
  const [count, setCount] = useState("10")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const cls = "h-9 bg-zinc-950 text-zinc-100 border-zinc-700"

  function submit() {
    setError(null)
    if (type === "address") {
      const address = owner.trim()
      if (!isTaprootAddress(address)) { setError("Incorrect Taproot format"); return }
      startTransition(async () => {
        const r = await addAddressToCodeAction({ codeId: parentId!, taprootAddress: address })
        if (r.ok) onDone(); else setError(r.error)
      })
      return
    }
    startTransition(async () => {
      if (type === "child") {
        const r = await createCodeAction({ code, description, ownerTaprootAddress: owner || null, parentCodeId: parentId })
        if (r.ok) onDone(); else setError(r.error)
      } else {
        const r = await bulkCreateCodesAction({ prefix, count: Number(count), description, parentCodeId: parentId })
        if (r.ok) onDone(); else setError(r.error)
      }
    })
  }

  return (
    <div className="mt-1 rounded-lg border border-sky-900/50 bg-sky-950/20 p-3">
      <div className="mb-2 text-xs font-medium text-sky-300">
        {type === "address"
          ? "Add address to this code"
          : `${type === "child" ? "New code" : "Bulk generate codes"}${parentId ? " under this node" : " (root)"}`}
      </div>
      {type === "child" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <div><Label className="text-[11px] text-zinc-400">Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HONGJIAN18" className={cls} /></div>
          <div><Label className="text-[11px] text-zinc-400">Owner address (optional)</Label><Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="bc1p…" className={cls} /></div>
          <div><Label className="text-[11px] text-zinc-400">Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className={cls} /></div>
        </div>
      ) : type === "address" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label className="text-[11px] text-zinc-400">Code</Label><Input value={nodeCode ?? ""} disabled className={`${cls} font-mono disabled:opacity-70`} /></div>
          <div><Label className="text-[11px] text-zinc-400">Address</Label><Input autoFocus value={owner} onChange={(e) => setOwner(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit() }} placeholder="bc1p…" className={`${cls} font-mono`} /></div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <div><Label className="text-[11px] text-zinc-400">Prefix</Label><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="HONGJIAN" className={cls} /></div>
          <div><Label className="text-[11px] text-zinc-400">Count (1–500)</Label><Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} className={cls} /></div>
          <div><Label className="text-[11px] text-zinc-400">Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className={cls} /></div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>{type === "child" ? "Create" : type === "address" ? "Save" : "Generate"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}

function IconBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={`rounded p-1 hover:bg-zinc-800 ${danger ? "text-red-400/80 hover:text-red-300" : "text-zinc-500 hover:text-zinc-200"}`}>
      {children}
    </button>
  )
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
