# Marketing schedule — design spec

**Date:** 2026-06-29
**Author:** Vitor + Claude (brainstorming session)
**Status:** Approved design, pending implementation plan
**Origin:** flex demand — "aba de marketing no /admin" (marketing pushes timeline + RSS). Tutoriais explicitly **out of scope** (folded into the future `docs.subfrost.io` demand).

---

## 1. Summary

A new **Marketing schedule** area under `/admin/marketing/schedule` that gives the team a single
place to plan, schedule, and measure every marketing "push". A push is a broad marketing event —
an article publication, an X/Twitter post or thread, an email/newsletter blast, or a stat-card /
snapshot share. The page has two views:

- **Calendar** (month grid, Google-Calendar style) — plan the future. Each push is a chip on its
  day, colored by channel, linking to the related article draft. Includes a **backlog** of undated
  ideas and **recurring pushes** (e.g. a standing "weekly report" every Friday).
- **Timeline** (chronological list) — review the past. Published pushes ordered by date with
  engagement metrics inline, so they can be compared.

Plus a public **RSS 2.0 feed** (`/feed.xml`) covering published articles + published pushes, with
autodiscovery in the site `<head>`.

This reuses the existing `marketing.view` privilege, the GA4 analytics layer, the article/editor
infrastructure, and the GCS upload endpoint.

---

## 2. Goals / non-goals

