"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  listCodesAction,
  getParentOptionsAction,
  createCodeAction,
  bulkCreateCodesAction,
  updateCodeAction,
  toggleCodeAction,
  deleteCodeAction,
  getCodeTreeAction,
  listRedemptionsAction,
  exportRedemptionsCsvAction,
} from "@/actions/cms/codes"
import type {
  CodeRow,
  Pagination,
  CodeTreeNode,
  RedemptionRow,
} from "@/lib/referral/admin"

type View = "codes" | "hierarchy" | "redemptions"
type SortField = "code" | "description" | "redemptions" | "children" | "parent"
type SortDir = "asc" | "desc"

const inputCls = "bg-zinc-900 text-zinc-100 border-zinc-700"
const selectCls =
  "h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"

export function CodesManager({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<View>("codes")
  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-zinc-800 text-sm">
        <Tab active={view === "codes"} onClick={() => setView("codes")}>Codes</Tab>
        <Tab active={view === "hierarchy"} onClick={() => setView("hierarchy")}>Hierarchy</Tab>
        <Tab active={view === "redemptions"} onClick={() => setView("redemptions")}>Redemptions</Tab>
      </div>
      {view === "codes" && <CodesView canEdit={canEdit} />}
      {view === "hierarchy" && <HierarchyView />}
      {view === "redemptions" && <RedemptionsView />}
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 ${
        active ? "border-white text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  )
}

// --- Codes table -----------------------------------------------------------

function CodesView({ canEdit }: { canEdit: boolean }) {
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [sortField, setSortField] = useState<SortField | "">("")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editing, setEditing] = useState<CodeRow | null>(null)
  const [parentOptions, setParentOptions] = useState<{ id: string; code: string }[]>([])

  const fetchCodes = useCallback(
    async (page = 1) => {
      setLoading(true)
      const res = await listCodesAction({
        page,
        search: search || undefined,
        status,
        sortBy: sortField || undefined,
        sortDir,
      })
      if (res.ok) {
        setCodes(res.codes)
        setPagination(res.pagination)
        setError(null)
      } else {
        setError(res.error)
      }
      setLoading(false)
    },
    [search, status, sortField, sortDir],
  )

  useEffect(() => {
    fetchCodes(1)
  }, [fetchCodes])

  useEffect(() => {
    getParentOptionsAction().then((res) => {
      if (res.ok) setParentOptions(res.options)
    })
  }, [])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir(field === "code" || field === "description" || field === "parent" ? "asc" : "desc")
    }
  }

  const onToggle = (c: CodeRow) =>
    startTransition(async () => {
      const res = await toggleCodeAction(c.id, !c.isActive)
      if (!res.ok) setError(res.error)
      fetchCodes(pagination.page)
    })

  const onDelete = (c: CodeRow) => {
    if (!confirm(`Delete code "${c.code}"? This also deletes its ${c.redemptionCount} redemption(s).`)) return
    startTransition(async () => {
      const res = await deleteCodeAction(c.id)
      if (!res.ok) setError(res.error)
      fetchCodes(pagination.page)
    })
  }

  const SortIndicator = ({ field }: { field: SortField }) =>
    sortField !== field ? (
      <span className="ml-1 text-zinc-600">↕</span>
    ) : (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    )

  const Th = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th className="cursor-pointer select-none px-4 py-3 hover:text-zinc-200" onClick={() => toggleSort(field)}>
      {children}
      <SortIndicator field={field} />
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search codes…"
          className={`w-64 ${inputCls}`}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {canEdit && <Button onClick={() => setShowCreate(true)}>Create code</Button>}
        {canEdit && <Button variant="ghost" onClick={() => setShowBulk(true)}>Bulk generate</Button>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <Th field="code">Code</Th>
                <th className="px-4 py-3">Owner</th>
                <Th field="description">Description</Th>
                <th className="px-4 py-3">Status</th>
                <Th field="redemptions">Redemptions</Th>
                <Th field="children">Children</Th>
                <Th field="parent">Parent</Th>
                {canEdit && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">No codes found.</td>
                </tr>
              )}
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-mono text-white">{c.code}</td>
                  <td className="px-4 py-3">
                    {c.ownerTaprootAddress ? <TruncatedAddress address={c.ownerTaprootAddress} /> : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-zinc-400">{c.description || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge active={c.isActive} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{c.redemptionCount}</td>
                  <td className="px-4 py-3 text-zinc-300">{c.childCount}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.parentCode?.code || "—"}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(c)}>Edit</Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onToggle(c)}>
                          {c.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending} className="text-red-400 hover:text-red-300" onClick={() => onDelete(c)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">
            {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={pagination.page <= 1} onClick={() => fetchCodes(pagination.page - 1)}>Prev</Button>
            <Button size="sm" variant="ghost" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchCodes(pagination.page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {canEdit && showCreate && (
        <CreateCodeModal
          parentOptions={parentOptions}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            fetchCodes(pagination.page)
          }}
        />
      )}
      {canEdit && showBulk && (
        <BulkCreateModal
          parentOptions={parentOptions}
          onClose={() => setShowBulk(false)}
          onDone={() => fetchCodes(pagination.page)}
        />
      )}
      {canEdit && editing && (
        <EditCodeModal
          code={editing}
          onClose={() => setEditing(null)}
          onUpdated={() => {
            setEditing(null)
            fetchCodes(pagination.page)
          }}
        />
      )}
    </div>
  )
}

