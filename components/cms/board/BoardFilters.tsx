"use client"

import type { BoardFilter, InitiativeView } from "@/lib/tasks/types"

export function BoardFilters({ filter, setFilter, initiatives, labels, meId }: {
  filter: BoardFilter
  setFilter: (f: BoardFilter) => void
  initiatives: InitiativeView[]
  labels: string[]
  meId: string
}) {
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-sky-500/50 bg-sky-500/15 text-sky-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500">Initiative:</span>
      <button className={pill(filter.initiativeId == null)} onClick={() => setFilter({ ...filter, initiativeId: null })}>All</button>
      {initiatives.map((i) => (
        <button key={i.id} className={pill(filter.initiativeId === i.id)} onClick={() => setFilter({ ...filter, initiativeId: i.id })}>
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: i.color }} />
          {i.name}
        </button>
      ))}
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
