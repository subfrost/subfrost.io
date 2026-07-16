"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  getFincenDataAction,
  saveForm107Action,
  createSarAction,
  createCtrAction,
  queueSubmissionAction,
} from "@/actions/cms/fincen"
import { FORM_107_DEFAULTS } from "@/lib/fincen/schemas"
import type { DraftRow, SubmissionRow } from "@/lib/fincen/admin"
import type { Form107, Sar, Ctr } from "@/lib/fincen/schemas"
import { SkeletonTable } from "@/components/cms/Skeleton"

const SAR_TEMPLATE = JSON.stringify(
  {
    subject: { name: "" },
    activity: { startDate: "", totalUsd: 0, category: "other" },
    narrative: "",
    preparerName: "",
  },
  null,
  2,
)

const CTR_TEMPLATE = JSON.stringify(
  {
    subject: {
      name: "",
      accountId: "",
      address: { line1: "", city: "", state: "", zip: "" },
    },
    transactionDate: "",
    cashIn: 0,
    cashOut: 0,
    preparerName: "",
  },
  null,
  2,
)

const STATUS_CLS: Record<string, string> = {
  QUEUED: "bg-amber-950/50 text-amber-300 border-amber-800/50",
  TRANSMITTED: "bg-sky-950/50 text-sky-300 border-sky-800/50",
  ACCEPTED: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  ACKNOWLEDGED: "bg-emerald-950/50 text-emerald-200 border-emerald-700/60",
  REJECTED: "bg-red-950/50 text-red-300 border-red-800/50",
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  )
}

type Tab = "form107" | "sar" | "ctr" | "submissions"

interface FincenData {
  form107: DraftRow<Form107> | null
  sar: DraftRow<Sar>[]
  ctr: DraftRow<Ctr>[]
  submissions: SubmissionRow[]
}