function BulkCreateModal({
  parentOptions,
  onClose,
  onDone,
}: {
  parentOptions: { id: string; code: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const [prefix, setPrefix] = useState("")
  const [count, setCount] = useState("10")
  const [description, setDescription] = useState("")
  const [parentCodeId, setParentCodeId] = useState("")
  const [generated, setGenerated] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await bulkCreateCodesAction({
        prefix,
        count: Number(count),
        description: description || undefined,
        parentCodeId: parentCodeId || undefined,
      })
      if (res.ok) {
        setGenerated(res.codes)
        onDone()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Modal title="Bulk-generate codes" onClose={onClose}>
      {generated ? (
        <div className="space-y-3">
          <div className="text-sm text-emerald-300">Generated {generated.length} codes:</div>
          <textarea
            readOnly
            value={generated.join("\n")}
            className="h-48 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs text-zinc-200"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(generated.join("\n"))}>Copy all</Button>
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-zinc-300">Prefix <span className="text-zinc-500">(min 2)</span></Label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="PROMO" required className={`font-mono ${inputCls}`} />
            </div>
            <div className="w-28 space-y-1.5">
              <Label className="text-zinc-300">Count <span className="text-zinc-500">(1–500)</span></Label>
              <Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} required className={inputCls} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="applied to every generated code" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Parent code</Label>
            <select value={parentCodeId} onChange={(e) => setParentCodeId(e.target.value)} className={`w-full ${selectCls}`}>
              <option value="">None (top-level)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.code}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-zinc-500">Codes are generated as <code className="text-zinc-300">PREFIX-XXXXX</code> (5 random chars).</p>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending || prefix.trim().length < 2}>Generate</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-emerald-900/50 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  )
}

function TruncatedAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const short = address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
  return (
    <button
      title={copied ? "Copied!" : address}
      onClick={async () => {
        await navigator.clipboard.writeText(address)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="font-mono text-zinc-300 hover:text-white"
    >
      {short}
    </button>
  )
}

// --- Create / Edit modals --------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium text-zinc-200">{title}</div>
        {children}
      </div>
    </div>
  )
}

function CreateCodeModal({
  parentOptions,
  onClose,
  onCreated,
}: {
  parentOptions: { id: string; code: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [parentCodeId, setParentCodeId] = useState("")
  const [ownerTaprootAddress, setOwnerTaprootAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createCodeAction({
        code,
        description: description || undefined,
        parentCodeId: parentCodeId || undefined,
        ownerTaprootAddress: ownerTaprootAddress || undefined,
      })
      if (res.ok) onCreated()
      else setError(res.error)
    })
  }

  return (
    <Modal title="Create invite code" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Code <span className="text-zinc-500">(min 3 chars)</span></Label>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MYCODE123" required className={`font-mono ${inputCls}`} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Twitter campaign Jan 2026" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Parent code</Label>
          <select value={parentCodeId} onChange={(e) => setParentCodeId(e.target.value)} className={`w-full ${selectCls}`}>
            <option value="">None (top-level)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.code}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Owner taproot address</Label>
          <Input value={ownerTaprootAddress} onChange={(e) => setOwnerTaprootAddress(e.target.value)} placeholder="bc1p…" className={`font-mono ${inputCls}`} />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending || code.trim().length < 3}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}

