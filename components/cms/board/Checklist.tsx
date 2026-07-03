"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import type { ChecklistItem } from "@/lib/tasks/types"

function cid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `cl-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`
  }
}

export function Checklist({ items, onChange, disabled }: {
  items: ChecklistItem[]
  onChange: (items: ChecklistItem[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState("")
  const done = items.filter((i) => i.checked).length

  function toggle(id: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)))
  }
  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id))
  }
  function add() {
    const text = draft.trim()
    if (!text) return
    onChange([...items, { id: cid(), text, checked: false }])
    setDraft("")
  }

  return (
    <div className="space-y-1.5">
      {items.length > 0 && (
        <div className="mb-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--ed-surface)]">
            <div className="h-full rounded-full bg-emerald-500/70 transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
          </div>
          <span className="tabular-nums text-[11px] text-[color:var(--ed-muted)]">{done}/{items.length}</span>
        </div>
      )}

      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.checked}
            disabled={disabled}
            onChange={() => toggle(item.id)}
            className="h-3.5 w-3.5 shrink-0 rounded border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-emerald-500 focus:ring-0"
          />
          <span className={`flex-1 text-sm ${item.checked ? "text-[color:var(--ed-muted)] line-through" : "text-[color:var(--ed-body)]"}`}>{item.text}</span>
          {!disabled && (
            <button onClick={() => remove(item.id)} aria-label="Remove item" className="shrink-0 text-[color:var(--ed-muted)] opacity-0 transition group-hover:opacity-100 hover:text-rose-400">
              <X size={13} />
            </button>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="mt-1 flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
            placeholder="Add an item…"
            className="flex-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 py-1 text-sm text-[color:var(--ed-ink)] placeholder:text-[color:var(--ed-muted)] focus:border-[color:var(--ed-muted)] focus:outline-none"
          />
          <button onClick={add} aria-label="Add checklist item" className="inline-flex items-center rounded-[6px] border border-[color:var(--ed-hair)] px-2 text-[color:var(--ed-body)] hover:bg-[color:var(--ed-surface)]">
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
