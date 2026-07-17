# Protocol analytics tab — design spec

**Date:** 2026-06-30
**Author:** Vitor + Claude (brainstorming session)
**Status:** Approved design, pending implementation plan

---

## 1. Summary

A new **Protocol analytics** tab in the `/admin` Marketing section that turns the existing on-demand
protocol snapshot into a **daily time-series** and visualizes the protocol's growth in one place:
holders, token prices, BTC locked, market caps, and ratios over time.

This is **Piece 1** of a larger vision. **Piece 2** (X engagement per post) is deliberately out of
scope here — it is blocked on getting X API access (pay-per-use), and would specify fields the X API
itself dictates. Piece 1 delivers standalone value with zero external dependency and is designed so the
X layer slots in later (the daily series already carries the protocol context any post can be correlated
against by date — no per-post capture hook needed).

Reuses the existing snapshot machinery end-to-end. **No Prisma schema migration.**

---

## 2. Goals / non-goals

### Goals
- Capture one protocol snapshot automatically every day at 00:00 UTC.
- Show the protocol's growth over time in a dedicated tab: 3 north-star KPIs up top (DIESEL holders,
  DIESEL price, BTC locked), a trend chart, secondary metrics, and a history table.
- Reuse `captureSnapshot`, `createSnapshot`, `diffSnapshots`, the home-stats store, the Cloud Scheduler
  pattern, and `marketing.view` gating — build only what's genuinely new.

### Non-goals
- **X engagement / per-post analytics** — Piece 2, blocked on X API access. Not in this spec.
- **Unifying with the GA4 "Site analytics" tab** — long-term vision; would duplicate/expand scope now.
- **A per-post snapshot capture hook on publish** — redundant with the daily series (which already
  records the protocol state for every date); would also add a slow external call to the publish path.
- **Sharing / OG-image / public surface** for the analytics — internal tab only.
- Intraday granularity — one snapshot/day is the right resolution for macro growth.

---

## 3. Feature 1 — Daily capture (cron)

**Behavior:** every day at 00:00 UTC, capture a protocol snapshot and store it as a `MarketingSnapshot`
row with `context: "DAILY"`. Idempotent per day: if the job runs twice in the same UTC day, it does not
create a second row.

**Mechanism (mirrors `/api/prefetch`):**
- New route `GET /api/marketing/snapshot-cron`. Auth: `Authorization: Bearer <secret>`. Reuses the
  existing `PREFETCH_SECRET` (already provisioned + injected via `deploy.yml`) — no new secret to
  provision. If the secret is unset (local dev), the route is unauthenticated, same convention as
  `/api/prefetch`.
- The route calls the existing `captureSnapshot()` (`lib/marketing/snapshot.ts`, never throws — missing
  data nulls out and flips `partial`) and persists via `createSnapshot({ label, context: "DAILY",
  refUrl: null, articleId: null, note: null }, payload, null)` (`createdById = null` — system-generated).
  `label` = e.g. `"Daily 2026-06-30"`.
- **Idempotency:** before creating, check `findFirst({ where: { context: "DAILY", createdAt: { gte:
  <start of current UTC day> } } })`; if a row exists, return `{ skipped: true }` without creating.
- New Cloud Scheduler job `subfrost-daily-snapshot` (`schedule "5 0 * * *"`, `--time-zone UTC` — 00:05 UTC,
  just after the 00:00 prefetch tick so the snapshot reads the freshest `HomeStat`), created/updated by a
  new step in `deploy.yml` exactly like the existing `subfrost-prefetch` step.

**`SnapshotContext` change:** extend the TS union in `lib/marketing/types.ts` to
`"GENERAL" | "X_POST" | "ARTICLE" | "DAILY"`. Leave `SNAPSHOT_CONTEXTS` (the manual-capture dropdown
options) unchanged — `"DAILY"` is system-generated, not user-selectable. The DB `context` column is a
free String, so **no Prisma migration**.

---

## 4. Feature 2 — The Protocol analytics tab (Layout A + history)

**Route:** `/admin/marketing/protocol`, gated by `marketing.view` (like the other Marketing tabs). New
nav leaf "Protocol analytics" under the Marketing group in `lib/cms/admin-nav.ts` + route→privilege entry
in `lib/cms/iam/registry.ts`.

**Layout A (approved):**
1. **KPI hero row** — 3 stat tiles: DIESEL holders, DIESEL price, BTC locked. Each shows current value +
   a Δ (7-day) + a sparkline.
2. **Trend chart** — a recharts line chart (recharts 2.15.0 is already a dependency) of the daily series,
   with a selector to switch which metric is plotted (holders / DIESEL price / BTC locked, plus the
   secondaries).
3. **Secondary metrics** — a compact row: FIRE price, frBTC supply, DIESEL market cap, BTC/USD,
   BTC/DIESEL & BTC/FIRE ratios.
4. **History table** — daily rows (date + holders + DIESEL price + BTC locked + market cap), most recent
   first, with a 7-day delta summary. This is the "Layout C" table folded in below A as the history view.

**Data source:** the page (RSC) reads the `DAILY` series via a new `listDailySnapshots()` query
(`findMany({ where: { context: "DAILY" }, orderBy: { createdAt: "asc" }, include: <createdBy/article> })`,
mirroring `listSnapshots`) and passes it to a `ProtocolAnalyticsClient` component.

---

## 5. Data & deltas

