# Site i18n — locale detection + SSR + unified toggle (EN/ZH)

**Date:** 2026-06-23
**Status:** Design approved — ready for implementation plan
**Branch:** `feat/site-i18n`

## Context

The flex asked, verbatim: *"We also need to make sure the entire subfrost.io is built
for i18n and will detect locales. At least for EN/ZH."*

A client-side i18n base already exists, but the two things the request actually calls
out — **locale detection** and **site-wide coverage** — are the gaps.

### What exists today
- `context/LanguageContext.tsx` — `type Locale = 'en' | 'zh'`, state in `localStorage`
  (`subfrost_locale`), **default `'en'`**, client-only (`'use client'`). No detection.
- `hooks/useTranslation.ts` — `t(key, params)` over `i18n/en.ts` + `i18n/zh.ts`
  (~136 keys each), fallback `en → key`.
- `components/LanguageToggle.tsx` (文 button) + `components/stream/LanguageToggle.tsx`;
  rendered in the home (`app/page.tsx`), `components/StickyNav.tsx` (global nav), `/live`.
- `app/layout.tsx` is a **server component** with `<html lang="en">` hardcoded, wrapping
  `<LanguageProvider>{children}</LanguageProvider>`.
- `middleware.ts` **exists** and runs on every route (`matcher: "/:path*"`); today it only
  auth-gates `/admin` and sets CSP/security headers.
- **Articles use a separate, server-side mechanism**: `app/articles/[slug]/page.tsx` reads
  `?lang=zh` from `searchParams`, calls `getPublishedArticle(slug, locale)`, and emits
  correct `hreflang`/`alternates.languages`. This does **not** consult the LanguageContext.

### The gaps
1. **Locale detection = 0%.** First visit is always EN (default `'en'`, empty localStorage).
   Nothing reads `Accept-Language`.
2. **`<html lang="en">` hardcoded** + client-only Provider defaulting to `'en'` → the server
   never knows the locale → **EN→ZH flash** on hydration for a Chinese visitor.
3. **Coverage is partial.** Only the home/landing flows through `t()` (10 components) plus
   StickyNav/Footer/`/live`. `/terms`, `/privacy`, `/support`, `/brand`, `/authors`,
   `/conference` are hardcoded English.
4. **Two disjoint locale systems** — the client toggle vs. the articles' `?lang=`.

## Scope (decided)

**Mechanism + key pages.** Build the detection/SSR/unification mechanism (covers the whole
site architecturally) and audit/complete content coverage for the **key pages only**:

- **In scope (content):** home + `StickyNav` + `Footer` (already use `t()`, audited and
  completed) + small utility UI strings in `/live` and `/delete-account`.
- **Out of scope (content):** `/terms`, `/privacy`, `/support` (long legal — excluded),
  `/brand`, `/conference` (large institutional — deferred; the architecture lets them be
  translated incrementally later, optionally via `lib/cms/translate.ts`).

No route-prefix refactor (`/en·/zh`), no `next-intl`, no schema/migration.

## Architecture

### Single source of truth: cookie `subfrost_locale`

Replace the two disjoint signals with **one cookie** readable on both server (layout,
article pages) and client (toggle). Locale resolution order, on any page:

1. **Explicit `?lang=` in the URL** — always wins (preserves `hreflang`, shared ZH links,
   crawler-visible article variants).
2. **Cookie `subfrost_locale`** — the user's choice *or* the detected default.
3. **`Accept-Language`** — only on first visit, inside the middleware.
4. **`en`** — fallback.

The cookie is `path=/`, `SameSite=Lax`, `Max-Age` ~1 year, **not** `HttpOnly` (it is a
non-sensitive UI preference and the client toggle writes it via `document.cookie`).

### Components to create / change

