# Spec — System notice / announcement: admin-controlled (banner + modal, EN+ZH)

**Date:** 2026-07-10 · **Requested by:** Gabe + Vitor · **Advisor:** Fable 5 · **Scope:** v1 essential

## Goal
A single, admin-controlled **site notice** that any admin can turn on/off, write freely (title +
message, **EN and ZH**), and target to the thin **banner**, the **modal**, or both — all from
`subfrost.io/admin`, no PR and no deploy. It is general-purpose: an espo.sh outage today, "Lending
is live" tomorrow. Today the banner and modal are hardcoded always-on in the app, so every change
(on, off, or copy) needs a code change + PR + Cloud Run deploy.

## Non-goals (v1)
- **No automatic health-check / auto-show-hide.** Manual only. (Fable: auto-hiding a notice while a
  service is still degraded, or a notice vanishing before recovery, is a worse failure than a human
  forgetting to flip it off. A read-only espo-health *indicator in the admin* is a possible v1.5,
  never automatic show/hide.)
- **No auto-expiry / scheduling.** The notice stays until an admin turns it off.
- **No multiple concurrent notices.** Exactly one global notice (one row).
- **No languages beyond the site's EN + ZH.** No third locale.
- **No rich text, no severity/theming variants.** Plain-text title + message; the existing neutral
  banner/modal styling is reused unchanged.

## Decisions (locked)
- **Control lives in `subfrost.io/admin`** (site), not the app's own `/admin` — the cross-app cost is
  small, and building in the app admin means building in an admin slated for sunset (consolidation
  into subfrost.io/admin). Vitor works in the site admin daily; its IAM already exists.
- **General-purpose notice** with an admin-authored **title** and **message**, plus a **surface
  selector** (show as banner, as modal, or both).
- **ZH via the existing Claude translation.** Content is authored in EN; a **"Translate to 中文"**
  button fills the ZH fields by reusing `lib/cms/translate.ts` (the same Claude Opus 4.8 translator
  the CMS already uses for articles + ecosystem; `ANTHROPIC_API_KEY` is already in the site's k8s
  secrets). ZH is **editable and optional** — the app falls back to EN when a ZH field is empty.