- **Series assembly (pure, TDD'd):** `buildProtocolSeries(rows: SnapshotRow[]): SeriesPoint[]` — maps each
  daily `SnapshotRow.payload` to a flat plottable point `{ date, dieselHolders, dieselPrice, btcLocked,
  firePrice, frbtcSupply, dieselMarketcap, btcUsd, btcDiesel, btcFire }`. Null-safe (a `partial` snapshot
  yields nulls for missing fields, which render as gaps, not zeros).
- **KPI deltas (pure, TDD'd):** reuse the existing `diffSnapshots(before, after)` (`lib/marketing/diff.ts`)
  to compute Δ between the latest snapshot and the one ~7 / ~30 days earlier. A small helper picks the
  comparison rows by date (nearest on/before `latest - N days`) and runs `diffSnapshots`.
- **Retention:** indefinite. One row/day is trivial (365/year).

---

## 6. Architecture / file changes

**New:**
- `app/api/marketing/snapshot-cron/route.ts` — the daily cron endpoint (auth, idempotency, capture+store).
- `app/admin/marketing/protocol/page.tsx` — RSC page (gated), reads the series, renders the client.
- `components/cms/marketing/ProtocolAnalyticsClient.tsx` — Layout A (heroes, recharts trend chart +
  metric selector, secondaries, history table).
- `lib/marketing/protocol-series.ts` — `buildProtocolSeries` + the delta-comparison helper (pure).
- Tests under `tests/marketing/` for the pure helpers.

**Modified:**
- `lib/marketing/types.ts` — extend `SnapshotContext` with `"DAILY"`.
- `lib/marketing/snapshot-store.ts` — add `listDailySnapshots()` (and the idempotency `findFirst` helper,
  or inline it in the route).
- `lib/cms/admin-nav.ts` — add the "Protocol analytics" leaf under Marketing.
- `lib/cms/iam/registry.ts` — add the `/admin/marketing/protocol` route→`marketing.view` mapping.
- `.github/workflows/deploy.yml` — add the `subfrost-daily-snapshot` Cloud Scheduler step.

No Prisma schema change. No new server actions (the cron route persists directly via `createSnapshot`).

---

## 7. Error handling / edge cases

- **Partial capture:** `captureSnapshot` never throws; if `oyl.alkanode` or the stats store fails for a
  field, that field is null and `payload.partial = true`. The series renders nulls as gaps; the tile shows
  the last known value with a subtle "partial" hint where relevant.
- **Missing day (total failure):** a day with no `DAILY` row is a gap in the chart/table, never a zero.
- **Idempotency:** double-fire in the same UTC day creates exactly one row (the `findFirst` guard).
- **Empty state:** before the first snapshot exists, the tab shows an empty state ("No snapshots yet — the
  first daily capture runs at 00:00 UTC"), not a crash.
- **Delta with insufficient history:** if there's no snapshot ~7/30 days back yet, the Δ shows "—".

---

## 8. Testing

- **Unit (vitest, TDD):**
  - `buildProtocolSeries` — field extraction, null/partial handling, ordering by date.
  - the delta-comparison helper — picks the right nearest-on-or-before row; returns "—"/null when history
    is too short.
  - the idempotency guard (if extracted as a pure predicate over existing rows + "today").
- **Component-level:** the tab is build-verified (`tsc` + `pnpm build`) + manual smoke — same pattern as
  the schedule v1/v2 work (the project has no RTL suite for these).
- **Gates:** `pnpm exec tsc --noEmit && pnpm test && pnpm build` green (except the ~8 pre-existing offline
  live-RPC `tests/integration` failures).
- **Manual smoke:** hit `/api/marketing/snapshot-cron` with the Bearer secret → a `DAILY` row appears;
  hit it again same day → `skipped`; open `/admin/marketing/protocol` → heroes + chart + history render;
  seed a couple of `DAILY` rows to see deltas + the trend line.

---

## 9. Constraints / deploy

- Branch from `main`. Code via PR (memory `always-pr-for-code-changes`). Deploy is agent-permitted this
  round (same as v2): merge → CI auto-runs `prisma db push` (no-op here, no schema change) + builds image
  → bump `newTag` (with quotes) in `k8s/kustomization.yaml` → Flux (annotate source→kustomization via
  `kubectl-io.sh`) → verify rollout.
- **The Cloud Scheduler job** is created at deploy time by the new `deploy.yml` step (needs the
  `PREFETCH_SECRET` to be set, which it already is). Verify the job exists post-deploy and fire it once
  manually to seed the first `DAILY` row.
- Windows + pnpm; `rm -rf .next` if switching branches leaves stale route types; `next build` EINVAL
  copyfile warning is benign.

---

## 10. Reuse summary

| Already exists (reused) | New |
|---|---|
| `captureSnapshot()` — assembles the payload | `/api/marketing/snapshot-cron` route |
| `createSnapshot()` — persists a row | `subfrost-daily-snapshot` Scheduler job (deploy.yml step) |
| `diffSnapshots()` — field-by-field deltas | `/admin/marketing/protocol` page + `ProtocolAnalyticsClient` |
| home-stats store / `getStats()` | `buildProtocolSeries` + delta helper (pure, TDD'd) |
| Cloud Scheduler pattern (`/api/prefetch`) | `listDailySnapshots()` query |
| `marketing.view` gating, recharts 2.15.0 | `SnapshotContext += "DAILY"` (TS only) |
