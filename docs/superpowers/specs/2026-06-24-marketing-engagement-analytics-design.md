# Marketing — Engagement Analytics (v1) — Design

- **Date:** 2026-06-24
- **Status:** Approved (brainstorm) → ready for implementation plan
- **Area:** subfrost.io `/admin` — **Marketing** section, new "Site analytics" page
- **Author:** Vitor + Claude (brainstorm session)

## Context

The `/admin` Marketing section shipped its first feature (protocol snapshot — on-chain state baseline) on 2026-06-24. flex + gabe asked for the **other half**: web **engagement analytics presented visually** inside the same Marketing section — visitors to the site, marketing/traffic sources, and per-article engagement — so the team has real adoption data beyond what Elon shares.

Key de-risking discovery: the data already exists. **GA4 is wired on subfrost.io** (`app/layout.tsx` gtag, property **`G-0RV3B8BK4B`**, ~1 year of data; CSP already allows google-analytics; `lib/analytics.ts` has a client `gtag` event helper). flex is also bringing an **Elasticsearch** backend (from x.subfrost.io, tracks TLS fingerprints) and **tlsd** can track unique users via TLS fingerprint (`Session.tlsFingerprint`), but those are still being set up (tlsd does not front subfrost.io yet). So v1 reads GA4; ES/tlsd is a future second source.

This is the sibling of the protocol-snapshot front: snapshot = on-chain baseline *before* a post; analytics = web response *after*.

## Goals

- A **"Site analytics"** page under the Marketing nav, gated by `marketing.view`, at `/admin/marketing/analytics`.
- Read GA4 (property `G-0RV3B8BK4B`) via the **GA4 Data API** and present four sections, each with a **date-range selector** (presets 7/28/90d + custom; default last 28d):
  1. **Visitors over time** — active users / sessions / pageviews as a time series.
  2. **Top pages** — most-visited paths.
  3. **Traffic sources (marketing)** — channels / referrers / utm campaigns.
  4. **Article engagement** — per-article pageviews + engagement time, joined to `Article` by slug.
- **Hybrid-ready:** the dashboard reads a normalized metric shape behind one source boundary; GA4 is the first adapter, Elasticsearch slots in later without touching the UI.
- **Graceful degradation:** if GA4 isn't configured (no property id / service account), the page shows "analytics not configured" instead of crashing.

## Non-goals (YAGNI for v1)

- No Elasticsearch/tlsd adapter yet (boundary is prepared; adapter is a fast-follow once flex finishes the cutover + grants ES access).
- No X/Twitter API integration (uncertain surface; separate later).
- No durable store / warmer / cron — an admin dashboard with a short cache is enough.
- No new Prisma schema. No new privilege (reuse `marketing.view`).
- No realtime; GA4 data is fine at ~15-minute cache freshness.
- No write/event-tracking changes (the existing `lib/analytics.ts` gtag helper stays as-is).

## Decisions (from brainstorm)

1. **Source:** hybrid — GA4 now, ES later, behind a normalized source boundary (not a plugin framework; just one clean module boundary).
2. **Sections:** all four (visitors, top pages, traffic sources, article engagement).
3. **Approach A — on-demand server-side + short cache.** The gated server page runs the GA4 reports for the selected range, each wrapped in a ~15min Redis cache. No warmer, no DB table.
4. **Auth without heavy deps:** mint the Google access token from a service-account JSON using `jose` (already a dependency) — sign an RS256 JWT, exchange at the OAuth token endpoint — mirroring the repo's `gcp_token.py` tooling. Raw REST `runReport` calls, matching `lib/rpc-client.ts` style. No `@google-analytics/data` / `google-auth-library` added.
5. **Gating:** reuse `marketing.view` (non-restricted → ADMIN auto-gets). A `analytics.view` split is a later option.

## Architecture

```
/admin/marketing/analytics (server page, gated marketing.view)
  └─ AnalyticsClient (client: date-range selector + 4 chart sections)
       └─ reads data passed from the page (server-fetched)

page.tsx  ──> lib/analytics/source.ts  (AnalyticsSource interface + normalized shapes)
                   └─ ga4Source (lib/analytics/ga4.ts)   ← v1 adapter
                        ├─ lib/analytics/google-auth.ts  (jose-minted access token, cached ~55min)
                        ├─ runReport() raw REST → analyticsdata.googleapis.com
                        └─ cacheGet/cacheSet (@/lib/redis), ~15min, key analytics:<report>:<range>
                   └─ (future) esSource  ← second adapter, same interface
```