| # | File | Change |
|---|------|--------|
| 1 | `lib/i18n/detect.ts` *(new)* | Pure `detectLocale(acceptLanguage: string \| null): Locale`. Any `zh*` (zh-CN / zh-TW / zh) → `'zh'`, else `'en'`. Hand-rolled `Accept-Language` parse (q-values tolerated; first matching language tag wins) — no `negotiator`/`next-intl` dependency. |
| 2 | `lib/i18n/resolve.ts` *(new)* | Pure `resolveArticleLocale(searchParamLang, cookieLocale): CmsLocale` implementing precedence `?lang=` > cookie > `en`. Keeps the article page thin and the precedence unit-tested. |
| 3 | `middleware.ts` *(extend existing)* | After the auth-gate/CSP block: if the request has **no** `subfrost_locale` cookie, compute `detectLocale(request.headers.get('accept-language'))` and set the cookie **on the cloned request** (`request.cookies.set(...)` + `NextResponse.next({ request })`, so the same first render is correct) **and on the response** (persists to the browser). Existing auth-gate + CSP untouched. |
| 4 | `app/layout.tsx` *(server)* | Read cookie via `cookies()` (`next/headers`) → `initialLocale`. `<html lang={initialLocale === 'zh' ? 'zh-CN' : 'en'}>`. Pass `<LanguageProvider initialLocale={initialLocale}>`. |
| 5 | `context/LanguageContext.tsx` | Accept an `initialLocale?: Locale` prop used as the initial state (instead of hardcoded `'en'`) → **zero flash**. `setLocale`/`toggleLocale` write **cookie + localStorage** and call `router.refresh()` (re-renders server components — the articles — with the new locale). localStorage becomes a mirror; cookie is authoritative. |
| 6 | `app/articles/[slug]/page.tsx` (+ `getPublishedArticle` callers, and `/authors/[id]` if it reads locale) | Resolve locale via `resolveArticleLocale(lang, cookie)` (today it is `?lang=` ?? `'en'`). `hreflang`/`canonical` keep using explicit `?lang=`. |

### Why this unifies the two systems

A single 文 toggle works on **every** page: on client pages (home) the context reacts
immediately; on server pages (articles) `router.refresh()` re-renders with the new cookie.
`?lang=` stays as an **explicit override** for SEO/sharing — it is not removed.

## Coverage audit

Sweep the components already using `t()` + `StickyNav` + `Footer` + `/live` +
`/delete-account` for **text literals that escaped the dictionary** (hardcoded JSX text,
`aria-label`, `placeholder`, `alt`). Each finding becomes a new key in `i18n/en.ts` **and**
`i18n/zh.ts`. Where a confident ZH translation is not available, the key is flagged for
human review (or, with explicit approval, translated pointwise via `lib/cms/translate.ts`)
— **no unreviewed Chinese ships to production**.

## Testing (TDD, pure functions at the center)

- `detectLocale()` — table of `Accept-Language` inputs: `zh-CN,en;q=0.9` → `zh`;
  `en-US` → `en`; `zh-TW` → `zh`; `''`/`null` → `en`; `fr,en` → `en`; `zh` → `zh`.
- `resolveArticleLocale()` — precedence: `?lang=zh` + cookie `en` → `zh`; no `?lang=` +
  cookie `zh` → `zh`; neither → `en`; `?lang=en` + cookie `zh` → `en`.
- `LanguageProvider` with `initialLocale="zh"` → first render is `zh` (no flash);
  `toggleLocale` flips to `en` and writes cookie + localStorage.
- Middleware stays **thin** — orchestration only; the testable logic lives in the pure
  functions.

## Verification

- `npx tsc --noEmit` → 0 · `CI=true npx vitest run` → green · `npx next build` → 0.
- Live (post-deploy):
  1. First visit with `Accept-Language: zh` serves the site in ZH **without** clicking the
     toggle.
  2. Toggle flips and **persists** (reload keeps the choice).
  3. An article respects the active locale.
  4. **No regression:** an `en` visitor still sees `en`; explicit `?lang=` still wins.

## Delivery

- Branch `feat/site-i18n` off main (`5d52547`) → PR → merge → bump `newTag` in
  `k8s/kustomization.yaml` via a deploy PR → Flux reconciles from `main`.
- **No schema/migration. No new dependency.**

## Risks / open validation

- **First-request cookie propagation.** Making the *first* request render in the detected
  locale relies on `NextResponse.next({ request })` + `request.cookies.set(...)` reaching
  the layout's `cookies()` under Next 16. Validate in `next build`/local before assuming it.
  **Fallback if it does not propagate:** a micro-flash only on the very first visit of a
  never-seen visitor (the response still persists the cookie, so every subsequent request is
  SSR-correct). Acceptable degradation, not a blocker.
- **`router.refresh()` cost.** Called on every toggle; cheap, re-fetches server components.
  Home reacts via context regardless, so the refresh only matters for article pages.
- **SEO limitation (conscious).** Non-article pages get no distinct ZH URL (no `/zh` prefix),
  so Googlebot (which does not send `Accept-Language`) indexes their EN version. Articles —
  the SEO-relevant content — already carry `?lang=`+`hreflang` and stay indexable in both
  languages. This matches the request ("detect locales" for users) without the route refactor.

## Out of scope (explicit)

- Route-prefix locales (`/en`, `/zh`) and `next-intl`.
- Translating long legal pages (`/terms`, `/privacy`, `/support`) and the large
  institutional pages (`/brand`, `/conference`).
- Any new locale beyond `en`/`zh`.
- Schema/database changes.
