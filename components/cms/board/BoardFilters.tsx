"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import type { BoardFilter, InitiativeView } from "@/lib/tasks/types"

export function BoardFilters({ filter, setFilter, initiatives, labels, meId, hidden, toggleHidden }: {
  filter: BoardFilter
  setFilter: (f: BoardFilter) => void
  initiatives: InitiativeView[]
  labels: string[]
  meId: string
  hidden: Set<string>
  toggleHidden: (id: string) => void
}) {
  const [showVis, setShowVis] = useState(false)
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-sky-500/50 bg-sky-500/15 text-sky-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`
  // Focus pills only list initiatives the user hasn't hidden (keeps the row lean).
  const visibleInitiatives = initiatives.filter((i) => !hidden.has(i.id))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500">Initiative:</span>
      <button className={pill(filter.initiativeId == null)} onClick={() => setFilter({ ...filter, initiativeId: null })}>All</button>
      {visibleInitiatives.map((i) => (
        <button key={i.id} className={pill(filter.initiativeId === i.id)} onClick={() => setFilter({ ...filter, initiativeId: i.id })}>
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: i.color }} />
          {i.name}
        </button>
      ))}

      {/* Visibility (turn off the bloat) */}
      {initiatives.length > 0 && (
        <div className="relative">
          <button onClick={() => setShowVis((v) => !v)} className={`inline-flex items-center gap-1 ${pill(hidden.size > 0)}`} title="Show / hide initiatives">
            <Eye size={13} /> {hidden.size > 0 ? `${hidden.size} hidden` : "Show/hide"}
          </button>
          {showVis && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowVis(false)} />
              <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">Visible initiatives</span>
                  {hidden.size > 0 && (
                    <button onClick={() => [...hidden].forEach(toggleHidden)} className="text-[11px] text-sky-400 hover:text-sky-300">Show all</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {initiatives.map((i) => (
                    <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-zinc-200 hover:bg-zinc-800">
                      <input type="checkbox" checked={!hidden.has(i.id)} onChange={() => toggleHidden(i.id)} className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-sky-500 focus:ring-0" />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} />
                      <span className="truncate">{i.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <button className={pill(!!filter.ownerId)} onClick={() => setFilter({ ...filter, ownerId: filter.ownerId ? undefined : meId })}>My tasks</button>
      {labels.length > 0 && (
        <select
          aria-label="Label"
          value={filter.label ?? ""}
          onChange={(e) => setFilter({ ...filter, label: e.target.value || undefined })}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:outline-none"
        >
          <option value="">All labels</option>
          {labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      )}
    </div>
  )
}
