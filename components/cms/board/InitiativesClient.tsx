"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Archive, ArrowUpRight } from "lucide-react"
import type { InitiativeView, TaskView, InitiativeStatus } from "@/lib/tasks/types"
import { INITIATIVE_STATUS, INITIATIVE_STATUS_ORDER } from "@/lib/tasks/types"
import { initiativeProgress, buildInitiativeBoard } from "@/lib/tasks/board"
import { createInitiativeAction, archiveInitiativeAction, moveInitiativeAction } from "@/actions/tasks/board"

export function InitiativesClient({ initiatives, tasks, canEdit }: {
  initiatives: InitiativeView[]
  tasks: TaskView[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [color, setColor] = useState("#38bdf8")
  const [seedText, setSeedText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seedCount = seedText.split("\n").map((s) => s.trim()).filter(Boolean).length
  const boardCols = useMemo(() => buildInitiativeBoard(initiatives), [initiatives])

  async function create() {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await createInitiativeAction({ name, goal, color, seedText })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setName(""); setGoal(""); setSeedText(""); setColor("#38bdf8"); setOpen(false)
    router.refresh()
  }

  async function run(fn: () => Promise<unknown>) {
    await fn()
    router.refresh()
  }

  const inputCls = "rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-3 py-2 text-sm text-[color:var(--ed-ink)] placeholder:text-[color:var(--ed-muted)] outline-none transition-colors focus:border-[color:var(--ed-muted)]"

  return (
    <div className="ed-admin-reveal space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[color:var(--ed-hair)] pb-10">
        <div>
          <p className="text-sm text-[color:var(--ed-muted)]">Admin</p>
          <h1 className="mt-3 text-[56px] font-medium leading-none text-[color:var(--ed-ink)] md:text-[68px]">Initiatives</h1>
          <p className="mt-4 max-w-[620px] text-[17px] leading-[1.5] text-[color:var(--ed-body)]">
            Group board work by product, milestone, or launch so execution stays visible.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setOpen((v) => !v)} className="inline-flex h-10 items-center gap-1 rounded-[6px] bg-[color:var(--ed-action-bg)] px-4 text-sm text-[color:var(--ed-action-fg)] hover:opacity-85">
            <Plus size={16} /> New initiative
          </button>
        )}
      </div>

      {open && canEdit && (
        <div className="ed-admin-reveal space-y-3 border-t border-[color:var(--ed-hair)] pt-4">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Initiative name (e.g. frUSD deployment)" aria-label="Name" className={`flex-1 ${inputCls}`} />
            <input value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" className={`w-28 ${inputCls}`} />
          </div>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal / objective" aria-label="Goal" className={`w-full ${inputCls}`} />
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ed-muted)]" htmlFor="seed">Seed tasks - one per line:</label>
            <textarea id="seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} rows={4} aria-label="Seed tasks" placeholder={"Deploy frUSD contract\nAudit mint path"} className={`w-full font-mono ${inputCls}`} />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[color:var(--ed-muted)]">{seedCount} task{seedCount === 1 ? "" : "s"} will be created</span>
            <button onClick={create} disabled={busy || !name.trim()} className="inline-flex h-9 items-center rounded-[6px] bg-[color:var(--ed-action-bg)] px-3 text-sm text-[color:var(--ed-action-fg)] hover:opacity-85 disabled:opacity-45">Create + seed</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        {boardCols.columns.map((col) => (
          <div key={col.status} className="min-h-[320px] border-t border-[color:var(--ed-hair)] pt-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className={`text-sm font-medium ${INITIATIVE_STATUS[col.status].cls}`}>{col.title}</span>
              <span className="font-mono text-xs text-[color:var(--ed-muted)]">{col.count}</span>
            </div>
            <div className="space-y-2">
              {col.initiatives.map((i) => {
                const p = initiativeProgress(i.id, tasks)
                return (
                  <div key={i.id} className="rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-transform hover:-translate-y-0.5">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
                      <span className="font-medium text-[color:var(--ed-ink)]">{i.name}</span>
                      <ArrowUpRight size={13} className="text-[color:var(--ed-muted)]" />
                      {canEdit && (
                        <button onClick={() => run(() => archiveInitiativeAction(i.id))} aria-label="Archive" className="ml-auto text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]">
                          <Archive size={14} />
                        </button>
                      )}
                    </div>
                    {i.goal && <p className="mb-2 text-xs text-[color:var(--ed-body)]">{i.goal}</p>}
                    <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ed-surface)]">
                      <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: i.color }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-[color:var(--ed-muted)]">{p.done} / {p.total} done - {p.active} active</p>
                    {canEdit && (
                      <select
                        aria-label="Initiative status"
                        value={i.status}
                        onChange={(e) => run(() => moveInitiativeAction(i.id, e.target.value as InitiativeStatus))}
                        className="mt-2 w-full rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-1.5 py-1 text-[11px] text-[color:var(--ed-body)] focus:outline-none"
                      >
                        {INITIATIVE_STATUS_ORDER.map((s) => <option key={s} value={s}>{INITIATIVE_STATUS[s].label}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
              {col.initiatives.length === 0 && <p className="px-1 py-6 text-center text-xs text-[color:var(--ed-muted)]">None</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