### Modules / file structure

- `lib/analytics/source.ts` — normalized shapes + `AnalyticsSource` interface + `isAnalyticsConfigured()`.
- `lib/analytics/google-auth.ts` — `getGoogleAccessToken(): Promise<string | null>` (jose RS256 JWT → token; cached; null if unconfigured/failure, never throws).
- `lib/analytics/ga4.ts` — the GA4 adapter implementing `AnalyticsSource`: a private `runReport(body)` + four report functions producing normalized shapes, each cache-wrapped; null-guarded (any failure → empty/typed-null result, never throws).
- `lib/analytics/range.ts` — date-range presets + parsing (preset key → `{ startDate, endDate }` GA4 strings like `28daysAgo`/`today` or ISO dates), and a `rangeKey` for cache keys.
- `app/admin/marketing/analytics/page.tsx` — server component, gated, parses the range from searchParams, fetches the four sections via the source, renders `AnalyticsClient`.
- `components/cms/marketing/AnalyticsClient.tsx` — `"use client"`: date-range selector (updates the URL `?range=`), four sections using recharts via `components/ui/chart.tsx`, loading/empty/not-configured states.
- `lib/cms/admin-nav.ts` — add a "Site analytics" leaf to the existing `marketing` group.

### Normalized shapes (in `source.ts`)

```ts
interface VisitorPoint { date: string; activeUsers: number; sessions: number; pageViews: number }
interface VisitorsSeries { points: VisitorPoint[]; totals: { activeUsers: number; sessions: number; pageViews: number } }
interface TopPageRow { path: string; title: string | null; pageViews: number }
interface TrafficSourceRow { channel: string; source: string | null; campaign: string | null; sessions: number }
interface ArticleEngagementRow { slug: string; title: string | null; path: string; pageViews: number; avgEngagementSeconds: number | null }

interface AnalyticsDashboard {
  range: { start: string; end: string; preset: string }
  visitors: VisitorsSeries
  topPages: TopPageRow[]
  trafficSources: TrafficSourceRow[]
  articleEngagement: ArticleEngagementRow[]
  configured: boolean   // false when GA4 isn't set up → UI shows "not configured"
}

interface AnalyticsSource {
  getDashboard(range: DateRange): Promise<AnalyticsDashboard>
}
```

Every numeric field is guarded; a failed report yields an empty array / zeroed totals (never throws). `configured: false` short-circuits to empty sections + the not-configured banner.

## GA4 Data API reports

Endpoint: `POST https://analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY_ID}:runReport`, bearer = minted access token, body = `{ dateRanges: [{ startDate, endDate }], dimensions, metrics, ... }`.

| Section | dimensions | metrics | notes |
|---|---|---|---|
| Visitors over time | `date` | `activeUsers`, `sessions`, `screenPageViews` | sort by date asc → time series + summed totals |
| Top pages | `pagePath`, `pageTitle` | `screenPageViews` | orderBy pageViews desc, limit 20 |
| Traffic sources | `sessionDefaultChannelGroup`, `sessionSource`, `sessionCampaignName` | `sessions` | orderBy sessions desc, limit 20 |
| Article engagement | `pagePath` (+`pageTitle`) | `screenPageViews`, `userEngagementDuration` | `dimensionFilter` pagePath beginsWith `/articles/`; `avgEngagementSeconds = userEngagementDuration / screenPageViews` (guard /0) |

**Article slug join:** parse the slug from `pagePath` (`/articles/{slug}` → strip locale/query), then `prisma.article` + translation title for display. Rows whose slug doesn't resolve still render with the raw path + null title.

**Locale note:** the site serves `/articles/{slug}` (locale via cookie/`?lang=`, not a path prefix — see the i18n front), so `pagePath` is stable per article; strip a trailing `?lang=` query if GA includes it.

## Auth (`google-auth.ts`)

- Read `GA_SERVICE_ACCOUNT_JSON` (full SA JSON) + `GA4_PROPERTY_ID` from env. If either is missing → `isAnalyticsConfigured()` is false and `getGoogleAccessToken()` returns null.
- Mint: build a JWT (`iss`/`sub` = SA `client_email`, `aud` = `https://oauth2.googleapis.com/token`, `scope` = `https://www.googleapis.com/auth/analytics.readonly`, `iat`/`exp` ~1h), sign RS256 with the SA `private_key` via `jose`'s `SignJWT` + `importPKCS8`. POST `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>` to the token endpoint → `access_token`.
- Cache the token in-process (or Redis) until ~5 min before `exp`. Never throws — returns null on any failure (the dashboard degrades).

