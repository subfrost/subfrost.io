"use client"

import { useMemo, useState } from "react"
import * as Tabs from "@radix-ui/react-tabs"
import type { MarketingPush, RecurringPush, PushChannel, PushStatus } from "@prisma/client"
import type { PushRow, ArticleOption } from "@/lib/cms/marketing-pushes"
import type { ArticleEngagementRow } from "@/lib/analytics/source"
import { buildMonthGrid, toDateKey, bucketByDate } from "@/lib/cms/calendar-grid"
import { expandOccurrences } from "@/lib/cms/recurring-pushes"
import { resolvePushAnalytics, type PushMetrics } from "@/lib/cms/marketing-analytics"
import { CHANNEL_META, channelLabel } from "./pushChannel"
import { savePush, deletePush, materializeRecurrence, type PushInput } from "@/actions/cms/marketing-pushes"
import { publishedCalendarDate } from "@/lib/cms/push-calendar"
import { Check } from "lucide-react"
import { ArticleCombobox } from "./ArticleCombobox"
import { PushMetricsFields } from "./PushMetricsFields"
import { RecurrenceEditorDialog } from "./RecurrenceEditorDialog"

interface Props {
  pushes: PushRow[]
  rules: RecurringPush[]
  articleOptions: ArticleOption[]
  articleEngagement: ArticleEngagementRow[]
}

interface Ghost { ruleId: string; date: Date; title: string; channel: PushChannel }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