export function FincenManager({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<FincenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Tab>("form107")

  // Form 107 state
  const [form107Json, setForm107Json] = useState("")
  const [form107ParseErr, setForm107ParseErr] = useState<string | null>(null)
  const [form107Saving, startForm107Save] = useTransition()

  // SAR state
  const [showNewSar, setShowNewSar] = useState(false)
  const [sarJson, setSarJson] = useState(SAR_TEMPLATE)
  const [sarParseErr, setSarParseErr] = useState<string | null>(null)
  const [sarPending, startSarTransition] = useTransition()

  // CTR state
  const [showNewCtr, setShowNewCtr] = useState(false)
  const [ctrJson, setCtrJson] = useState(CTR_TEMPLATE)
  const [ctrParseErr, setCtrParseErr] = useState<string | null>(null)
  const [ctrPending, startCtrTransition] = useTransition()

  // Queue pending
  const [queuePending, startQueueTransition] = useTransition()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await getFincenDataAction()
    if (res.ok) {
      setData({ form107: res.form107, sar: res.sar, ctr: res.ctr, submissions: res.submissions })
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // --- Form 107 tab ---

  function loadForm107Defaults() {
    setForm107Json(
      data?.form107
        ? JSON.stringify(data.form107.data, null, 2)
        : JSON.stringify(FORM_107_DEFAULTS, null, 2),
    )
    setForm107ParseErr(null)
  }

  function handleSaveForm107() {
    let parsed: unknown
    try {
      parsed = JSON.parse(form107Json)
    } catch (e) {
      setForm107ParseErr("JSON parse error: " + String(e))
      return
    }
    setForm107ParseErr(null)
    startForm107Save(async () => {
      const res = await saveForm107Action(parsed)
      if (res.ok) {
        await fetchData()
      } else {
        setForm107ParseErr(res.error)
      }
    })
  }

  // --- SAR tab ---

  function handleCreateSar() {
    let parsed: unknown
    try {
      parsed = JSON.parse(sarJson)
    } catch (e) {
      setSarParseErr("JSON parse error: " + String(e))
      return
    }
    setSarParseErr(null)
    startSarTransition(async () => {
      const res = await createSarAction(parsed)
      if (res.ok) {
        setShowNewSar(false)
        setSarJson(SAR_TEMPLATE)
        await fetchData()
      } else {
        setSarParseErr(res.error)
      }
    })
  }

  // --- CTR tab ---

  function handleCreateCtr() {
    let parsed: unknown
    try {
      parsed = JSON.parse(ctrJson)
    } catch (e) {
      setCtrParseErr("JSON parse error: " + String(e))
      return
    }
    setCtrParseErr(null)
    startCtrTransition(async () => {
      const res = await createCtrAction(parsed)
      if (res.ok) {
        setShowNewCtr(false)
        setCtrJson(CTR_TEMPLATE)
        await fetchData()
      } else {
        setCtrParseErr(res.error)
      }
    })
  }

  // --- Queue submission ---

  function handleQueue(draftId: string) {
    startQueueTransition(async () => {
      const res = await queueSubmissionAction(draftId)
      if (res.ok) {
        await fetchData()
      } else {
        setError(res.error)
      }
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "form107", label: "Form 107" },
    { id: "sar", label: "SAR" },
    { id: "ctr", label: "CTR" },
    { id: "submissions", label: "Submissions" },
  ]

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active === t.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : (
        <>
          {/* ===== Form 107 tab ===== */}
          {active === "form107" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={loadForm107Defaults}>
                    {data?.form107 ? "Load saved draft" : "Load defaults"}
                  </Button>
                )}
                {data?.form107 && (
                  <span className="text-xs text-zinc-500">
                    Last saved {new Date(data.form107.updatedAt).toLocaleString()} by{" "}
                    {data.form107.updatedBy}
                  </span>
                )}
              </div>
              {canEdit && (
                <>
                  <textarea
                    value={form107Json}
                    onChange={(e) => setForm107Json(e.target.value)}
                    placeholder="Click 'Load defaults' to seed the Form 107 JSON…"
                    className="w-full min-h-[20rem] rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    spellCheck={false}
                  />
                  {form107ParseErr && (
                    <div className="rounded-md bg-red-950/40 p-2 text-xs text-red-300">
                      {form107ParseErr}
                    </div>
                  )}
                  <Button
                    size="sm"
                    disabled={form107Saving || !form107Json.trim()}
                    onClick={handleSaveForm107}
                  >
                    {form107Saving ? "Saving…" : "Save draft"}
                  </Button>
                </>
              )}
              {!canEdit && !data?.form107 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-zinc-500">
                  No Form 107 draft saved yet.
                </div>
              )}
            </div>
          )}

          {/* ===== SAR tab ===== */}
          {active === "sar" && (
            <div className="space-y-3">
              {data?.sar.length === 0 && !showNewSar && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-zinc-500">
                  No SAR drafts yet.
                </div>
              )}
              {data && data.sar.length > 0 && (
                <ul className="space-y-3">
                  {data.sar.map((row) => (
                    <li key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-white">
                            {row.data.subject?.name || <span className="text-zinc-500">(no name)</span>}
                          </div>
                          <div className="mt-1 truncate text-sm text-zinc-400">
                            {row.data.narrative
                              ? row.data.narrative.slice(0, 80) + (row.data.narrative.length > 80 ? "…" : "")
                              : <span className="text-zinc-600">no narrative</span>
                            }
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Updated {new Date(row.updatedAt).toLocaleString()} · {row.updatedBy}
                          </div>
                        </div>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={queuePending}
                            onClick={() => handleQueue(row.id)}
                          >
                            Queue submission
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canEdit && (
                showNewSar ? (
                  <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <div className="text-sm font-medium text-zinc-300">New SAR</div>
                    <textarea
                      value={sarJson}
                      onChange={(e) => setSarJson(e.target.value)}
                      className="w-full min-h-[16rem] rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      spellCheck={false}
                    />
                    {sarParseErr && (
                      <div className="rounded-md bg-red-950/40 p-2 text-xs text-red-300">
                        {sarParseErr}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={sarPending} onClick={handleCreateSar}>
                        {sarPending ? "Creating…" : "Create"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowNewSar(false)
                          setSarJson(SAR_TEMPLATE)
                          setSarParseErr(null)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setShowNewSar(true)}>
                    + New SAR
                  </Button>
                )
              )}
            </div>
          )}

          {/* ===== CTR tab ===== */}
          {active === "ctr" && (
            <div className="space-y-3">
              {data?.ctr.length === 0 && !showNewCtr && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-zinc-500">
                  No CTR drafts yet.
                </div>
              )}
              {data && data.ctr.length > 0 && (
                <ul className="space-y-3">
                  {data.ctr.map((row) => (
                    <li key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-white">
                            {row.data.subject?.name || <span className="text-zinc-500">(no name)</span>}
                          </div>
                          <div className="mt-1 text-sm text-zinc-400">
                            Cash in: ${(row.data.cashIn ?? 0).toLocaleString()} · Cash out: ${(row.data.cashOut ?? 0).toLocaleString()}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Updated {new Date(row.updatedAt).toLocaleString()} · {row.updatedBy}
                          </div>
                        </div>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={queuePending}
                            onClick={() => handleQueue(row.id)}
                          >
                            Queue submission
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canEdit && (
                showNewCtr ? (
                  <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <div className="text-sm font-medium text-zinc-300">New CTR</div>
                    <textarea
                      value={ctrJson}
                      onChange={(e) => setCtrJson(e.target.value)}
                      className="w-full min-h-[16rem] rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      spellCheck={false}
                    />
                    {ctrParseErr && (
                      <div className="rounded-md bg-red-950/40 p-2 text-xs text-red-300">
                        {ctrParseErr}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={ctrPending} onClick={handleCreateCtr}>
                        {ctrPending ? "Creating…" : "Create"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowNewCtr(false)
                          setCtrJson(CTR_TEMPLATE)
                          setCtrParseErr(null)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setShowNewCtr(true)}>
                    + New CTR
                  </Button>
                )
              )}
            </div>
          )}

          {/* ===== Submissions tab ===== */}
          {active === "submissions" && (
            <div className="space-y-3">
              {data?.submissions.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-zinc-500">
                  No submissions yet. Queue a draft from the SAR or CTR tabs.
                </div>
              ) : (
                <ul className="space-y-3">
                  {data?.submissions.map((s) => (
                    <li key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-zinc-300">{s.trackingId}</span>
                            <Badge
                              label={s.type}
                              cls="bg-zinc-800 text-zinc-300 border-zinc-700"
                            />
                            <Badge
                              label={s.status}
                              cls={STATUS_CLS[s.status] ?? "bg-zinc-800 text-zinc-300 border-zinc-700"}
                            />
                          </div>
                          {s.message && (
                            <div className="mt-1 text-xs text-zinc-500">{s.message}</div>
                          )}
                          {(s.bsaId || s.enrollmentCode) && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              {s.bsaId && (
                                <span className="text-zinc-400">
                                  BSA ID <span className="font-mono text-zinc-200">{s.bsaId}</span>
                                </span>
                              )}
                              {s.enrollmentCode && (
                                <span className="text-zinc-400">
                                  Enrollment <span className="font-mono text-zinc-200">{s.enrollmentCode}</span>
                                </span>
                              )}
                            </div>
                          )}
                          <div className="mt-1 text-xs text-zinc-500">
                            Filed {new Date(s.submittedAt).toLocaleString()} · {s.submittedBy}
                            {s.acknowledgedAt && (
                              <> · Acknowledged {new Date(s.acknowledgedAt).toLocaleString()}</>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
