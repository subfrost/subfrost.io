"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import {
  LEGAL_ENTITY_CATEGORIES, LEGAL_ENTITY_CATEGORY_LABELS,
  type LegalEntityRow, type LegalEntityCategory,
} from "@/lib/financials/legal/shapes"

const CAT_CLS: Record<LegalEntityCategory, string> = {
  FUNDED_INVESTOR: "bg-emerald-900/40 text-emerald-300",
  DESERTER: "bg-amber-900/40 text-amber-300",
  VOID_NONFUNDER: "bg-red-900/40 text-red-300",
  COUNTERPARTY: "bg-sky-900/40 text-sky-300",
  EMPLOYEE: "bg-indigo-900/40 text-indigo-300",
}

export function EntitiesRoster({ initial }: { initial: LegalEntityRow[] }) {
  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<LegalEntityCategory | "ALL">("ALL")
  const [tag, setTag] = useState<string | "ALL">("ALL")

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const e of initial) for (const t of e.tags) s.add(t)
    return [...s].sort()
  }, [initial])

  const counts = useMemo(() => {
    const m = new Map<LegalEntityCategory, number>()
    for (const e of initial) m.set(e.category, (m.get(e.category) ?? 0) + 1)
    return m
  }, [initial])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return initial.filter((e) => {
      if (cat !== "ALL" && e.category !== cat) return false
      if (tag !== "ALL" && !e.tags.includes(tag)) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        (e.email?.toLowerCase().includes(q) ?? false) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        (e.payeeName?.toLowerCase().includes(q) ?? false) ||
        (e.userName?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [initial, query, cat, tag])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, tag, linked payee…"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
        {allTags.length > 0 && (
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value as string)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="ALL">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={cat === "ALL"} onClick={() => setCat("ALL")}>All ({initial.length})</FilterChip>
        {LEGAL_ENTITY_CATEGORIES.map((c) => (
          <FilterChip key={c} active={cat === c} onClick={() => setCat(c)}>
            {LEGAL_ENTITY_CATEGORY_LABELS[c]} ({counts.get(c) ?? 0})
          </FilterChip>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">No entities match this view.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th>Category</th>
                <th className="hidden md:table-cell">Tags</th>
                <th className="hidden sm:table-cell">Scope</th>
                <th className="hidden lg:table-cell">Linked to</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-t border-zinc-900 transition-colors hover:bg-zinc-900/30">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/entities/${e.id}`} className="font-medium text-white hover:underline">{e.name}</Link>
                    <span className="ml-2 rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">{e.kind}</span>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-zinc-500 md:hidden">
                      <span>{e.scope}</span>
                      {e.tags.length > 0 ? <span>· {e.tags.join(", ")}</span> : null}
                      {e.userName ? <span>· {e.userName}</span> : e.payeeName ? <span>· {e.payeeName}</span> : null}
                    </div>
                  </td>
                  <td><span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${CAT_CLS[e.category]}`}>{LEGAL_ENTITY_CATEGORY_LABELS[e.category]}</span></td>
                  <td className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {e.tags.length === 0 ? <span className="text-xs text-zinc-600">—</span> : e.tags.map((t) => (
                        <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="hidden text-xs text-zinc-400 sm:table-cell">{e.scope}</td>
                  <td className="hidden text-xs text-zinc-400 lg:table-cell">
                    {e.userName ? `user: ${e.userName}` : e.payeeName ? `payee: ${e.payeeName}` : e.shareholderName ? `holder: ${e.shareholderName}` : "—"}
                  </td>
                  <td className="px-3 text-right"><Link href={`/admin/entities/${e.id}`} className="whitespace-nowrap text-xs text-sky-400 hover:underline">Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? "bg-sky-700 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>{children}</button>
  )
}
