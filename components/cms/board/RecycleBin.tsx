"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X, RotateCcw, Trash2 } from "lucide-react"
import type { TaskView, InitiativeView } from "@/lib/tasks/types"
import { restoreTaskAction, purgeTaskAction } from "@/actions/tasks/board"

export function RecycleBin({ tasks, initiatives, onClose }: {
  tasks: TaskView[]
  initiatives: Record<string, InitiativeView>
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null)

  async function run(id: string, fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(id)
    await fn()
    setBusy(null)
    setConfirmPurge(null)
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 md:p-8" onClick={onClose}>
      <div className="my-4 w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100"><Trash2 size={16} className="text-zinc-400" /> Recycle bin</h2>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-300"><X size={20} /></button>
        </div>

        <div className="max-h-[70vh] space-y-2 overflow-y-auto p-4">
          {tasks.length === 0 && <p className="py-8 text-center text-sm text-zinc-600">The recycle bin is empty.</p>}
          {tasks.map((t) => {
            const initiative = t.initiativeId ? initiatives[t.initiativeId] ?? null : null
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{t.title}</p>
                  {initiative && (
                    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: initiative.color }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: initiative.color }} />{initiative.name}
                    </span>
                  )}
                </div>
                <button onClick={() => run(t.id, () => restoreTaskAction(t.id))} disabled={busy === t.id} className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
                  <RotateCcw size={12} /> Restore
                </button>
                {confirmPurge === t.id ? (
                  <button onClick={() => run(t.id, () => purgeTaskAction(t.id))} disabled={busy === t.id} className="shrink-0 rounded bg-rose-600 px-2 py-1 text-[11px] text-white hover:bg-rose-700 disabled:opacity-50">Confirm</button>
                ) : (
                  <button onClick={() => setConfirmPurge(t.id)} aria-label="Delete forever" className="shrink-0 text-zinc-600 hover:text-rose-400"><Trash2 size={13} /></button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