### Goals
- First-class record of "what we pushed and when" across channels.
- Future planning surface that feels like a campaign calendar (the requested "Google Calendar for
  business" feel).
- Past performance comparison: real GA4 numbers for article pushes; manual numbers + screenshot for
  channels we can't yet read via API (X, email, stat-card).
- A standing **weekly report** push that appears automatically every Friday — no manual re-adding.
- An accessible RSS feed for distribution (Bitcoin-focused readers/aggregators).

### Non-goals (this build)
- **Tutorials** content category — deferred to the `docs.subfrost.io` demand.
- **X / email API integration** — engagement for non-article channels is entered manually (numbers
  + screenshot) until those APIs are wired. The data model is ready for them later.
- **Scheduled auto-publish** of articles — a scheduled push is a *plan/reminder*, it does not
  auto-flip an article to PUBLISHED. The person publishes and marks the push done.
- **Drag-to-reschedule** in the calendar — stretch goal (see §6), not required for v1.

---

## 3. Data model

New models in `prisma/schema.prisma`. All changes are **additive** (`prisma db push`, no data loss),
per project convention.

### Enums

```prisma
enum PushChannel {
  ARTICLE      // publicação no blog subfrost.io
  X            // X / Twitter (@subfrost_news)
  EMAIL        // newsletter / disparo a assinantes
  STAT_CARD    // share de stat-card ou protocol snapshot
  OTHER
}

enum PushStatus {
  IDEA         // backlog, sem data firme
  SCHEDULED    // tem data, no futuro
  PUBLISHED    // já saiu (passado)
  CANCELED     // cancelado / skip de uma ocorrência recorrente
}

enum PushFrequency {
  WEEKLY
  BIWEEKLY
  MONTHLY
}
```

### MarketingPush (concrete instance)

```prisma
model MarketingPush {
  id            String         @id @default(cuid())
  title         String
  channel       PushChannel
  status        PushStatus     @default(IDEA)
  scheduledFor  DateTime?                       // planned date (future), UTC
  publishedAt   DateTime?                       // when it went out (past), UTC
  articleId     String?                         // optional link to an article (draft or published)
  article       Article?       @relation(fields: [articleId], references: [id], onDelete: SetNull)
  refUrl        String?                         // URL of the X post / external reference
  notes         String?                         // copy / observations
  metrics       Json?                           // manual analytics: { impressions, likes, reposts, clicks }
  screenshotUrl String?                         // analytics screenshot (GCS)
  recurrenceId  String?                         // set when materialized from a RecurringPush
  recurrence    RecurringPush? @relation(fields: [recurrenceId], references: [id], onDelete: SetNull)
  recurrenceDate DateTime?                      // the occurrence date this instance fills (UTC, date-only)
  createdById   String
  createdBy     User           @relation(fields: [createdById], references: [id])
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([scheduledFor])
  @@index([publishedAt])
  @@index([status])
  @@index([articleId])
  @@unique([recurrenceId, recurrenceDate])      // one materialized instance per occurrence
}
```

> Note: in Postgres, `NULL`s are distinct in a unique index, so non-recurring pushes (both
> `recurrenceId` and `recurrenceDate` null) are unconstrained — many can coexist. The unique
> constraint only binds materialized recurring instances.

### RecurringPush (rule)

```prisma
model RecurringPush {
  id           String          @id @default(cuid())
  title        String                            // e.g. "Weekly report"
  channel      PushChannel     @default(ARTICLE)
  frequency    PushFrequency   @default(WEEKLY)
  dayOfWeek    Int                               // 0=Sun … 6=Sat (used by WEEKLY/BIWEEKLY)
  dayOfMonth   Int?                              // used by MONTHLY
  active        Boolean        @default(true)
  defaultNotes String?
  startDate    DateTime                          // first valid occurrence (anchor for BIWEEKLY parity)
  endDate      DateTime?                         // optional end
  instances    MarketingPush[]
  createdById  String
  createdBy    User            @relation(fields: [createdById], references: [id])
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}
```

### Inverse relations (added to existing models)
- `Article`: `marketingPushes MarketingPush[]`
- `User`: `marketingPushes MarketingPush[]` and `recurringPushes RecurringPush[]`

> ⚠️ Integration note: PR #132 ("CMS redesign", 100 files) also edits `schema.prisma` and likely the
> `Article` model. Keep the added relation lines minimal/localized to ease rebase. Branch from `main`
> and rebase after #132 / #138 land.

### Domain rules
- A push **optionally** links one article; **many pushes can link the same article** (publish +
  X thread + email = 3 pushes on one article).
- **Past vs future is derived from `status`**, not from dates:
  - Calendar view shows `SCHEDULED` (and `IDEA` in the backlog).
  - Timeline view shows `PUBLISHED` (desc by `publishedAt`).
- A `SCHEDULED` push whose `scheduledFor` is in the past and is not yet `PUBLISHED` renders as
  **"late"** (red) in the calendar — no automatic status flip.

---

## 4. Recurring pushes (the "weekly report")

The calendar shows recurring occurrences **without** pre-creating rows (no cron/backfill job).

- **Generation:** for the visible month range, expand each `active` `RecurringPush` into occurrence
  dates (respecting `frequency`, `dayOfWeek`/`dayOfMonth`, `startDate`/`endDate`). Render each as a
  **ghost chip** (dashed border + "auto" tag).
- **Materialization:** opening/editing a ghost creates a concrete `MarketingPush` with
  `recurrenceId` + `recurrenceDate` = that occurrence. From then on, that date shows the concrete
  push (the `@@unique([recurrenceId, recurrenceDate])` constraint enforces one instance per
  occurrence; the ghost for that date is suppressed because a concrete instance exists).
- **Skip a week:** materialize-then-`CANCELED` (a canceled instance for that occurrence suppresses
  the ghost without showing an active push).
- **Seed:** one `RecurringPush` — `title: "Weekly report"`, `frequency: WEEKLY`, `dayOfWeek: 5`
  (Friday), `channel: ARTICLE`, `active: true`, `startDate` = deploy date. Editable in the rule
  editor (channel/day/frequency).

Occurrence-generation logic lives in a pure, unit-testable helper:
`lib/cms/recurring-pushes.ts → expandOccurrences(rule, rangeStart, rangeEnd): Date[]`.

---

## 5. Analytics (hybrid)

- **Article pushes:** pulled **live** from the existing GA4 layer (`lib/analytics`), matched by
  `article.slug` against the `articleEngagement` rows (`pageViews`, `avgEngagementSeconds`). Nothing
  stored — the GA4 layer already caches in Redis (~15 min TTL). If GA4 is not configured, show "—"
  (degrade, don't break — matches current `/admin/marketing/analytics` behavior).
- **Non-article pushes (X / email / stat-card):** read `metrics` (JSON) + `screenshotUrl`. The push
  editor lets staff type impressions/likes/reposts/clicks and upload a screenshot via the existing
  `/api/admin/upload` (kind=inline) → GCS.
- Any push may carry manual `metrics`; for article pushes the GA4 numbers are shown **in addition**
  (manual does not overwrite GA4).
- Merge helper: `lib/cms/marketing-pushes.ts → attachAnalytics(pushes, ga4Dashboard)` — pure,
  unit-testable (join by slug, fall back to manual/"—").

---

## 6. UI

### Page & nav
- Route: `app/admin/marketing/schedule/page.tsx` — async server component. Gate with the standard
  pattern: `const me = await currentUser(); if (!me) redirect('/admin/login'); if
  (!me.privileges.includes('marketing.view')) redirect('/admin')`.
- Nav: add a "Schedule" item (Calendar icon) to the Marketing group in `lib/cms/admin-nav.ts`,
  gated by `marketing.view`.
  > ⚠️ #138 also edits this file's Marketing group — localize the edit, rebase after #138.
- Client component: `components/cms/marketing/ScheduleClient.tsx` (Radix Tabs: Calendar | Timeline).

### Calendar tab
- Custom 7-col CSS grid month view with month nav (‹ / › / Today).
- Day cell: date number + push chips colored by channel (legend at top). Ghost chips (dashed) for
  recurring occurrences; "late" chips (red) for overdue `SCHEDULED`.
- Click empty day → new push prefilled with that date. Click a chip → push editor.
- Side **Backlog** panel: `IDEA` pushes without a date.
- Channel colors (self-contained light/dark-safe fills, from the CDS palette): ARTICLE=blue,
  X=gray, EMAIL=amber, STAT_CARD=purple, OTHER=gray.

### Timeline tab
- List of `PUBLISHED` pushes, desc by `publishedAt`. Row: date, channel badge, title, linked
  article, metrics inline (article → GA4 "views · engagement"; others → manual "impressions · likes"
  + screenshot thumbnail).
- Filters: channel + date range (reuse `lib/analytics/range.ts` presets).

### Push editor (Radix dialog/drawer)
- Fields: title, channel, status, `scheduledFor` (react-day-picker), `publishedAt`, article
  (searchable select of articles/drafts → becomes the "draft link"), `refUrl`, notes, manual metrics
  (impressions/likes/reposts/clicks), screenshot upload.
- When an article is linked: **"Open draft"** button → `/admin/articles/[id]`.

### Recurrence editor
- Small form to edit the rule(s): title, channel, frequency, day, active. Reachable from the
  calendar (e.g. a "Recurring" button).

### Stretch goal (not v1)
- **Drag** a chip to another day / from backlog onto a day to reschedule. If it complicates v1, ship
  without it — date changes via the picker in the editor. (Would add `@dnd-kit` or similar.)

---

## 7. RSS feed

- Route handler: `app/feed.xml/route.ts` — returns RSS 2.0 XML,
  `Content-Type: application/rss+xml; charset=utf-8`, cache `s-maxage=300, stale-while-revalidate`.
- Items = published articles (rich item with content) **+** `PUBLISHED` `MarketingPush` rows
  (article push → rich item; non-article push → "link" item: title + description + `refUrl`/image).
- Article data reused via existing `getPublishedPreviews()`; push data via a **new**
  `lib/cms/marketing-pushes.ts → getPublishedPushesForFeed()` (avoid editing `lib/cms/articles.ts`,
  which #132/#75 touch).
- XML built by a pure helper `lib/cms/rss.ts → buildRssXml(items)` (unit-testable; proper escaping).
- Autodiscovery: add
  `<link rel="alternate" type="application/rss+xml" title="SUBFROST" href="/feed.xml">` to the site
  `<head>` in `app/layout.tsx`.
  > ⚠️ #132 edits `app/layout.tsx` — single-line head addition, rebase after #132.
- Topic feeds (`/feed/[tag].xml`) are an easy future extension (pushes/articles carry tags) — not v1.

---

## 8. Server actions / API

`actions/cms/marketing-pushes.ts` ("use server"), each guarded with
`await requirePrivilege('marketing.view')` and `revalidatePath` of the schedule route:
- `savePush(input)` — create/update a `MarketingPush`.
- `deletePush(id)`.
- `materializeRecurrence(ruleId, occurrenceDateISO)` — create the concrete instance for an
  occurrence (idempotent via the unique constraint; returns existing if present).
- `saveRecurrence(input)` / `deleteRecurrence(id)`.

Reused as-is: `/api/admin/upload` (screenshot), `lib/analytics` (GA4), `currentUser` /
`requirePrivilege` (authz).

---

## 9. Error handling / edge cases
- GA4 not configured → metrics show "—" (degrade, matches existing analytics page).
- Linked article deleted → `onDelete: SetNull`; push survives without an article.
- Time zones: store `scheduledFor` / `publishedAt` in UTC; render in the browser's zone via
  `date-fns` (consistent with the rest of the app). Occurrence dates are date-only (UTC midnight) to
  avoid off-by-one across zones.
- Recurrence with no end date → only ever expanded for the visible range, so never unbounded.
- Materialize race → unique `(recurrenceId, recurrenceDate)` makes it idempotent.

---

## 10. Testing
- **Unit (vitest):**
  - `expandOccurrences` — correct weekday, range bounds, BIWEEKLY parity from `startDate`, `endDate`
    cutoff, skip when a `CANCELED` instance exists.
  - past/future split by `status`.
  - `attachAnalytics` — GA4↔push merge by slug, fallback to manual/"—".
  - `buildRssXml` — well-formed XML, escaping, article vs link items.
- **Gates:** `pnpm exec tsc --noEmit && pnpm test && pnpm build` green (except the ~8 integration
  live-RPC tests that are offline in this environment).
- Manual: create/schedule/publish a push; verify calendar/timeline/RSS; verify the Friday ghost
  materializes.

---

## 11. Files (planned)

**New:**
- `app/admin/marketing/schedule/page.tsx`
- `components/cms/marketing/ScheduleClient.tsx` (+ smaller calendar/timeline/editor subcomponents)
- `actions/cms/marketing-pushes.ts`
- `lib/cms/marketing-pushes.ts` (queries + `attachAnalytics` + `getPublishedPushesForFeed`)
- `lib/cms/recurring-pushes.ts` (`expandOccurrences`)
- `lib/cms/rss.ts` (`buildRssXml`)
- `app/feed.xml/route.ts`
- tests alongside the above

**Edited (keep minimal for rebase):**
- `prisma/schema.prisma` (new models/enums + 3 relation lines) — overlaps #138, #132
- `lib/cms/admin-nav.ts` (1 nav item) — overlaps #138
- `app/layout.tsx` (1 head `<link>`) — overlaps #132

**Explicitly NOT edited** (reuse): `lib/cms/iam/registry.ts` (reuse `marketing.view`),
`app/admin/layout.tsx`, `lib/cms/articles.ts`.

---

## 12. Integration / sequencing constraints
- Branch from `main`, not from the #138 branch. Code changes ship via PR (never push to main).
- Open PRs touching shared files: **#138** (marketing nav, schema), **#132** (CMS redesign — 100
  files, edits schema + layout + articles), **#75** (docs redesign — layout/articles). #132 is the
  biggest conflict risk. Plan to rebase after #138 and #132 land; keep shared-file edits localized.
- Deploy is human-owned: bump `newTag` (WITH QUOTES) in `k8s/kustomization.yaml` → Flux (annotate
  GitRepository source before Kustomization). Run `prisma db push` for the additive schema at deploy.
