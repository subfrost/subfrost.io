"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getRegisterAction, updateRegisterAction } from "@/actions/cms/compliance"
import type { RegisterRow } from "@/lib/compliance/register"

interface Draft {
  entityName: string
  msbRegistered: boolean
  bsaId: string
  msbTracking: string
  ccoName: string
  ccoDesignated: string
}

const DASH = "—"
const show = (v: string) => (v.trim() ? v : DASH)

export function RegisterManager({ canEdit }: { canEdit: boolean }) {
  const [reg, setReg] = useState<RegisterRow | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchReg = useCallback(async () => {
    const res = await getRegisterAction()
    if (res.ok) { setReg(res.register); setError(null) } else setError(res.error)
  }, [])

  useEffect(() => { fetchReg() }, [fetchReg])

  const startEdit = () => {
    if (!reg) return
    setDraft({
      entityName: reg.entityName, msbRegistered: reg.msbRegistered, bsaId: reg.bsaId,
      msbTracking: reg.msbTracking, ccoName: reg.ccoName, ccoDesignated: reg.ccoDesignated,
    })
    setEditing(true)
  }

  const save = () =>
    startTransition(async () => {
      if (!draft) return
      const res = await updateRegisterAction(draft)
      if (res.ok) { setError(null); setEditing(false); fetchReg() } else setError(res.error)
    })

  const set = (f: keyof Draft, v: string | boolean) => setDraft((p) => (p ? { ...p, [f]: v } : p))

  if (!reg) return <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">Loading…</div>

  const field = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      {error && (
        <div className="mb-3 rounded-lg bg-red-950/40 p-2 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {editing && draft ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-500">Legal entity name</label>
              <Input value={draft.entityName} onChange={(e) => set("entityName", e.target.value)} placeholder="e.g. Acme Research, Inc." className="border-zinc-700 bg-zinc-900 text-zinc-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">BSA ID</label>
              <Input value={draft.bsaId} onChange={(e) => set("bsaId", e.target.value)} placeholder="MSB registration BSA ID" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">MSB tracking #</label>
              <Input value={draft.msbTracking} onChange={(e) => set("msbTracking", e.target.value)} placeholder="e.g. MRX…" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Compliance officer</label>
              <Input value={draft.ccoName} onChange={(e) => set("ccoName", e.target.value)} placeholder="CCO full name" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">CCO designated (YYYY-MM-DD)</label>
              <Input value={draft.ccoDesignated} onChange={(e) => set("ccoDesignated", e.target.value)} placeholder="2026-01-01" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
            </div>
            <div className="flex items-center gap-2">
              <input id="msbReg" type="checkbox" checked={draft.msbRegistered} onChange={(e) => set("msbRegistered", e.target.checked)} className="accent-sky-500" />
              <label htmlFor="msbReg" className="text-xs text-zinc-400">Registered as an MSB</label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); fetchReg() }}>Cancel</Button>
            <Button size="sm" disabled={pending} onClick={save}>Save</Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <KV label="Legal entity" value={show(reg.entityName)} wide />
            <KV label="MSB registered" value={reg.msbRegistered ? "Yes" : "No"} />
            <KV label="BSA ID" value={show(reg.bsaId)} mono />
            <KV label="MSB tracking #" value={show(reg.msbTracking)} mono />
            <KV label="Compliance officer" value={show(reg.ccoName)} />
            <KV label="CCO designated" value={show(reg.ccoDesignated)} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-zinc-600">
              {reg.updatedBy ? `Updated by ${reg.updatedBy}` : "Not yet set — click Edit to enter the real values"}
            </span>
            {canEdit && (
              <button type="button" onClick={startEdit} className="text-xs text-sky-400 hover:text-sky-300">Edit</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KV({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-zinc-900 py-1 last:border-0 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-zinc-500">{label}</span>
      <span className={`text-zinc-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  )
}
