# Marketing schedule v2 — design spec

**Date:** 2026-06-29
**Author:** Vitor + Claude (brainstorming session)
**Status:** Approved design, pending implementation plan
**Builds on:** `2026-06-29-marketing-schedule-design.md` (v1, merged + live: PR #139 → main a59628d). This
spec completes the deferrals flagged in v1 §6 plus a new "achievement" calendar marking.

---

## 1. Summary

Four enhancements to the live `/admin/marketing/schedule` feature:

1. **Calendar "done" marking** — published pushes appear on the calendar (achievement / "work done"
   feel), not only in the Timeline.
2. **Manual metric inputs + screenshot upload** in the push editor — completes the stats-entry loop
   for non-article channels (X / email / stat-card) until the X API is wired.
3. **Recurrence-rule editor** — edit/disable the recurring rules (e.g. the weekly report) from the UI.
4. **Searchable article picker** — link a draft/article to a push by title instead of a raw id.

All four touch the existing `ScheduleClient` + push editor; the schema and server actions from v1
already support them (`metrics`, `screenshotUrl`, `saveRecurrence`/`deleteRecurrence`, `articleId`).
No schema migration is required.

---

## 2. Goals / non-goals

### Goals
- Make the calendar a record of accomplishment: completed pushes stay visible on their day.
- Let staff enter X/email/stat-card engagement manually (numbers + screenshot) so the Timeline shows
  real data before the X API exists.
- Let staff manage recurring rules (the weekly report) without a DB poke.
- Make linking an article to a push ergonomic (search by title).

### Non-goals
- **X API integration** — still out of scope; manual entry is the bridge. When the API lands, an
  ingestion job fills the same `metrics`/`screenshotUrl` fields — no rework.
- A "show/hide completed" calendar toggle — deferred (YAGNI). Revisit if the calendar feels cluttered.
- Drag-to-reschedule, topic-filtered RSS — still deferred from v1.

---

## 3. Feature 1 — Calendar "done" marking

**Behavior:**
- The calendar renders PUBLISHED pushes in addition to SCHEDULED + ghosts.
- A published push sits on the day `scheduledFor ?? publishedAt` (the planned day; falls back to the
  actual publish day when it had no schedule, e.g. a back-recorded X post).
- **Chip style:** the push's **channel color** (same `CHANNEL_META` bg/fg) + a **green check icon**
  (`ti-check`, color `#3B6D11`) — light, keeps channel identity, signals "done". No strikethrough, no
  full green fill.
- Clicking a done chip opens the push editor (read/edit; metrics visible).

**Implementation:**
- `ScheduleClient`: add a memoized `publishedByDate` bucket — `bucketByDate(published, p =>
  p.scheduledFor ?? p.publishedAt ...)`. Render its chips in each day cell after the scheduled chips,
  with the green-check style. Reuses the existing `bucketByDate` helper (no new pure logic, but the
  date-selection function is worth a small unit test).
- The Timeline tab is unchanged (still the stats-comparison view). Calendar = overview + achievement.

**Edge cases:** a PUBLISHED push with neither `scheduledFor` nor `publishedAt` (shouldn't happen) is
skipped by `bucketByDate`'s null guard.

---

## 4. Feature 2 — Manual metric inputs + screenshot upload

**Editor additions (`PushEditorDialog`):**
- Optional number inputs: `impressions`, `likes`, `reposts`, `clicks` → assembled into the `metrics`
  JSON passed to `savePush`.
- A screenshot upload: reuse `POST /api/admin/upload` (kind=inline) → returns a GCS URL stored in
  `screenshotUrl`. Show a small thumbnail/preview + a "remove" affordance when set.
- Fields are always shown (optional). They matter most for non-article channels; for article pushes
  GA4 still overlays automatically in the Timeline.

**Data flow:** editor state → `PushInput.metrics` (`{impressions?,likes?,reposts?,clicks?}`) +
`screenshotUrl` → `savePush` (already wired). Timeline render (`resolvePushAnalytics` + existing row)
already shows "N impr · manual" + a screenshot indicator.

**Implementation note:** extract the metric-fields block + upload handler into a small subcomponent
(`PushMetricsFields`) so `ScheduleClient.tsx` doesn't grow unwieldy.

---

## 5. Feature 3 — Recurrence-rule editor

- A **"Recurring"** button in the calendar header opens a dialog listing `RecurringPush` rules.
- Each rule is editable: `title`, `channel`, `frequency`, `dayOfWeek` (and `dayOfMonth` for MONTHLY),
  `active`, `endDate`. A rule can be created, edited, deactivated (`active=false` → stops generating
  ghosts), or deleted.
- Uses the existing `saveRecurrence` / `deleteRecurrence` actions. The page already loads `rules`
  (passed to `ScheduleClient`).
- Component: `RecurrenceEditorDialog` (its own file) + a `RecurrenceForm`. Disabling/ending a rule
  immediately changes which ghosts render (ghosts come from `expandOccurrences` over active rules).

---

## 6. Feature 4 — Searchable article picker

- In the editor, replace the raw `articleId` handling with a **searchable select** of articles by
  title (drafts + published).
- New query `listArticleOptions(): Promise<{ id: string; title: string; status: string }[]>` in
  `lib/cms/marketing-pushes.ts` — selects article id + primary-locale title + status, ordered by
  `updatedAt desc`. Resolve the title by `primaryLocale`
  (same pattern as the v1 push-title fix, to avoid wrong-locale titles).
- The page passes `articleOptions` to `ScheduleClient`; the editor renders a filterable combobox.
  Keep the existing "Open draft" link when an article is selected.
- Component: a lightweight `ArticleCombobox` (filter client-side over the passed options — the article
  count is small; no server search needed).

---

## 7. Architecture / file changes

**New:**
- `components/cms/marketing/PushMetricsFields.tsx` — metric inputs + screenshot upload.
- `components/cms/marketing/RecurrenceEditorDialog.tsx` — list + edit recurring rules.
- `components/cms/marketing/ArticleCombobox.tsx` — searchable article picker.
- tests under `tests/marketing/` for the new pure bits.

**Modified:**
- `components/cms/marketing/ScheduleClient.tsx` — `publishedByDate` bucket + done-chip render; wire
  the "Recurring" button; pass `articleOptions` to the editor; integrate the metric fields.
- `app/admin/marketing/schedule/page.tsx` — also fetch `listArticleOptions()` and pass it down.
- `lib/cms/marketing-pushes.ts` — add `listArticleOptions()`.

No schema/prisma changes. No new server actions (reuse v1's).

---

## 8. Error handling / edge cases
- Upload failure → show an inline error, keep the rest of the form usable (don't lose entered data).
- Metric inputs accept only numbers; blank = omitted (not 0). Non-numeric → ignored (the
  `resolvePushAnalytics` `num()` guard already normalizes).
- Deactivating a rule with already-materialized instances leaves those instances intact (only future
  ghosts stop).
- Done chips + scheduled chips on the same day stack in the cell (rare; bounded per day).

---

## 9. Testing
- **Unit (vitest):**
  - `publishedByDate` date-selection (scheduledFor preferred, publishedAt fallback, null skip).
  - `listArticleOptions` title resolution by `primaryLocale` (can mock prisma like the v1 actions test).
- **Component-level:** verified by `tsc` + `pnpm build` (the project has no heavy RTL suite for these;
  follow v1's pattern — pure logic TDD'd, components build-verified + manual smoke).
- **Gates:** `pnpm exec tsc --noEmit && pnpm test && pnpm build` green (except the ~8 pre-existing
  offline live-RPC `tests/integration` failures).
- **Manual smoke:** mark a push published → it shows on the calendar with a green check; enter X
  metrics + a screenshot → Timeline shows them; edit the weekly rule's day → ghosts move; link an
  article via search → "Open draft" works.

---

## 10. Constraints / deploy
- Branch from `main` (v1 already merged). Code via PR. Deploy is now agent-permitted (Vitor approved):
  merge → CI auto-runs `prisma db push` (no-op here, no schema change) + builds image → bump `newTag`
  (with quotes) in `k8s/kustomization.yaml` → Flux (annotate source→kustomization via kubectl-io.sh) →
  verify rollout. No seed needed (no new data).
- Windows + pnpm; `rm -rf .next` if switching branches leaves stale route types; `next build` EINVAL
  copyfile warning is benign.