export function ScheduleClient({ pushes, rules, articleOptions, articleEngagement }: Props) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState({ year: today.getUTCFullYear(), month: today.getUTCMonth() })
  const [editing, setEditing] = useState<Partial<PushRow> | null>(null)
  const [showRecurring, setShowRecurring] = useState(false)

  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const rangeStart = weeks[0][0]
  const rangeEnd = weeks[weeks.length - 1][6]

  const scheduled = useMemo(
    () => pushes.filter((p) => p.status === "SCHEDULED" && p.scheduledFor),
    [pushes],
  )
  const byDate = useMemo(() => bucketByDate(scheduled, (p) => (p.scheduledFor ? new Date(p.scheduledFor) : null)), [scheduled])

  const materializedKeys = useMemo(() => {
    const s = new Set<string>()
    for (const p of pushes) if (p.recurrenceId && p.recurrenceDate) s.add(`${p.recurrenceId}:${toDateKey(new Date(p.recurrenceDate))}`)
    return s
  }, [pushes])

  const ghostsByDate = useMemo(() => {
    const map = new Map<string, Ghost[]>()
    for (const r of rules) {
      const occ = expandOccurrences(
        { frequency: r.frequency, dayOfWeek: r.dayOfWeek, dayOfMonth: r.dayOfMonth, startDate: new Date(r.startDate), endDate: r.endDate ? new Date(r.endDate) : null, active: r.active },
        rangeStart, rangeEnd,
      )
      for (const d of occ) {
        const key = toDateKey(d)
        if (materializedKeys.has(`${r.id}:${key}`)) continue
        const g: Ghost = { ruleId: r.id, date: d, title: r.title, channel: r.channel }
        const arr = map.get(key); if (arr) arr.push(g); else map.set(key, [g])
      }
    }
    return map
  }, [rules, rangeStart, rangeEnd, materializedKeys])

  const backlog = useMemo(() => pushes.filter((p) => p.status === "IDEA"), [pushes])
  const published = useMemo(
    () => pushes.filter((p) => p.status === "PUBLISHED").sort(
      (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
    ),
    [pushes],
  )
  const publishedByDate = useMemo(() => bucketByDate(published, publishedCalendarDate), [published])

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const m = c.month + delta
      if (m < 0) return { year: c.year - 1, month: 11 }
      if (m > 11) return { year: c.year + 1, month: 0 }
      return { year: c.year, month: m }
    })
  }

  async function openGhost(g: Ghost) {
    const res = await materializeRecurrence(g.ruleId, toDateKey(g.date))
    if (res.ok) setEditing({ id: res.id, title: g.title, channel: g.channel, status: "SCHEDULED", scheduledFor: g.date })
  }

  const todayKey = toDateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())))

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Marketing schedule</h1>
        <button className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setEditing({ status: "IDEA", channel: "ARTICLE", title: "" })}>
          New push
        </button>
      </div>

      <Tabs.Root defaultValue="calendar">
        <Tabs.List className="flex gap-2 border-b">
          <Tabs.Trigger value="calendar" className="px-3 py-2 text-sm data-[state=active]:font-medium">Calendar</Tabs.Trigger>
          <Tabs.Trigger value="timeline" className="px-3 py-2 text-sm data-[state=active]:font-medium">Timeline</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="calendar" className="pt-4">
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <button aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
                <span className="text-sm font-medium">{MONTHS[cursor.month]} {cursor.year}</span>
                <button aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
                <button className="ml-2 text-xs border rounded px-2 py-0.5" onClick={() => setCursor({ year: today.getUTCFullYear(), month: today.getUTCMonth() })}>Today</button>
                <button className="ml-auto text-xs border rounded px-2 py-0.5" onClick={() => setShowRecurring(true)}>Recurring</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DOW.map((d) => <div key={d} className="text-center text-xs text-muted-foreground">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weeks.flat().map((d) => {
                  const key = toDateKey(d)
                  const inMonth = d.getUTCMonth() === cursor.month
                  const dayPushes = byDate.get(key) ?? []
                  const ghosts = ghostsByDate.get(key) ?? []
                  return (
                    <div key={key} className={`min-h-[74px] rounded-md border p-1 text-xs ${inMonth ? "" : "opacity-50"} ${key === todayKey ? "border-blue-500" : ""}`}
                         onClick={() => setEditing({ status: "SCHEDULED", channel: "ARTICLE", title: "", scheduledFor: d })}>
                      <div className="text-muted-foreground">{d.getUTCDate()}</div>
                      {dayPushes.map((p) => {
                        const meta = CHANNEL_META[p.channel]
                        const late = p.scheduledFor && new Date(p.scheduledFor) < new Date(todayKey)
                        return (
                          <div key={p.id} className="mt-0.5 rounded px-1 truncate" style={{ background: late ? "#FCEBEB" : meta.bg, color: late ? "#A32D2D" : meta.fg }}
                               onClick={(e) => { e.stopPropagation(); setEditing(p) }}>
                            {p.title}{late ? " · late" : ""}
                          </div>
                        )
                      })}
                      {ghosts.map((g) => {
                        const meta = CHANNEL_META[g.channel]
                        return (
                          <div key={`${g.ruleId}:${key}`} className="mt-0.5 rounded px-1 truncate border border-dashed" style={{ color: meta.fg }}
                               onClick={(e) => { e.stopPropagation(); void openGhost(g) }}>
                            {g.title} · auto
                          </div>
                        )
                      })}
                      {(publishedByDate.get(key) ?? []).map((p) => {
                        const meta = CHANNEL_META[p.channel]
                        return (
                          <div key={`done-${p.id}`} className="mt-0.5 rounded px-1 truncate flex items-center gap-1" style={{ background: meta.bg, color: meta.fg }}
                               onClick={(e) => { e.stopPropagation(); setEditing(p) }}>
                            <Check size={11} style={{ color: "#3B6D11", flexShrink: 0 }} aria-label="done" />
                            <span className="truncate">{p.title}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="w-40 shrink-0">
              <div className="text-xs font-medium text-muted-foreground mb-1">Backlog</div>
              <div className="rounded-md bg-muted p-2 space-y-1">
                {backlog.length === 0 && <div className="text-xs text-muted-foreground">No ideas yet</div>}
                {backlog.map((p) => (
                  <div key={p.id} className="rounded px-1 text-xs truncate cursor-pointer" style={{ background: CHANNEL_META[p.channel].bg, color: CHANNEL_META[p.channel].fg }}
                       onClick={() => setEditing(p)}>{p.title}</div>
                ))}
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="timeline" className="pt-4 space-y-2">
          {published.length === 0 && <div className="text-sm text-muted-foreground">No published pushes yet</div>}
          {published.map((p) => {
            const a = resolvePushAnalytics({ channel: p.channel, articleSlug: p.article?.slug ?? null, metrics: (p.metrics as PushMetrics | null) }, articleEngagement)
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-md border p-2 text-sm cursor-pointer" onClick={() => setEditing(p)}>
                <span className="text-xs text-muted-foreground w-16 shrink-0">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "—"}</span>
                <span className="rounded px-1.5 text-xs shrink-0" style={{ background: CHANNEL_META[p.channel].bg, color: CHANNEL_META[p.channel].fg }}>{channelLabel(p.channel)}</span>
                <span className="flex-1 min-w-0 truncate">{p.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {a.source === "ga4" ? `${a.pageViews?.toLocaleString()} views · GA4`
                    : a.source === "manual" ? `${a.impressions?.toLocaleString() ?? "—"} impr · manual`
                    : "—"}
                </span>
              </div>
            )
          })}
        </Tabs.Content>
      </Tabs.Root>

      {editing && (
        <PushEditor
          initial={editing}
          articleOptions={articleOptions}
          onClose={() => setEditing(null)}
        />
      )}
      {showRecurring && <RecurrenceEditorDialog rules={rules} onClose={() => setShowRecurring(false)} />}
    </div>
  )
}

function PushEditor({ initial, articleOptions, onClose }: { initial: Partial<PushRow>; articleOptions: ArticleOption[]; onClose: () => void }) {
  const [title, setTitle] = useState(initial.title ?? "")
  const [channel, setChannel] = useState<PushChannel>((initial.channel as PushChannel) ?? "ARTICLE")
  const [status, setStatus] = useState<PushStatus>((initial.status as PushStatus) ?? "IDEA")
  const [scheduledFor, setScheduledFor] = useState(initial.scheduledFor ? toDateKey(new Date(initial.scheduledFor)) : "")
  const [refUrl, setRefUrl] = useState(initial.refUrl ?? "")
  const [notes, setNotes] = useState(initial.notes ?? "")
  const [articleId, setArticleId] = useState<string | null>(initial.articleId ?? null)
  const [metrics, setMetrics] = useState<PushMetrics>((initial.metrics as PushMetrics | null) ?? {})
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(initial.screenshotUrl ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true); setError(null)
    const input: PushInput = {
      id: initial.id, title, channel, status,
      scheduledFor: scheduledFor || null,
      refUrl: refUrl || null, notes: notes || null,
      articleId: articleId,
      metrics,
      screenshotUrl,
    }
    const res = await savePush(input)
    setSaving(false)
    if (res.ok) onClose(); else setError(res.error)
  }

  async function remove() {
    if (!initial.id) return
    setSaving(true)
    const res = await deletePush(initial.id)
    setSaving(false)
    if (res.ok) onClose(); else setError(res.error)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background rounded-lg p-4 w-[420px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-medium">{initial.id ? "Edit push" : "New push"}</h2>
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          <select className="border rounded px-2 py-1 text-sm flex-1" value={channel} onChange={(e) => setChannel(e.target.value as PushChannel)}>
            {(["ARTICLE","X","EMAIL","STAT_CARD","OTHER"] as PushChannel[]).map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm flex-1" value={status} onChange={(e) => setStatus(e.target.value as PushStatus)}>
            {(["IDEA","SCHEDULED","PUBLISHED","CANCELED"] as PushStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Reference URL (X post, etc.)" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
        <textarea className="w-full border rounded px-2 py-1 text-sm" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <ArticleCombobox options={articleOptions} value={articleId} onChange={setArticleId} />
        {articleId && <a className="text-sm text-blue-600 underline" href={`/admin/articles/${articleId}`}>Open draft</a>}
        <PushMetricsFields metrics={metrics} screenshotUrl={screenshotUrl} onMetrics={setMetrics} onScreenshot={setScreenshotUrl} />
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-between">
          {initial.id ? <button className="text-sm text-red-600" onClick={remove} disabled={saving}>Delete</button> : <span />}
          <div className="flex gap-2">
            <button className="text-sm border rounded px-3 py-1" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="text-sm border rounded px-3 py-1 font-medium" onClick={submit} disabled={saving}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
