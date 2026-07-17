# Marketing schedule v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four UI enhancements to the live marketing schedule: calendar "done" marking, manual metric inputs + screenshot upload, a recurrence-rule editor, and a searchable article picker.

**Architecture:** Pure helpers (`publishedCalendarDate`, `listArticleOptions`) are TDD'd; the rest are React components composed into the existing `ScheduleClient`/`PushEditor`. No schema change — reuses v1's `MarketingPush`/`RecurringPush` models, the `metrics`/`screenshotUrl` fields, and the existing server actions.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Prisma, Radix + shadcn (`command`, `popover`, `button`), Tailwind, lucide-react, Vitest (happy-dom).

## Global Constraints

- Branch from `main` (v1 already merged + live). Code ships via PR; deploy is agent-permitted this round (merge → CI auto-runs `prisma db push`, no-op here → bump `newTag` WITH QUOTES in `k8s/kustomization.yaml` → Flux annotate source→kustomization via `kubectl-io.sh` → verify rollout). No seed (no new data).
- **No schema/prisma changes.** Reuse v1 actions: `savePush`/`deletePush`/`saveRecurrence`/`deleteRecurrence` and `PushInput`/`RecurrenceInput` from `@/actions/cms/marketing-pushes`.
- `prisma` is the DEFAULT import: `import prisma from "@/lib/prisma"`. Path alias `@/` = repo root. Tests under `tests/marketing/`, run `pnpm exec vitest run <file>`.
- The push editor lives INSIDE `components/cms/marketing/ScheduleClient.tsx` as the `PushEditor` function (lines ~192-251). New sub-components go in their own files under `components/cms/marketing/`.
- Done-chip color = channel color (`CHANNEL_META[channel].bg`/`.fg`) + a green check (`lucide-react` `Check`, color `#3B6D11`). No green fill, no strikethrough.
- Upload contract: `POST /api/admin/upload`, `multipart/form-data` with `file=<File>` + `kind=inline` → `{ url }` (or `{ error }` 4xx). Reference: `components/cms/ProfileForm.tsx:41`.
- Windows + pnpm; `next build` `EINVAL copyfile` warning is benign (build exits 0). If switching branches leaves stale `.next` route types, `rm -rf .next` before `tsc`.
- The full `pnpm test` has ~8 pre-existing offline live-RPC failures in `tests/integration/` — unrelated; never block on them.

---

### Task 1: Calendar "done" marking (Feature 1)

**Files:**
- Create: `lib/cms/push-calendar.ts`
- Test: `tests/marketing/push-calendar.test.ts`
- Modify: `components/cms/marketing/ScheduleClient.tsx`

**Interfaces:**
- Produces: `publishedCalendarDate(push: Pick<MarketingPush,"scheduledFor"|"publishedAt">): Date | null`.
- Consumes: `bucketByDate` (`@/lib/cms/calendar-grid`), `CHANNEL_META` (`./pushChannel`), `Check` (`lucide-react`).

- [ ] **Step 1: Write the failing test** — `tests/marketing/push-calendar.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { publishedCalendarDate } from "@/lib/cms/push-calendar"

describe("publishedCalendarDate", () => {
  it("prefers scheduledFor", () => {
    const d = publishedCalendarDate({ scheduledFor: new Date("2026-07-03T00:00:00.000Z"), publishedAt: new Date("2026-07-05T00:00:00.000Z") })
    expect(d?.toISOString().slice(0, 10)).toBe("2026-07-03")
  })
  it("falls back to publishedAt when no scheduledFor", () => {
    const d = publishedCalendarDate({ scheduledFor: null, publishedAt: new Date("2026-07-05T00:00:00.000Z") })
    expect(d?.toISOString().slice(0, 10)).toBe("2026-07-05")
  })
  it("returns null when both are null", () => {
    expect(publishedCalendarDate({ scheduledFor: null, publishedAt: null })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/push-calendar.test.ts`
Expected: FAIL — cannot find module `@/lib/cms/push-calendar`.

- [ ] **Step 3: Implement** — `lib/cms/push-calendar.ts`:

