"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SkeletonTable } from "@/components/cms/Skeleton"
import { deserterListAction, upsertDeserterAction } from "@/actions/cms/legal"
import {
  summarizeDeserters, swapEligible, SWAP_STATUS_LABELS, DESERTION_STATUS_LABELS,
  type LegalEntityRow, type DeserterRow, type DesertionStatus, type SwapStatus,
} from "@/lib/financials/legal/shapes"

const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const num = (n: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }))
const DSTATUS_CLS: Record<DesertionStatus, string> = {
  RETAINED: "bg-emerald-900/40 text-emerald-300",
  DESERTED: "bg-red-900/40 text-red-300",
  UNDECIDED: "bg-zinc-800 text-zinc-400",
}
const SWAP_CLS: Record<SwapStatus, string> = {
  NOT_STARTED: "bg-zinc-800 text-zinc-400",
  PROPOSED: "bg-sky-900/40 text-sky-300",
  ARCA_SIGNED: "bg-amber-900/40 text-amber-300",
  ALEC_SIGNED: "bg-amber-900/40 text-amber-300",
  FULLY_SIGNED: "bg-indigo-900/40 text-indigo-300",
  CONVERTED: "bg-emerald-900/40 text-emerald-300",
}

export function DesertersManager() {
  const [entities, setEntities] = useState<LegalEntityRow[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await deserterListAction()
    if (res.ok) {
      setEntities(res.entities); setCanEdit(res.canEdit); setDenied(false)
    } else {
      setDenied(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const deserters = useMemo(() => entities.map((e) => e.deserter).filter((d): d is DeserterRow => !!d), [entities])
  const summary = useMemo(() => summarizeDeserters(deserters), [deserters])

  const signOff = (entityId: string, patch: Parameters<typeof upsertDeserterAction>[1]) =>
    startTransition(async () => {
      const res = await upsertDeserterAction(entityId, patch)
      if (res.ok) fetchData()
      else setError(res.error)
    })

  if (denied) {
    return (
      <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-6 text-sm text-amber-200">
        Deserter SAFEs are part of the <strong>Legal</strong> record. You need the{" "}
        <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">legal.view</code> privilege to see them.
        Ask an admin who holds Legal access to grant it.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        OYL insiders with internal DIESEL vesting allocations. A deserter who did <em>not</em> desert their
        vest (RETAINED) is eligible to swap their OYL allocation into the SUBFROST equity deal — which needs{" "}
        <strong>Arca</strong> and <strong>Alec</strong> sign-off — and then converts to DIESEL.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Metric label="Deserter SAFEs" value={String(summary.count)} />
        <Metric label="Retained vest" value={String(summary.retained)} />
        <Metric label="Total swap equity" value={`${num(summary.totalEquityPct, 2)}%`} />
        <Metric label="DIESEL converted" value={num(summary.totalDieselConverted, 2)} />
        <Metric label="Fully signed" value={`${summary.fullySigned}/${summary.count}`} />
      </div>

      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}<button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

      {loading ? <SkeletonTable /> : deserters.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">
          No deserter SAFEs recorded yet.{canEdit ? " Add DESERTER entities in the Legal section." : ""}
        </div>
      ) : (
        <ul className="space-y-2">
          {entities.map((e) => {
            const d = e.deserter
            if (!d) return null
            const eligible = swapEligible(d)
            return (
              <li key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/legal/entities/${e.id}`} className="font-medium text-white hover:underline">{e.name}</Link>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${DSTATUS_CLS[d.desertedVest]}`}>{DESERTION_STATUS_LABELS[d.desertedVest]}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SWAP_CLS[d.swapStatus]}`}>{SWAP_STATUS_LABELS[d.swapStatus]}</span>
                      {eligible && <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">swap-ready</span>}
                    </div>
                    <div className="mt-1 text-sm text-zinc-300">
                      {d.oylRole ? `${d.oylRole} · ` : ""}OYL allocation {num(d.oylTokenPct, 2)}%
                      {d.deserterEquityPct != null ? ` · swap equity ${num(d.deserterEquityPct, 2)}%` : ""}
                      {d.dieselConverted != null ? ` · ${num(d.dieselConverted, 2)} DIESEL` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <SignBadge label="Arca" on={d.arcaSignedOff} />
                      <SignBadge label="Alec" on={d.alecSignedOff} />
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => signOff(e.id, { arcaSignedOff: !d.arcaSignedOff })}>
                        {d.arcaSignedOff ? "Unsign Arca" : "Arca sign off"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => signOff(e.id, { alecSignedOff: !d.alecSignedOff })}>
                        {d.alecSignedOff ? "Unsign Alec" : "Alec sign off"}
                      </Button>
                      {eligible && d.swapStatus !== "CONVERTED" && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => signOff(e.id, { swapStatus: "CONVERTED" })}>Mark converted</Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(editing === e.id ? null : e.id)}>{editing === e.id ? "Close" : "Edit"}</Button>
                    </div>
                  )}
                </div>
                {canEdit && editing === e.id && (
                  <DeserterEditForm
                    deserter={d}
                    disabled={pending}
                    onSave={(patch) => { signOff(e.id, patch); setEditing(null) }}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function DeserterEditForm({ deserter, onSave, disabled }: {
  deserter: DeserterRow
  onSave: (patch: Parameters<typeof upsertDeserterAction>[1]) => void
  disabled: boolean
}) {
  const [desertedVest, setDesertedVest] = useState<DesertionStatus>(deserter.desertedVest)
  const [swapStatus, setSwapStatus] = useState<SwapStatus>(deserter.swapStatus)
  const [oylRole, setOylRole] = useState(deserter.oylRole ?? "")
  const [oylTokenPct, setOylTokenPct] = useState(deserter.oylTokenPct != null ? String(deserter.oylTokenPct) : "")
  const [equityPct, setEquityPct] = useState(deserter.deserterEquityPct != null ? String(deserter.deserterEquityPct) : "")
  const [diesel, setDiesel] = useState(deserter.dieselConverted != null ? String(deserter.dieselConverted) : "")
  const [notes, setNotes] = useState(deserter.notes ?? "")
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 sm:grid-cols-3">
      <Field label="Vest status">
        <select className={INPUT} value={desertedVest} onChange={(e) => setDesertedVest(e.target.value as DesertionStatus)}>
          <option value="UNDECIDED">Undecided</option>
          <option value="RETAINED">Retained vest</option>
          <option value="DESERTED">Deserted vest</option>
        </select>
      </Field>
      <Field label="Swap status">
        <select className={INPUT} value={swapStatus} onChange={(e) => setSwapStatus(e.target.value as SwapStatus)}>
          {(Object.keys(SWAP_STATUS_LABELS) as SwapStatus[]).map((s) => <option key={s} value={s}>{SWAP_STATUS_LABELS[s]}</option>)}
        </select>
      </Field>
      <Field label="OYL role"><input className={INPUT} value={oylRole} onChange={(e) => setOylRole(e.target.value)} /></Field>
      <Field label="OYL allocation %"><input className={INPUT} type="number" value={oylTokenPct} onChange={(e) => setOylTokenPct(e.target.value)} /></Field>
      <Field label="Swap equity %"><input className={INPUT} type="number" value={equityPct} onChange={(e) => setEquityPct(e.target.value)} /></Field>
      <Field label="DIESEL converted"><input className={INPUT} type="number" value={diesel} onChange={(e) => setDiesel(e.target.value)} /></Field>
      <div className="sm:col-span-3">
        <Field label="Notes"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="sm:col-span-3">
        <Button size="sm" disabled={disabled} onClick={() => onSave({
          desertedVest, swapStatus, oylRole: oylRole.trim() || null,
          oylTokenPct: oylTokenPct ? Number(oylTokenPct) : null,
          deserterEquityPct: equityPct ? Number(equityPct) : null,
          dieselConverted: diesel ? Number(diesel) : null,
          notes: notes.trim() || null,
        })}>Save</Button>
      </div>
    </div>
  )
}

function SignBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${on ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}>
      {on ? "✓" : "○"} {label}
    </span>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-zinc-400">{label}<div className="mt-1">{children}</div></label>
}
