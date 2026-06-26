"use client"

import { useState } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import type { BoardFilterState, InitiativeView, ProductView, MemberView, TaskPriority, TaskStatus } from "@/lib/tasks/types"
import { EMPTY_FILTERS, PRIORITY_ORDER, STATUS_ORDER, TASK_PRIORITY, TASK_STATUS } from "@/lib/tasks/types"
import { activeFilterCount } from "@/lib/tasks/board"

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

export function BoardFilters({ state, setState, products, initiatives, members, labels, meId }: {
  state: BoardFilterState
  setState: (s: BoardFilterState) => void
  products: ProductView[]
  initiatives: InitiativeView[]
  members: MemberView[]
  labels: string[]
  meId: string
}) {
  const [open, setOpen] = useState(false)
  const n = activeFilterCount(state)
  const set = (patch: Partial<BoardFilterState>) => setState({ ...state, ...patch })

  const chip = (active: boolean) =>
    `rounded-[999px] border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-[color:var(--ed-ink)] bg-[color:var(--ed-ink)] text-[color:var(--ed-canvas)]"
        : "border-[color:var(--ed-hair)] text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]"
    }`
  const section = "text-xs font-medium text-[color:var(--ed-muted)]"

  const assigneeOptions: { value: string; label: string }[] = [
    { value: "all", label: "Anyone" },
    { value: "mine", label: "My tasks" },
    { value: "unassigned", label: "Unassigned" },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button onClick={() => setOpen((v) => !v)} className={`inline-flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-sm ${
          n > 0
            ? "bg-[color:var(--ed-ink)] text-[color:var(--ed-canvas)]"
            : "text-[color:var(--ed-muted)] hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)]"
        }`}>
          <SlidersHorizontal size={15} /> Filters{n > 0 && <span className="rounded-full bg-[color:var(--ed-canvas)]/20 px-1.5 text-[11px]">{n}</span>}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="ed-admin-reveal absolute left-0 z-20 mt-2 w-[22rem] space-y-4 rounded-[8px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] p-4 shadow-[0_28px_80px_rgba(7,17,31,0.16)]">
              {/* Products */}
              {products.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={section}>Products</span>
                    {state.hiddenProducts.length > 0 && <button onClick={() => set({ hiddenProducts: [] })} className="text-[11px] text-[color:var(--ed-ink)] hover:opacity-70">Show all</button>}
                  </div>
                  <div className="ed-admin-scroll max-h-40 space-y-0.5 overflow-y-auto">
                    {products.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1 py-1 text-sm text-[color:var(--ed-ink)] hover:bg-[color:var(--ed-surface)]">
                        <input type="checkbox" checked={!state.hiddenProducts.includes(p.id)} onChange={() => set({ hiddenProducts: toggle(state.hiddenProducts, p.id) })} className="h-3.5 w-3.5 rounded border-[color:var(--ed-hair)] accent-[color:var(--ed-ink)] focus:ring-0" />
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/30" style={{ background: p.color }} />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Assignee */}
              <div>
                <span className={section}>Assignee</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {assigneeOptions.map((o) => (
                    <button key={o.value} className={chip(state.assignee === o.value)} onClick={() => set({ assignee: o.value })}>{o.label}</button>
                  ))}
                  <select aria-label="Assignee member" value={members.some((m) => m.id === state.assignee) ? state.assignee : ""} onChange={(e) => set({ assignee: e.target.value || "all" })} className="rounded-[999px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 py-1 text-xs text-[color:var(--ed-ink)] outline-none">
                    <option value="">Someone…</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
                  </select>
                </div>
              </div>

              {/* Priority */}
              <div>
                <span className={section}>Priority</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {PRIORITY_ORDER.slice().reverse().map((p: TaskPriority) => (
                    <button key={p} className={chip(state.priorities.includes(p))} onClick={() => set({ priorities: toggle(state.priorities, p) })}>{TASK_PRIORITY[p].label}</button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <span className={section}>Status</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s: TaskStatus) => (
                    <button key={s} className={chip(state.statuses.includes(s))} onClick={() => set({ statuses: toggle(state.statuses, s) })}>{TASK_STATUS[s].label}</button>
                  ))}
                </div>
              </div>

              {/* Initiative + Label */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={section}>Initiative</span>
                  <select aria-label="Initiative filter" value={state.initiativeId ?? ""} onChange={(e) => set({ initiativeId: e.target.value || null })} className="mt-1 h-8 w-full rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 text-xs text-[color:var(--ed-ink)] outline-none">
                    <option value="">All</option>
                    {initiatives.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div>
                  <span className={section}>Label</span>
                  <select aria-label="Label filter" value={state.label ?? ""} onChange={(e) => set({ label: e.target.value || null })} className="mt-1 h-8 w-full rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 text-xs text-[color:var(--ed-ink)] outline-none">
                    <option value="">All</option>
                    {labels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end border-t border-[color:var(--ed-hair)] pt-3">
                <button onClick={() => setState({ ...EMPTY_FILTERS })} className="text-xs text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]">Clear all</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick My-tasks toggle + active-filter pills outside the panel */}
      <button onClick={() => set({ assignee: state.assignee === "mine" ? "all" : "mine" })} className={chip(state.assignee === "mine")}>My tasks</button>
      {n > 0 && (
        <button onClick={() => setState({ ...EMPTY_FILTERS })} className="inline-flex items-center gap-1 text-xs text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]">
          <X size={12} /> Clear
        </button>
      )}
    </div>
  )
}