function EditCodeModal({ code, onClose, onUpdated }: { code: CodeRow; onClose: () => void; onUpdated: () => void }) {
  const [description, setDescription] = useState(code.description || "")
  const [ownerTaprootAddress, setOwnerTaprootAddress] = useState(code.ownerTaprootAddress || "")
  const [isActive, setIsActive] = useState(code.isActive)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await updateCodeAction(code.id, {
        description: description || null,
        ownerTaprootAddress: ownerTaprootAddress || null,
        isActive,
      })
      if (res.ok) onUpdated()
      else setError(res.error)
    })
  }

  return (
    <Modal title={`Edit: ${code.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Owner taproot address</Label>
          <Input value={ownerTaprootAddress} onChange={(e) => setOwnerTaprootAddress(e.target.value)} className={`font-mono ${inputCls}`} />
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-zinc-300">Status</Label>
          <button type="button" onClick={() => setIsActive(!isActive)}>
            <StatusBadge active={isActive} />
          </button>
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}

// --- Hierarchy -------------------------------------------------------------

function HierarchyView() {
  const [tree, setTree] = useState<CodeTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCodeTreeAction().then((res) => {
      if (res.ok) setTree(sortTree(res.tree))
      else setError(res.error)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-zinc-500">Loading…</div>
  if (error) return <div className="text-red-400">{error}</div>
  if (tree.length === 0) return <div className="text-zinc-500">No codes found.</div>

  return (
    <div className="rounded-xl border border-zinc-800 p-4">
      <div className="divide-y divide-zinc-800/40">
        {tree.map((node) => (
          <TreeItem key={node.id} node={node} />
        ))}
      </div>
    </div>
  )
}

function sortTree(nodes: CodeTreeNode[]): CodeTreeNode[] {
  return [...nodes]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((n) => ({ ...n, children: sortTree(n.children) }))
}

function aggregateRedemptions(node: CodeTreeNode): number {
  return node.redemptionCount + node.children.reduce((s, c) => s + aggregateRedemptions(c), 0)
}
function countNodes(node: CodeTreeNode): number {
  return 1 + node.children.reduce((s, c) => s + countNodes(c), 0)
}

function LeafRow({ node, depth }: { node: CodeTreeNode; depth: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-zinc-800/40" style={{ paddingLeft: `${depth * 24 + 12}px` }}>
      <span className="w-5" />
      <span className="font-mono text-sm text-zinc-100">{node.code}</span>
      <StatusBadge active={node.isActive} />
      <span className="text-xs text-zinc-500">{node.redemptionCount} redemptions</span>
    </div>
  )
}

function TreeItem({ node, depth = 0 }: { node: CodeTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (node.children.length === 0) return <LeafRow node={node} depth={depth} />
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-zinc-800/40" style={{ paddingLeft: `${depth * 24 + 12}px` }}>
        <button onClick={() => setExpanded(!expanded)} className="w-5 text-center text-xs text-zinc-500">
          {expanded ? "▼" : "▶"}
        </button>
        <span className="font-mono text-sm font-semibold text-zinc-100">{node.code}</span>
        <span className="text-xs text-zinc-500">{aggregateRedemptions(node)} redemptions</span>
        <span className="text-xs text-zinc-500">{countNodes(node)} codes</span>
      </div>
      {expanded && (
        <div>
          <LeafRow node={node} depth={depth + 1} />
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Redemptions -----------------------------------------------------------

function RedemptionsView() {
  const [rows, setRows] = useState<RedemptionRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchRows = useCallback(
    async (page = 1) => {
      setLoading(true)
      const res = await listRedemptionsAction({ page, search: search || undefined })
      if (res.ok) {
        setRows(res.redemptions)
        setPagination(res.pagination)
        setError(null)
      } else {
        setError(res.error)
      }
      setLoading(false)
    },
    [search],
  )

  useEffect(() => {
    fetchRows(1)
  }, [fetchRows])

  const onExport = () =>
    startTransition(async () => {
      const res = await exportRedemptionsCsvAction()
      if (!res.ok) {
        setError(res.error)
        return
      }
      const blob = new Blob([res.csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.filename
      a.click()
      URL.revokeObjectURL(url)
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search address or code…" className={`w-72 ${inputCls}`} />
        <Button variant="ghost" disabled={pending} onClick={onExport}>Export CSV</Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Taproot address</th>
                <th className="px-4 py-3">Segwit address</th>
                <th className="px-4 py-3">Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No redemptions found.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-mono text-white">{r.code}</td>
                  <td className="px-4 py-3"><TruncatedAddress address={r.taprootAddress} /></td>
                  <td className="px-4 py-3">{r.segwitAddress ? <TruncatedAddress address={r.segwitAddress} /> : <span className="text-zinc-600">—</span>}</td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(r.redeemedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">
            {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={pagination.page <= 1} onClick={() => fetchRows(pagination.page - 1)}>Prev</Button>
            <Button size="sm" variant="ghost" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchRows(pagination.page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