```ts
import type { MarketingPush } from "@prisma/client"

/** The calendar day a PUBLISHED push sits on: its planned day if any, else the actual publish day. */
export function publishedCalendarDate(
  push: Pick<MarketingPush, "scheduledFor" | "publishedAt">,
): Date | null {
  const d = push.scheduledFor ?? push.publishedAt
  return d ? new Date(d) : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/push-calendar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire done-chips into the calendar.** In `components/cms/marketing/ScheduleClient.tsx`:

Add imports at the top (merge into existing import lines):
```ts
import { Check } from "lucide-react"
import { publishedCalendarDate } from "@/lib/cms/push-calendar"
```

Add a memo after the existing `published` memo (after line ~69):
```ts
  const publishedByDate = useMemo(() => bucketByDate(published, publishedCalendarDate), [published])
```

In the day-cell render, after the `{ghosts.map(...)}` block (after line ~142, still inside the cell `<div>`), add:
```tsx
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
```

- [ ] **Step 6: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc 0; build exits 0 (EINVAL copyfile warning is benign).

- [ ] **Step 7: Commit**

```bash
git add lib/cms/push-calendar.ts tests/marketing/push-calendar.test.ts components/cms/marketing/ScheduleClient.tsx
git commit -m "feat(marketing): show published pushes as done-chips on the calendar"
```

---

### Task 2: `listArticleOptions` query + page wiring (Feature 4, part 1)

**Files:**
- Modify: `lib/cms/marketing-pushes.ts`
- Test: `tests/marketing/article-options.test.ts`
- Modify: `app/admin/marketing/schedule/page.tsx`
- Modify: `components/cms/marketing/ScheduleClient.tsx` (add `articleOptions` prop, thread to `PushEditor`)

**Interfaces:**
- Produces: `listArticleOptions(): Promise<ArticleOption[]>` where `ArticleOption = { id: string; title: string; status: string }`.
- Consumes (later tasks): `ScheduleClient` now requires an `articleOptions: ArticleOption[]` prop; `PushEditor` receives `articleOptions`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/article-options.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({ default: { article: { findMany: vi.fn() } } }))

import { listArticleOptions } from "@/lib/cms/marketing-pushes"
import prisma from "@/lib/prisma"

beforeEach(() => vi.clearAllMocks())

describe("listArticleOptions", () => {
  it("resolves the title by primaryLocale and passes through status", async () => {
    vi.mocked(prisma.article.findMany).mockResolvedValueOnce([
      { id: "a1", status: "PUBLISHED", primaryLocale: "zh", translations: [{ title: "Hello", locale: "en" }, { title: "Ni hao", locale: "zh" }] },
      { id: "a2", status: "DRAFT", primaryLocale: "en", translations: [{ title: "Draft one", locale: "en" }] },
    ] as never)
    const opts = await listArticleOptions()
    expect(opts).toEqual([
      { id: "a1", status: "PUBLISHED", title: "Ni hao" },
      { id: "a2", status: "DRAFT", title: "Draft one" },
    ])
  })

  it("falls back to '(untitled)' when an article has no translations", async () => {
    vi.mocked(prisma.article.findMany).mockResolvedValueOnce([
      { id: "a3", status: "DRAFT", primaryLocale: "en", translations: [] },
    ] as never)
    expect(await listArticleOptions()).toEqual([{ id: "a3", status: "DRAFT", title: "(untitled)" }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/article-options.test.ts`
Expected: FAIL — `listArticleOptions` is not exported.

- [ ] **Step 3: Implement** — append to `lib/cms/marketing-pushes.ts`:

```ts
export interface ArticleOption { id: string; title: string; status: string }

export async function listArticleOptions(): Promise<ArticleOption[]> {
  const rows = await prisma.article.findMany({
    select: {
      id: true,
      status: true,
      primaryLocale: true,
      translations: { select: { title: true, locale: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })
  return rows.map((a) => ({
    id: a.id,
    status: a.status,
    title:
      a.translations.find((t) => t.locale === a.primaryLocale)?.title ??
      a.translations[0]?.title ??
      "(untitled)",
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/article-options.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the page.** In `app/admin/marketing/schedule/page.tsx`, import and fetch it, and pass it down. Change the imports + the `Promise.all` + the JSX:

```tsx
import { listPushes, listRecurringRules, listArticleOptions } from "@/lib/cms/marketing-pushes"
```
```tsx
  const [pushes, rules, articleOptions, dashboard] = await Promise.all([
    listPushes(),
    listRecurringRules(),
    listArticleOptions(),
    ga4Source.getDashboard(parseRange("90d")),
  ])

  return <ScheduleClient pushes={pushes} rules={rules} articleOptions={articleOptions} articleEngagement={dashboard.articleEngagement} />
