"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Package, Plus, Archive } from "lucide-react"
import type { ProductView, InitiativeView } from "@/lib/tasks/types"
import { createProductAction, updateProductAction, archiveProductAction, updateInitiativeAction } from "@/actions/tasks/board"

const inputCls = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"

export function ProductsClient({ products, initiatives, canEdit }: {
  products: ProductView[]
  initiatives: InitiativeView[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [color, setColor] = useState("#ffffff")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const countByProduct = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of initiatives) if (i.productId) m[i.productId] = (m[i.productId] ?? 0) + 1
    return m
  }, [initiatives])

  async function run(fn: () => Promise<unknown>) {
    await fn()
    router.refresh()
  }

  async function create() {
    if (busy) return
    setBusy(true); setError(null)
    const r = await createProductAction({ name, color })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setName(""); setColor("#ffffff"); setOpen(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Package size={20} className="text-zinc-400" /> Products
        </h1>
        {canEdit && (
          <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
            <Plus size={16} /> New product
          </button>
        )}
      </div>

      {open && canEdit && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name (e.g. iOS, Web App)" aria-label="Product name" className={`flex-1 ${inputCls}`} />
            <input value={color} onChange={(e) => setColor(e.target.value)} aria-label="Product color" className={`w-28 ${inputCls}`} />
            <span className="h-9 w-9 shrink-0 self-center rounded-full ring-1 ring-zinc-700" style={{ background: color }} />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex justify-end">
            <button onClick={create} disabled={busy} className="rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 disabled:opacity-50">Create product</button>
          </div>
        </div>
      )}

      {/* Product definitions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3" style={{ borderLeftColor: p.color, borderLeftWidth: 3 }}>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/30" style={{ background: p.color }} />
              {canEdit ? (
                <input defaultValue={p.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) run(() => updateProductAction(p.id, { name: v })) }} aria-label={`Name of ${p.name}`} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-zinc-100 hover:border-zinc-700 focus:border-sky-500 focus:outline-none" />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">{p.name}</span>
              )}
              {canEdit && (
                <button onClick={() => run(() => archiveProductAction(p.id))} aria-label={`Archive ${p.name}`} title="Archive" className="shrink-0 text-zinc-600 hover:text-zinc-400"><Archive size={14} /></button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">{countByProduct[p.id] ?? 0} initiative{(countByProduct[p.id] ?? 0) === 1 ? "" : "s"}</span>
              {canEdit && (
                <input type="text" defaultValue={p.color} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.color) run(() => updateProductAction(p.id, { color: v })) }} aria-label={`Color of ${p.name}`} className="w-24 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-400 focus:border-sky-500 focus:outline-none" />
              )}
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="col-span-full rounded-lg border border-dashed border-zinc-800 px-3 py-8 text-center text-sm text-zinc-600">No products yet. Create one to group initiatives.</p>}
      </div>

      {/* Assign initiatives to products */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-300">Assign initiatives</h2>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="px-3 py-2 font-medium">Initiative</th><th className="px-3 py-2 font-medium">Product</th></tr>
            </thead>
            <tbody>
              {initiatives.map((i) => (
                <tr key={i.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 text-zinc-100">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} />
                      {i.name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select
                        aria-label={`Product for ${i.name}`}
                        value={i.productId ?? ""}
                        onChange={(e) => run(() => updateInitiativeAction(i.id, { productId: e.target.value || null }))}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                      >
                        <option value="">— Unassigned —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-zinc-400">{products.find((p) => p.id === i.productId)?.name ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {initiatives.length === 0 && <tr><td colSpan={2} className="px-3 py-6 text-center text-xs text-zinc-600">No initiatives yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
