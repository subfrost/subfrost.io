"use client"

import { useState } from "react"
import type { RecurringPush, PushChannel, PushFrequency } from "@prisma/client"
import { channelLabel } from "./pushChannel"
import { saveRecurrence, deleteRecurrence, type RecurrenceInput } from "@/actions/cms/marketing-pushes"

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const CHANNELS: PushChannel[] = ["ARTICLE", "X", "EMAIL", "STAT_CARD", "OTHER"]
const FREQS: PushFrequency[] = ["WEEKLY", "BIWEEKLY", "MONTHLY"]

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : ""
}

export function RecurrenceEditorDialog({ rules, onClose }: { rules: RecurringPush[]; onClose: () => void }) {
  const [editing, setEditing] = useState<Partial<RecurringPush> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(form: RecurrenceInput) {
    setSaving(true); setError(null)
    const res = await saveRecurrence(form)
    setSaving(false)
    if (res.ok) onClose(); else setError(res.error)
  }
  async function remove(id: string) {
    setSaving(true); setError(null)
    const res = await deleteRecurrence(id)
    setSaving(false)
    if (res.ok) onClose(); else setError(res.error)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background rounded-lg p-4 w-[460px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Recurring pushes</h2>
          <button type="button" className="text-sm border rounded px-2 py-1"
            onClick={() => setEditing({ title: "", channel: "ARTICLE", frequency: "WEEKLY", dayOfWeek: 5, active: true })}>
            New rule
          </button>
        </div>

        {!editing && (
          <div className="space-y-1">
            {rules.length === 0 && <div className="text-sm text-muted-foreground">No recurring rules yet</div>}
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                <span className="flex-1 truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">{channelLabel(r.channel)} · {r.frequency} · {DOW[r.dayOfWeek]}{r.active ? "" : " · off"}</span>
                <button type="button" className="text-xs border rounded px-2 py-0.5" onClick={() => setEditing(r)}>Edit</button>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <RecurrenceForm
            initial={editing}
            saving={saving}
            onCancel={() => setEditing(null)}
            onSave={save}
            onDelete={editing.id ? () => remove(editing.id as string) : undefined}
          />
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-end">
          <button type="button" className="text-sm border rounded px-3 py-1" onClick={onClose} disabled={saving}>Close</button>
        </div>
      </div>
    </div>
  )
}

function RecurrenceForm({
  initial, saving, onCancel, onSave, onDelete,
}: {
  initial: Partial<RecurringPush>
  saving: boolean
  onCancel: () => void
  onSave: (form: RecurrenceInput) => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial.title ?? "")
  const [channel, setChannel] = useState<PushChannel>((initial.channel as PushChannel) ?? "ARTICLE")
  const [frequency, setFrequency] = useState<PushFrequency>((initial.frequency as PushFrequency) ?? "WEEKLY")
  const [dayOfWeek, setDayOfWeek] = useState<number>(initial.dayOfWeek ?? 5)
  const [active, setActive] = useState<boolean>(initial.active ?? true)
  const [endDate, setEndDate] = useState<string>(toDateInput(initial.endDate ?? null))

  function submit() {
    onSave({
      id: initial.id,
      title,
      channel,
      frequency,
      dayOfWeek,
      active,
      startDate: toDateInput(initial.startDate ?? null) || new Date().toISOString().slice(0, 10),
      endDate: endDate || null,
    })
  }

  return (
    <div className="space-y-2 border-t pt-2">
      <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-2">
        <select className="border rounded px-2 py-1 text-sm flex-1" value={channel} onChange={(e) => setChannel(e.target.value as PushChannel)}>
          {CHANNELS.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm flex-1" value={frequency} onChange={(e) => setFrequency(e.target.value as PushFrequency)}>
          {FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm flex-1" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
          {DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        <label className="flex items-center gap-1 text-muted-foreground">Ends<input type="date" className="border rounded px-2 py-1 text-sm text-foreground" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>
      <div className="flex justify-between">
        {onDelete ? <button type="button" className="text-sm text-red-600" onClick={onDelete} disabled={saving}>Delete</button> : <span />}
        <div className="flex gap-2">
          <button type="button" className="text-sm border rounded px-3 py-1" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="text-sm border rounded px-3 py-1 font-medium" onClick={submit} disabled={saving}>Save</button>
        </div>
      </div>
    </div>
  )
}