```

- [ ] **Step 6: Add the prop to `ScheduleClient` and thread it to `PushEditor`.** In `components/cms/marketing/ScheduleClient.tsx`:

Import the type and extend `Props`:
```ts
import type { ArticleOption } from "@/lib/cms/marketing-pushes"
```
```ts
interface Props {
  pushes: PushRow[]
  rules: RecurringPush[]
  articleOptions: ArticleOption[]
  articleEngagement: ArticleEngagementRow[]
}
```
Destructure it: `export function ScheduleClient({ pushes, rules, articleOptions, articleEngagement }: Props) {`

Pass it to the editor render (replace the `<PushEditor ... />` block ~line 183):
```tsx
        <PushEditor
          initial={editing}
          articleOptions={articleOptions}
          onClose={() => setEditing(null)}
        />
```
Update the `PushEditor` signature to accept (but not yet use) the prop:
```tsx
function PushEditor({ initial, articleOptions, onClose }: { initial: Partial<PushRow>; articleOptions: ArticleOption[]; onClose: () => void }) {
```

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exits 0 (`articleOptions` is threaded but unused — fine; Task 3 uses it).

- [ ] **Step 8: Commit**

```bash
git add lib/cms/marketing-pushes.ts tests/marketing/article-options.test.ts app/admin/marketing/schedule/page.tsx components/cms/marketing/ScheduleClient.tsx
git commit -m "feat(marketing): listArticleOptions query + thread to push editor"
```

---

### Task 3: Searchable article picker (Feature 4, part 2)

**Files:**
- Create: `components/cms/marketing/ArticleCombobox.tsx`
- Modify: `components/cms/marketing/ScheduleClient.tsx` (PushEditor uses the combobox + sends `articleId`)

**Interfaces:**
- Consumes: `ArticleOption` (`@/lib/cms/marketing-pushes`); shadcn `Button`, `Popover*`, `Command*` from `@/components/ui/*`; `Check`, `ChevronsUpDown` (`lucide-react`).
- Produces: `ArticleCombobox({ options, value, onChange })`.

- [ ] **Step 1: Create the combobox** — `components/cms/marketing/ArticleCombobox.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import type { ArticleOption } from "@/lib/cms/marketing-pushes"

export function ArticleCombobox({
  options,
  value,
  onChange,
}: {
  options: ArticleOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between text-sm font-normal">
          <span className="truncate">{selected ? selected.title : "Link an article (optional)"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0">
        <Command>
          <CommandInput placeholder="Search articles…" />
          <CommandList>
            <CommandEmpty>No articles found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => { onChange(null); setOpen(false) }}>
                <Check className={`mr-2 h-4 w-4 ${value ? "opacity-0" : "opacity-100"}`} />
                No article
              </CommandItem>
              {options.map((o) => (
                <CommandItem key={o.id} value={`${o.title} ${o.id}`} onSelect={() => { onChange(o.id); setOpen(false) }}>
                  <Check className={`mr-2 h-4 w-4 ${value === o.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{o.title}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground">{o.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

> If `@/components/ui/command` exports differ from `Command/CommandEmpty/CommandGroup/CommandInput/CommandItem/CommandList`, open the file and use its actual export names — it is the project's shadcn Command wrapper.

- [ ] **Step 2: Use it in `PushEditor`.** In `components/cms/marketing/ScheduleClient.tsx`:

Add the import:
```ts
import { ArticleCombobox } from "./ArticleCombobox"
```
Add `articleId` state in `PushEditor` (near the other `useState`s, ~line 198):
```ts
  const [articleId, setArticleId] = useState<string | null>(initial.articleId ?? null)
```
In `submit()`, send the state instead of `initial.articleId`:
```ts
      articleId: articleId,
```
Render the combobox in the form (replace the existing `{initial.articleId && <a ...>Open draft</a>}` line ~239 with):
```tsx
        <ArticleCombobox options={articleOptions} value={articleId} onChange={setArticleId} />
        {articleId && <a className="text-sm text-blue-600 underline" href={`/admin/articles/${articleId}`}>Open draft</a>}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc 0; build exits 0.

- [ ] **Step 4: Commit**

```bash
git add components/cms/marketing/ArticleCombobox.tsx components/cms/marketing/ScheduleClient.tsx
git commit -m "feat(marketing): searchable article picker in the push editor"
```

---

### Task 4: Manual metric inputs + screenshot upload (Feature 2)

**Files:**
- Create: `components/cms/marketing/PushMetricsFields.tsx`
- Modify: `components/cms/marketing/ScheduleClient.tsx` (PushEditor state + render + send metrics/screenshotUrl)

**Interfaces:**
- Consumes: `PushMetrics` (`@/lib/cms/marketing-analytics`); `POST /api/admin/upload` (`file`+`kind=inline` → `{url}`).
- Produces: `PushMetricsFields({ metrics, screenshotUrl, onMetrics, onScreenshot })`.

- [ ] **Step 1: Create the fields component** — `components/cms/marketing/PushMetricsFields.tsx`:

```tsx
"use client"

import { useState } from "react"
import type { PushMetrics } from "@/lib/cms/marketing-analytics"

const FIELDS: { key: keyof PushMetrics; label: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "likes", label: "Likes" },
  { key: "reposts", label: "Reposts" },
  { key: "clicks", label: "Clicks" },
]

export function PushMetricsFields({
  metrics,
  screenshotUrl,
  onMetrics,
  onScreenshot,
}: {
  metrics: PushMetrics
  screenshotUrl: string | null
  onMetrics: (m: PushMetrics) => void
  onScreenshot: (url: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("kind", "inline")
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      onScreenshot(data.url as string)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2 border-t pt-2">
      <div className="text-xs font-medium text-muted-foreground">Manual metrics (X / email / stat-card)</div>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {f.label}
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1 text-sm text-foreground"
              value={metrics[f.key] ?? ""}
              onChange={(e) => onMetrics({ ...metrics, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="file" accept="image/*" className="text-xs"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
        {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
        {screenshotUrl && <a href={screenshotUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">view print</a>}
        {screenshotUrl && <button type="button" className="text-xs text-red-600" onClick={() => onScreenshot(null)}>remove</button>}
      </div>
      {err && <div className="text-xs text-red-600">{err}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Use it in `PushEditor`.** In `components/cms/marketing/ScheduleClient.tsx`:

Add the import:
```ts
import { PushMetricsFields } from "./PushMetricsFields"
```
Add state in `PushEditor` (~line 198), reading any existing metrics off `initial`:
```ts
  const [metrics, setMetrics] = useState<PushMetrics>((initial.metrics as PushMetrics | null) ?? {})
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(initial.screenshotUrl ?? null)
```
In `submit()`, add to the `PushInput`:
```ts
      metrics,
      screenshotUrl,
```
Render the component in the form (before the `{error && ...}` line ~240):
```tsx
        <PushMetricsFields metrics={metrics} screenshotUrl={screenshotUrl} onMetrics={setMetrics} onScreenshot={setScreenshotUrl} />
```

> Note: `PushInput` (from `@/actions/cms/marketing-pushes`) already declares `metrics?: PushMetrics | null` and `screenshotUrl?: string | null`, and `PushRow.metrics` is `Prisma.JsonValue` — the `as PushMetrics | null` cast on read mirrors the existing cast at `ScheduleClient.tsx:165`.

- [ ] **Step 3: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc 0; build exits 0.

- [ ] **Step 4: Commit**

```bash
git add components/cms/marketing/PushMetricsFields.tsx components/cms/marketing/ScheduleClient.tsx
git commit -m "feat(marketing): manual metric inputs + screenshot upload in the push editor"
```

---

### Task 5: Recurrence-rule editor (Feature 3)

**Files:**
- Create: `components/cms/marketing/RecurrenceEditorDialog.tsx`
- Modify: `components/cms/marketing/ScheduleClient.tsx` ("Recurring" button + dialog state)

**Interfaces:**
- Consumes: `RecurringPush`, `PushChannel`, `PushFrequency` (`@prisma/client`); `channelLabel` (`./pushChannel`); `saveRecurrence`, `deleteRecurrence`, `RecurrenceInput` (`@/actions/cms/marketing-pushes`).
- Produces: `RecurrenceEditorDialog({ rules, onClose })`.

- [ ] **Step 1: Create the dialog** — `components/cms/marketing/RecurrenceEditorDialog.tsx`:

```tsx
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
```

> `RecurrenceInput` (from `@/actions/cms/marketing-pushes`) is `{ id?, title, channel, frequency, dayOfWeek, dayOfMonth?, active, defaultNotes?, startDate, endDate? }` — `startDate`/`endDate` are ISO date strings; the action does `new Date(...)`.

- [ ] **Step 2: Add the "Recurring" button + dialog state in `ScheduleClient`.** In `components/cms/marketing/ScheduleClient.tsx`:

Add the import:
```ts
import { RecurrenceEditorDialog } from "./RecurrenceEditorDialog"
```
Add state near `editing` (~line 28):
```ts
  const [showRecurring, setShowRecurring] = useState(false)
```
Add the button in the calendar header row, after the "Today" button (~line 109):
```tsx
                <button className="ml-auto text-xs border rounded px-2 py-0.5" onClick={() => setShowRecurring(true)}>Recurring</button>
```
Render the dialog next to the `{editing && ...}` block (~line 187):
```tsx
      {showRecurring && <RecurrenceEditorDialog rules={rules} onClose={() => setShowRecurring(false)} />}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc 0; build exits 0; the build route list still includes `/admin/marketing/schedule`.

- [ ] **Step 4: Commit**

```bash
git add components/cms/marketing/RecurrenceEditorDialog.tsx components/cms/marketing/ScheduleClient.tsx
git commit -m "feat(marketing): recurrence-rule editor dialog"
```

---

### Task 6: Full gates + final review + PR + deploy

**Files:** none (verification + integration)

- [ ] **Step 1: Run the full gates**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: tsc 0; vitest green except the ~8 pre-existing offline live-RPC `tests/integration` failures; build exits 0 with `/admin/marketing/schedule` listed. (If `tsc` reports phantom errors from a stale `.next`, `rm -rf .next` and re-run.)

- [ ] **Step 2: Manual smoke (local `pnpm dev`)** as a `marketing.view` user:
- Mark a push PUBLISHED → it appears on its day with a green-check chip.
- Edit a push → enter X impressions/likes + upload a screenshot → Timeline shows "N impr · manual".
- Open "Recurring" → change the weekly rule's day → ghosts move to the new weekday; toggle Active off → ghosts disappear.
- In the editor, search an article by title and link it → "Open draft" points to it.

- [ ] **Step 3: Final whole-branch review + open the PR.** Dispatch a whole-branch review (per superpowers:requesting-code-review), fix any Critical/Important, then:
```bash
git push -u origin feat/marketing-schedule-v2
gh pr create --base main --title "feat(marketing): schedule v2 — done-marking + metrics editor + recurrence editor + article picker" --body "Implements docs/superpowers/specs/2026-06-29-marketing-schedule-v2-design.md"
```

- [ ] **Step 4: Merge + deploy (agent-permitted this round).**
- Confirm CI core checks green (Netlify checks are legacy/ignored); `gh pr merge <#> --squash`.
- Wait for `deploy.yml` to finish (the `migrate` job's `prisma db push` is a no-op — no schema change).
- Verify the Cloud Build short-SHA image exists for the merge commit (AR tags list via `gcp_token.py`); bump `newTag` (WITH QUOTES) in `k8s/kustomization.yaml` to that short SHA; push to `main`.
- Force Flux: annotate `gitrepository subfrost-io` then `kustomization subfrost-io` in `flux-system` with `reconcile.fluxcd.io/requestedAt=<ts>` via `kubectl-io.sh`; wait for `rollout status deploy/subfrost-io`.
- Verify live: `/admin/marketing/schedule` 307→login, home 200. No seed needed.

---

## Self-Review

**Spec coverage:**
- §3 done-marking → Task 1. ✓
- §4 manual metrics + screenshot → Task 4. ✓
- §5 recurrence editor → Task 5. ✓
- §6 article picker → Tasks 2 (query+wiring) + 3 (combobox). ✓
- §7 file structure → matches (push-calendar.ts, ArticleCombobox.tsx, PushMetricsFields.tsx, RecurrenceEditorDialog.tsx, marketing-pushes.ts edit, ScheduleClient/page edits). ✓
- §9 testing → pure helpers TDD'd (Tasks 1,2); components build-verified; full gates (Task 6). ✓
- §10 deploy → Task 6 Step 4. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The only conditional note (Command export names in Task 3) is a real, bounded fallback, not a placeholder.

**Type consistency:** `ArticleOption` (Task 2) used by `ArticleCombobox`/`PushEditor` (Tasks 2,3); `publishedCalendarDate` (Task 1) used in Task 1's ScheduleClient edit; `PushMetricsFields` props (Task 4) match `PushMetrics`; `RecurrenceInput` shape (Task 5) matches the v1 action. `PushInput` already carries `metrics`/`screenshotUrl`/`articleId`. ScheduleClient gains exactly one new required prop (`articleOptions`), added in Task 2 where the page starts passing it.
