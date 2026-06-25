"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Target, Archive } from "lucide-react"
import type { InitiativeView, TaskView } from "@/lib/tasks/types"
import { initiativeProgress } from "@/lib/tasks/board"
import { createInitiativeAction, archiveInitiativeAction } from "@/actions/tasks/board"

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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {initiatives.map((i) => {
          const p = initiativeProgress(i.id, tasks)
          return (
            <div key={i.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
                <span className="font-medium text-zinc-100">{i.name}</span>
                {canEdit && (
                  <button onClick={async () => { await archiveInitiativeAction(i.id); router.refresh() }} aria-label="Archive" className="ml-auto text-zinc-600 hover:text-zinc-400">
                    <Archive size={14} />
                  </button>
                )}
              </div>
              {i.goal && <p className="mb-3 text-xs text-zinc-400">{i.goal}</p>}
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: i.color }} />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500">{p.done} / {p.total} done · {p.active} active</p>
            </div>
          )
        })}
        {initiatives.length === 0 && <p className="text-sm text-zinc-500">No initiatives yet.</p>}
      </div>
    </div>
  )
}
