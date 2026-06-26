"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Target, Archive } from "lucide-react"
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

  const inputCls = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Target size={20} className="text-zinc-400" /> Initiatives
        </h1>
        {canEdit && (
          <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
            <Plus size={16} /> New initiative
          </button>
        )}
      </div>

      {open && canEdit && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Initiative name (e.g. frUSD deployment)" aria-label="Name" className={`flex-1 ${inputCls}`} />
            <input value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" className={`w-28 ${inputCls}`} />
          </div>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal / objective" aria-label="Goal" className={`w-full ${inputCls}`} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500" htmlFor="seed">Seed tasks — one per line:</label>
            <textarea id="seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} rows={4} aria-label="Seed tasks" placeholder={"Deploy frUSD contract\nAudit mint path"} className={`w-full font-mono ${inputCls}`} />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{seedCount} task{seedCount === 1 ? "" : "s"} will be created</span>
            <button onClick={create} disabled={busy} className="rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 disabled:opacity-50">Create + seed</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {boardCols.columns.map((col) => (
          <div key={col.status} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className={`text-sm font-medium ${INITIATIVE_STATUS[col.status].cls}`}>{col.title}</span>
              <span className="text-xs text-zinc-500">{col.count}</span>
            </div>
            <div className="space-y-2">
              {col.initiatives.map((i) => {
                const p = initiativeProgress(i.id, tasks)
                return (
                  <div key={i.id} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
                      <span className="font-medium text-zinc-100">{i.name}</span>
                      {canEdit && (
                        <button onClick={() => run(() => archiveInitiativeAction(i.id))} aria-label="Archive" className="ml-auto text-zinc-600 hover:text-zinc-400">
                          <Archive size={14} />
                        </button>
                      )}
                    </div>
                    {i.goal && <p className="mb-2 text-xs text-zinc-400">{i.goal}</p>}
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: i.color }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500">{p.done} / {p.total} done · {p.active} active</p>
                    {canEdit && (
                      <select
                        aria-label="Initiative status"
                        value={i.status}
                        onChange={(e) => run(() => moveInitiativeAction(i.id, e.target.value as InitiativeStatus))}
                        className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none"
                      >
                        {INITIATIVE_STATUS_ORDER.map((s) => <option key={s} value={s}>{INITIATIVE_STATUS[s].label}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
              {col.initiatives.length === 0 && <p className="px-1 py-6 text-center text-xs text-zinc-600">None</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