- **Cross-app transport = HTTP, not a shared DB table.** The app (Cloud Run, DB `subfrost` as user
  `subfrost_app`) and the site (GKE, DB `subfrost` as user `subfrost`) are two independent Prisma
  projects. Sharing a table couples their schemas (drift risk = Fable's #1 risk) and needs
  cross-user grants. Instead the **site owns the state** (a row in its own DB) and exposes a
  **public read API**; the **app consumes it** via a server-side fetch with a short cache + fail-safe.
- **State = a durable Postgres row** (site), not Redis. Memorystore can evict a key; a missing key
  would read as "no notice" and silently drop the banner/modal.

## Architecture
```
subfrost.io (GKE)                                  app.subfrost.io (Cloud Run)
┌────────────────────────────────────┐            ┌────────────────────────────────────┐
│ /admin → "Site notice" card        │  writes    │ /api/system-notice (proxy)          │
│  active · banner? · modal?         │──────┐     │   server fetch of site API,         │
│  title/message EN + ZH             │      ▼     │   in-memory cache ≤60s, fail-safe   │
│  [Translate to 中文]  (Claude)     │      │     │        ▲                            │
│ SystemNotice row (Prisma)  ◄───────┘      │     │        │ client poll ~60s           │
│                                    │      │     │  useSystemNotice() ─┬─ notice banner │
│ GET /api/system-notice (public, cache-control)  │  (picks locale)    └─ notice modal  │
│  { enabled, showBanner, showModal,  │──────────►│                                     │
│    en:{title,message}, zh:{...} }   │  HTTP(ssr) └────────────────────────────────────┘
└────────────────────────────────────┘
```
When the site API is unreachable or errors, the app proxy returns `{ enabled: false }` (fail-safe:
never a false notice, never a render crash).

## Data model (site repo, `subfrost.io/prisma/schema.prisma`)
One global row:
```prisma
model SystemNotice {
  id         String   @id @default("global")   // always the literal "global"
  enabled    Boolean  @default(false)          // master on/off
  showBanner Boolean  @default(true)           // render as thin banner when enabled
  showModal  Boolean  @default(true)           // render as modal when enabled
  titleEn    String?
  messageEn  String?
  titleZh    String?                           // filled by Translate button; editable; nullable
  messageZh  String?
  updatedAt  DateTime @updatedAt
  updatedBy  String?                            // admin user id, for the "on since / by whom" line
}
```
Added via the site's additive schema-sync (`prisma db push`, no data loss — CMS playbook). Upserted
on first write.

## Site side (subfrost.io)
1. **Translation helper** — add `translateNotice(source: { title: string; message: string }, from,
   to): Promise<{ title: string; message: string }>` to `lib/cms/translate.ts`, reusing the existing
   `Anthropic` client + `TRANSLATE_MODEL` + `translationUnavailable()` guard, with a small
   `{ title, message }` JSON schema and a short-UI-notice system prompt (plain text, not Markdown;
   keep proper nouns/tickers like SUBFROST/frBTC/DIESEL). Mirrors `translate()` for articles.
2. **Server actions** (`actions/admin/system-notice.ts`): `getSystemNotice()`,
   `setSystemNotice({ enabled, showBanner, showModal, titleEn, messageEn, titleZh, messageZh })`, and
   `translateNoticeAction({ title, message })` → ZH (gated + calls `translateNotice`). `set`/
   `translate` gated by a new privilege **`system.edit`**; `set` upserts the `global` row, stamps
   `updatedBy`, and `revalidatePath`s the public route.
3. **Admin card** in `/admin` ("Site notice" panel, per the existing admin nav): master **Active**
   switch, **Show as banner** / **Show as modal** checkboxes, **Title (EN)** + **Message (EN)**
   fields, **Title (中文)** + **Message (中文)** fields, a **"Translate to 中文"** button (fills the
   ZH fields from EN via `translateNoticeAction`; result editable), **Save**, and a status line
   **"On since {updatedAt} · {updatedBy}"** / **"Off"** read back from the same row the app reads
   (single source, Fable's de-risk). Hint under Title: "shown uppercase in the modal". Gated by
   `system.edit` (view by `system.view`).
4. **Public read API** `app/api/system-notice/route.ts` — `GET` → `{ enabled, showBanner, showModal,
   en: { title, message }, zh: { title, message } }` (empty strings for null fields).
   `export const dynamic = "force-dynamic"` + `Cache-Control: public, max-age=30,
   stale-while-revalidate=30` (short; no long CDN cache — a flip must propagate ≤60s). No auth
   (read-only, non-sensitive; the app calls it server-side, so no CORS needed).

## App side (subfrost-app)
1. **Proxy route** `app/api/system-notice/route.ts` — server-side `fetch(SYSTEM_NOTICE_URL)`, ~3s
   timeout; any non-2xx / throw / timeout → `{ enabled: false }` + `console.warn` (fail-safe).
   Module-scoped in-memory cache (TTL 45s). `SYSTEM_NOTICE_URL` defaults to
   `https://subfrost.io/api/system-notice`, env-overridable — **no new secret required to ship**.
2. **Shared hook** `hooks/useSystemNotice.ts` — fetches the app's `/api/system-notice` on mount,
   polls every 60s (`setInterval`, cleared on unmount; skip when `document.hidden`); reads the app's
   current locale (existing `useTranslation`) and returns the **resolved** `{ enabled, showBanner,
   showModal, title, message }` for that locale, **falling back to EN** when the ZH field is empty.
   Lifted into a tiny context provider in `AppShell` so both surfaces share one fetch.
3. **The two surfaces** consume the hook:
   - **Banner** (rename `EspoDownBanner` → `SystemNoticeBanner`): renders only when
     `enabled && showBanner`; line = `message || title`.
   - **Modal** (rename `DemoBanner` → `SystemNoticeModal`): renders only when `enabled && showModal`;
     heading = `title` (kept `uppercase` per existing style), body = `message`, plus the existing
     localized **I Understand** button. Per-session `sessionStorage` dismiss stays — **keep the
     existing key strings** so the e2e/puppeteer helpers that pre-set them keep working (rename the
     component, not the key).
   - Both are still mounted in `AppShell`; they no-op when off. The old beta-modal + hardcoded-espo
     copy are removed — "off" becomes the true default (no welcome/beta modal when there's no notice).
4. **Cleanup:** delete the now-unused espo/beta i18n keys (`banner.espoDown`, `demo.warning`,
   `demo.description`); keep/repurpose `demo.understand` (the button) as `notice.understand`.

## Content → surface mapping (per resolved locale)
| Field (admin) | Banner | Modal |
|---|---|---|
| `title` | line, if `message` empty | heading (uppercase) |
| `message` | line | body |
| `showBanner` / `showModal` | gates the banner | gates the modal |
| `enabled` | master gate | master gate |

Example — outage: title "Espo.sh Data Services Are Down", message "Data services provided by espo.sh
are temporarily down; wallet balances and transactions are unaffected." Example — launch: title
"Lending is live", message "Borrow and lend in a single Bitcoin transaction. Try it in /lend."

## Failure handling, caching, polling
- **Fail-safe read:** app proxy any-error → `{ enabled:false }`; never throws into render.
- **Cache TTL ≤60s** at every layer (site `max-age=30`, app in-memory 45s, client poll 60s); no CDN
  caching of `/api/system-notice`. Worst-case propagation of a flip ≈ 60s.
- **Single-source read-back:** the admin card reads the same row the app reads.

## Testing
- **Site unit:** `translateNotice` builds the right request + parses structured output (mock the SDK,
  like the article translate tests); `setSystemNotice` gating (`system.edit`; upsert stamps
  `updatedBy`); `getSystemNotice` default when no row; public route returns the full EN+ZH shape +
  cache header. (Mock Prisma, existing pattern.)
- **App unit:** proxy fail-safe (throw/timeout/non-2xx → `{enabled:false}`; cache reused within TTL);
  `useSystemNotice` locale resolution (zh present → zh; zh empty → en fallback) + polling (fake
  timers); banner renders only when `enabled && showBanner` (line `message||title`); modal only when
  `enabled && showModal` (title+message).
- **E2E drill (manual, deploy day):** set + enable a notice (EN + Translate to 中文) in site admin →
  banner/modal appear in app prod ≤60s → switch app locale → ZH shows → edit + toggle each surface →
  correct one shows → Active off → both disappear. This drill is the definition of done, re-run after
  any migration touching the row.

## Rollout
Two PRs, **site first** (the API + row must exist before the app points at it):
- **PR A — subfrost.io:** `SystemNotice` model + `db push` + `translateNotice` helper + server actions
  + `system.edit` privilege + admin card + public `GET /api/system-notice`. Site gate
  (tsc/eslint/vitest/build); Flux `newTag` bump to deploy. **After deploy, author + translate +
  enable the current espo notice** so the message (EN+ZH) is ready before PR B.
- **PR B — subfrost-app:** proxy route + `useSystemNotice` provider + rename & gate the two surfaces +
  remove hardcoded espo/beta copy. App CI (lint/tsc/build); merged by Flex/Gabe → Cloud Run auto
  deploy. **Coordinate:** the espo notice must be enabled in the admin (PR A) at/before PR B ships, or
  the live espo banner/modal blink off until it is. Supersedes the manual-PR flow (#356/#358/#359).

## Biggest risk & de-risk (Fable)
**Silent divergence admin↔app** — flip the toggle mid-incident and nothing changes on screen (stuck
cache, swallowed error, wrong URL, or the PR-B gap above). De-risk: (a) explicit fail-safe in the app
proxy; (b) cache TTL ≤60s everywhere, no CDN on the route; (c) admin reads back the same row the app
reads; (d) enable the espo notice before PR B ships; (e) the end-to-end drill becomes ritual after any
change touching the table.

## Open questions
- Exact home + privilege name for the admin card in the site nav (confirm against the existing IAM
  privilege list + admin sections during planning — proposing `system.edit` / `system.view`).
- Read-only espo-health indicator in the admin card (v1.5, informational only; never auto show/hide).
  Deferred unless asked.
