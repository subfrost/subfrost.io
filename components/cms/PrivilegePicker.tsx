"use client"

import { useMemo, useState } from "react"
import { Search, Lock, X, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  PRIVILEGES, CATEGORIES, expand, impliedExtras, privilegeDef,
  type PrivilegeDef,
} from "@/lib/cms/iam/registry"
import { categoryIcon } from "@/lib/cms/iam/icons"

/**
 * Stripe/GSuite-style privilege picker: filter-as-you-type over the IAM
 * registry by code or description, grouped by category, with the static
 * dependency graph driving auto-grant. Selecting a privilege pulls in everything
 * it implies (those rows lock while the implying privilege stays selected).
 *
 * `value` is the explicit selection; the effective grant (closure) is
 * value-derived. Only `grantable` codes can be toggled (you can't grant a
 * privilege you don't hold).
 */
export function PrivilegePicker({
  value,
  onChange,
  grantable,
  disabled,
}: {
  value: string[]
  onChange: (codes: string[]) => void
  grantable: string[]
  disabled?: boolean
}) {
  const [q, setQ] = useState("")
  const selected = useMemo(() => new Set(value), [value])
  const grantableSet = useMemo(() => new Set(grantable), [grantable])

  // A code is "locked on" if some OTHER selected code implies it.
  const lockedByDeps = useMemo(() => {
    const locked = new Set<string>()
    for (const c of value) for (const dep of impliedExtras(c)) locked.add(dep)
    return locked
  }, [value])

  const query = q.trim().toLowerCase()
  const matches = useMemo(() => {
    const list = !query
      ? PRIVILEGES
      : PRIVILEGES.filter(
          (p) =>
            p.code.toLowerCase().includes(query) ||
            p.label.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query),
        )
    const byCat = new Map<string, PrivilegeDef[]>()
    for (const p of list) {
      if (!byCat.has(p.category)) byCat.set(p.category, [])
      byCat.get(p.category)!.push(p)
    }
    return byCat
  }, [query])

  function toggle(code: string) {
    if (disabled || !grantableSet.has(code)) return
    if (selected.has(code)) {
      if (lockedByDeps.has(code)) return // implied by another selection — remove that one first
      onChange(value.filter((c) => c !== code))
    } else {
      // Add the code + its implied closure (intersected with what the actor can grant).
      const add = expand([code]).filter((c) => grantableSet.has(c))
      onChange([...new Set([...value, ...add])])
    }
  }

  return (
    <div className="space-y-3">
      {/* selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => {
            const def = privilegeDef(c)
            const locked = lockedByDeps.has(c)
            return (
              <span key={c} className="inline-flex items-center gap-1 rounded-full border border-sky-800/60 bg-sky-950/40 px-2 py-0.5 text-xs text-sky-200">
                {def?.label ?? c}
                {!locked && !disabled && (
                  <button onClick={() => toggle(c)} className="text-sky-400 hover:text-white" aria-label={`Remove ${c}`}><X size={11} /></button>
                )}
                {locked && <Lock size={10} className="text-sky-500/70" aria-label="implied" />}
              </span>
            )
          })}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled}
          placeholder="Search privileges by code or description… (e.g. iam, fuel.edit)"
          className="bg-zinc-900 pl-9 text-zinc-100 border-zinc-700" />
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
        {CATEGORIES.filter((cat) => matches.has(cat.key)).map((cat) => {
          const Icon = categoryIcon(cat.key)
          return (
            <div key={cat.key}>
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                <Icon size={12} /> {cat.label}
              </div>
              <div className="space-y-0.5">
                {matches.get(cat.key)!.map((p) => {
                  const isSel = selected.has(p.code)
                  const locked = lockedByDeps.has(p.code)
                  const canGrant = grantableSet.has(p.code)
                  const extras = impliedExtras(p.code)
                  return (
                    <button key={p.code} type="button" onClick={() => toggle(p.code)} disabled={disabled || !canGrant || (isSel && locked)}
                      className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left ${isSel ? "bg-sky-500/10" : "hover:bg-zinc-900"} ${!canGrant ? "opacity-40" : ""}`}>
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSel ? "border-sky-500 bg-sky-500/80 text-white" : "border-zinc-700"}`}>
                        {isSel && <Check size={11} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <code className="font-mono text-xs text-sky-300">{p.code}</code>
                          <span className="text-sm text-zinc-200">{p.label}</span>
                          {!canGrant && <Lock size={10} className="text-zinc-600" />}
                        </span>
                        <span className="block text-xs text-zinc-500">{p.description}</span>
                        {extras.length > 0 && (
                          <span className="block text-[10px] text-zinc-600">also grants {extras.join(", ")}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {matches.size === 0 && <div className="px-2 py-6 text-center text-xs text-zinc-600">No privileges match “{q}”.</div>}
      </div>
    </div>
  )
}