## UI

- **Page** (server, `force-dynamic`, gated): `currentUser()` → redirect login / `marketing.view` redirect admin; parse `?range=` (default `28d`); `const dash = await ga4Source.getDashboard(range)`; render `<AnalyticsClient dashboard={dash} />`.
- **AnalyticsClient** (`"use client"`):
  - **Date-range selector** (7d / 28d / 90d / custom) → updates `?range=` via `router.push`, server re-fetches.
  - **Not-configured banner** when `dashboard.configured === false` (links to "set `GA4_PROPERTY_ID` + `GA_SERVICE_ACCOUNT_JSON`").
  - **Visitors:** a recharts line/area chart (3 series) + the totals as stat chips.
  - **Top pages:** a table (path, title, pageViews) — optionally a bar.
  - **Traffic sources:** a table/bar (channel/source/campaign, sessions).
  - **Article engagement:** a table (title/slug, pageViews, avg engagement) sorted by views.
  - Empty-state per section when GA returns no rows.

## Config / secrets

- `GA4_PROPERTY_ID` — the numeric property id behind `G-0RV3B8BK4B` (NOT the `G-` measurement id).
- `GA_SERVICE_ACCOUNT_JSON` — a service-account JSON with **Analytics Viewer** on that property.
- Provisioned as a k8s secret (pattern: the existing `anthropic-api-key` direct-secret approach). **External dependency** (flex / GA admin) — the feature builds and deploys degrading (not-configured banner) until the secret lands, then it lights up with no code change. Document the secret in `.env.example` and the deploy runbook.

## Testing (TDD)

- `lib/analytics/range.ts`: preset → GA4 date strings + cache key; custom range parsing; invalid → default.
- `lib/analytics/ga4.ts`: GA4 `runReport` response → each normalized shape (mock the fetch + token); empty rows → empty arrays; HTTP/parse error → empty + never throws; `avgEngagementSeconds` guards /0; the article-slug parse.
- `lib/analytics/google-auth.ts`: unconfigured (missing env) → null + `isAnalyticsConfigured()` false; token cached/reused (mock fetch + a fixed SA key); failure → null.
- Article join: pagePath `/articles/foo` → Article title via mocked prisma; unresolved slug → null title, still rendered.
- Cache wrap: second call within TTL doesn't re-fetch (mock `cacheGet`/`cacheSet`).
- `AnalyticsClient`: renders each section from a fixture; not-configured banner when `configured: false`; range selector updates the URL.

Conventions: `import prisma from '@/lib/prisma'` default; mock `@/lib/prisma` / `@/lib/redis` / `fetch`; zod v3 for `?range=` parsing; vitest happy-dom; gates `npx tsc --noEmit` 0 / `CI=true npx vitest run` green / `npx next build` 0.

## Deploy notes

- **No schema, no warmer** → no init-container/migration concern, no `/api/prefetch` change.
- New dep: none required (uses `jose`, already present; raw REST). If the plan opts for `@google-analytics/data` instead, that's an added dependency — the spec's choice is the jose path to avoid it.
- Secret: add `GA4_PROPERTY_ID` + `GA_SERVICE_ACCOUNT_JSON` to the k8s secret + `external-secrets`/direct-secret, and to `.env.example`. CSP already permits GA on the client; server→GA is outbound REST (no CSP impact).
- Standard flow: merge → Cloud Build → bump `newTag` → Flux (reconcile source before kustomization). Post-deploy: open `/admin/marketing/analytics` (307 unprivileged); as ADMIN it shows the not-configured banner until the GA secret is provisioned, then real charts.

## Open questions / future

- **GA4 property id + service account** — confirm with flex / GA admin (the one external dependency). Until then the dashboard degrades gracefully.
- **Elasticsearch/tlsd adapter** — second `AnalyticsSource` for unique users (TLS fingerprint) + self-hosted metrics, once flex completes the tlsd cutover + grants ES access. Same boundary, no UI change.
- **X/Twitter API** — post-level engagement, if/when the API surface is confirmed. Separate.
- **`analytics.view` privilege split** — if read-only analytics viewers (distinct from snapshot capture) are needed.
- **Tie-in with snapshots** — later, overlay a snapshot's `capturedAt` marker on the visitors chart to correlate a post's baseline with the traffic response.
