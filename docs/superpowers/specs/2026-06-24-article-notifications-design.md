# Article subscriptions & notify-on-publish (v1) — design

**Date:** 2026-06-24
**Repo:** `subfrost.io` (Next.js 16 App Router, Prisma/Postgres, Redis, GKE/Flux)
**Status:** approved (brainstorm 2026-06-24)

## Context & goal

subfrost.io's `/articles` already has a **subscribe** form (`components/articles/SubscribePanel.tsx`
in the footer) that POSTs to `/api/articles/subscribe` and upserts a row in `ArticleSubscriber`
(`email @unique, locale, source, active`). It **only collects** — nothing reads those rows to
send anything, despite the copy promising "we'll notify you about new articles". There are 0
subscribers in prod.

This front builds **notify-on-publish** plus a **per-author "follow"** subscription and makes
the subscribe more visible. When an article is published, active global subscribers and active
followers of that article's author get an email (deduped), in their locale, with an unsubscribe
link.

The site has **no public reader accounts** (the `User` model is CMS staff/authors only), so all
subscriptions are **anonymous email**, single opt-in — consistent with the existing subscribe.

⚠️ **Resend is unconfigured in prod** (`RESEND_API_KEY` absent from the `subfrost-io-secrets`
k8s secret; the entry in `external-secrets.yaml` is commented out because GCP Secret Manager
`resend-api-key` 404s — flex's lane to provision). So `lib/cms/email.ts::sendEmail` is a
graceful no-op today. This feature is built to **degrade gracefully** (collect + queue) and to
**flush automatically** once Resend is restored (see the sweep, below).

## Decisions (brainstorm)

- **Two subscription types:** global (existing) **and** per-author "follow" (new).
- **Identity:** anonymous email; **single opt-in** (stored immediately, no confirmation email).
- **Unsubscribe:** v1, per-subscription, via a tokenized link in every email.
- **UI surfaces (all four + footer):** follow button on the author profile and on the article
  byline; global subscribe CTA at the end of each article and a banner on `/articles`; the
  footer keeps its existing subscribe.
- **Dispatch:** inline fire-and-forget on publish **plus** a pending-sweep (Resend-resilient).

## Global constraints

- **Branch → PR → merge, NEVER push to main.** Branch: `feat/article-notifications`.
- **Gates:** `npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0 (benign
  Windows `EINVAL` copy warnings fine).
- **Additive schema only** (new `AuthorSubscription`; new columns on `ArticleSubscriber` and
  `Article`), applied by the repo's `prisma db push` init container; `npx prisma generate` is the
  local type gate.
- **Sends are non-blocking:** never fail or delay the publish if email errors (try/catch,
  fire-and-forget, errors logged).
- **Bilingual** (en/zh) for all reader-facing copy + emails, mirroring the existing
  `SubscribePanel` / article i18n.
- `import prisma from '@/lib/prisma'` (default). zod v3. pnpm. Windows + Git Bash.
- **Deploy is human-owned** (merge → Cloud Build → bump `newTag` via PR → Flux; source before
  kustomization). Resend send only activates once flex provisions `resend-api-key` and the
  `external-secrets.yaml` RESEND entry is uncommented.

## Schema (additive)

```prisma
model ArticleSubscriber {        // existing (global) — add the token
  // …existing fields (email @unique, locale, source, active, subscribedAt, updatedAt)…
  unsubscribeToken String @unique @default(cuid())
}

model AuthorSubscription {       // new (per-author follow)
  id               String   @id @default(cuid())
  email            String
  author           User     @relation("AuthorFollowers", fields: [authorId], references: [id], onDelete: Cascade)
  authorId         String
  locale           Locale   @default(en)
  active           Boolean  @default(true)
  unsubscribeToken String   @unique @default(cuid())
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([email, authorId])
  @@index([authorId, active])
}

model Article {                  // existing — add the notify flag
  // …existing fields…
  notifiedAt DateTime?           // set ONLY when the publish notification actually sent; null = pending
}
```

- `User` gains the back-relation `authorFollowers AuthorSubscription[] @relation("AuthorFollowers")`.
- **Migration backfill (one-time):** set `notifiedAt = publishedAt` for every existing
  `status = PUBLISHED` article, so the sweep never notifies subscribers about pre-existing
  articles. Done as a tiny idempotent step (the deploy's migrate path or a guarded one-shot;
  `updateMany where status=PUBLISHED AND notifiedAt=null SET notifiedAt=publishedAt`).
- `unsubscribeToken` default `cuid()` (a random opaque string — no cost, just a DB column).

## Components

### 1. Subscription store + tokens — `lib/cms/article-subscribe.ts` (new or extend existing)
- `subscribeGlobal(email, locale, source)` — upsert `ArticleSubscriber` (idempotent on email;
  reactivates `active=true`; mints `unsubscribeToken` on create). The existing
  `/api/articles/subscribe` route calls this.
- `followAuthor(email, authorId, locale)` — upsert `AuthorSubscription` (idempotent on
  `[email, authorId]`; reactivates; mints token). Validates `authorId` is a real `User`.
- `unsubscribeByToken(token)` — find the matching `ArticleSubscriber` **or** `AuthorSubscription`
  by `unsubscribeToken`, set `active=false`. Returns what was unsubscribed (for the page copy).

### 2. Endpoints
- `POST /api/articles/subscribe` (existing) — keep; now also mints the token via `subscribeGlobal`.
- `POST /api/articles/follow` (new) — body `{ email, authorId, locale }` → `followAuthor`. 201 on
  success, 400 on bad input / unknown author. Same validation/shape style as the subscribe route.
- `GET /unsubscribe?token=…` (new page route) — calls `unsubscribeByToken`, renders a bilingual
  confirmation ("You've been unsubscribed" / 已退订). Idempotent (already-inactive → still shows
  success). Invalid/absent token → a neutral "link invalid or expired" message (no enumeration).

### 3. Notify dispatch — `lib/cms/article-notify.ts` (new)
- `notifyNewArticle(articleId)`:
  - Load the article + its translations + author.
  - recipients = active `ArticleSubscriber` + active `AuthorSubscription` for `article.authorId`,
    **deduped by email** (one email per address; if both, treat as global — use the global
    subscriber's locale + global `unsubscribeToken`).
  - For each recipient: `newArticleEmail(article, recipientLocale, unsubscribeUrl)` →
    `sendEmail({ to, subject, html })`. Locale fallback → `article.primaryLocale`.
  - **Set `article.notifiedAt = now()` only if email is actually enabled** (Resend configured —
    `isEmailEnabled()` in `lib/cms/email.ts`, true iff `RESEND_API_KEY` set). If disabled,
    leave `notifiedAt = null` so the sweep retries later.
  - Low volume (0 subscribers today) → sequential or small fixed concurrency; note Resend rate
    limits as a future concern, don't build batching now (YAGNI).
- **Trigger:** in `lib/cms/article-write.ts::upsertArticle`, when `becomingPublished` (status
  becomes PUBLISHED on the update path, or created already PUBLISHED), call `notifyNewArticle`
  **fire-and-forget** (`void notifyNewArticle(id).catch(log)`) — never blocks/fails the publish.
- **Sweep:** `notifyPendingArticles()` — `findMany` articles `status=PUBLISHED AND notifiedAt=null`
  (the backfill keeps this to genuinely-new publishes), `notifyNewArticle` each. Exposed via the
  existing warmer cadence: add a `run('notify-pending', …)` step to `app/api/prefetch/route.ts`
  (Cloud Scheduler every 25 min). So when Resend is restored, the next cron flushes everything
  pending automatically — no manual step.

### 4. Email template — `lib/cms/email.ts`
- Add `newArticleEmail(article, locale, unsubscribeUrl): { subject, html }` alongside the
  existing templates (`inviteEmail`, etc.). Localized subject + body (title, excerpt, "Read on
  subfrost.io" link to `/articles/<slug>`), and a footer with the **unsubscribe link**. `FROM =
  EMAIL_FROM`.
- Add `isEmailEnabled(): boolean` (`!!process.env.RESEND_API_KEY`) so `notifyNewArticle` can tell
  "sent" from "no-op".

### 5. UI (4 surfaces + footer)
- **Follow button — `components/articles/FollowAuthorButton.tsx` (new):** an email-capture
  control (button → small inline email input/popover → confirm), mirroring `SubscribePanel`'s
  pattern and bilingual copy. POSTs to `/api/articles/follow`. Placed on:
  - the author profile page `app/authors/[id]/page.tsx` (prominent, in the header), and
  - the article byline (the article view component) next to "by {author}".
- **Global subscribe — reuse/adapt `SubscribePanel`:** render it (a) at the end of the article
  view (a CTA block) and (b) as a banner near the top of `app/articles/page.tsx`. The footer
  keeps its existing instance. (Extract a shared inline variant if the footer panel isn't already
  reusable in these contexts — minimal refactor, no behavior change.)

## Error handling / degradation

- **Resend down (today):** `sendEmail` no-ops, `isEmailEnabled()` false → `notifyNewArticle`
  leaves `notifiedAt=null`; the sweep keeps retrying; collection (subscribe/follow) works fully.
  When flex provisions `resend-api-key` + uncomments the ESO entry, the next sweep flushes all
  pending and steady-state inline sends take over.
- **Publish path never breaks:** notify is fire-and-forget with try/catch; a notify error never
  affects the article save/publish.
- **Idempotency:** subscribe/follow upserts are idempotent; `becomingPublished` fires once;
  `notifiedAt` prevents re-notifying; unsubscribe is idempotent.
- **No address enumeration:** unsubscribe with a bad token returns a neutral message; follow/
  subscribe responses don't reveal whether an email already existed.

## Out of scope (v1)

- Double opt-in / confirmation emails (single opt-in for v1; revisit for deliverability later).
- Per-tag/topic subscriptions (only global + per-author now).
- Per-recipient delivery rows / retry queue (the article-level `notifiedAt` + sweep is enough at
  this scale).
- A subscriber management page beyond single-link unsubscribe.
- Provisioning Resend itself (flex's lane) — this front only consumes `sendEmail`.

## Testing

- `lib/cms/article-subscribe.ts`: `subscribeGlobal`/`followAuthor` upsert idempotently + mint a
  token + reactivate on re-subscribe; `unsubscribeByToken` deactivates the right row (global vs
  author) and is idempotent; unknown token → no-op result. Unit (mocked Prisma).
- `app/api/articles/follow/route.ts`: 201 on valid body; 400 on missing email/unknown author.
- `lib/cms/article-notify.ts`: `notifyNewArticle` dedupes global+author by email, sends per
  recipient with the right locale, sets `notifiedAt` only when `isEmailEnabled()` is true (mock
  `sendEmail`/`isEmailEnabled`); `notifyPendingArticles` picks only `PUBLISHED && notifiedAt=null`.
  Unit (mocked Prisma + email).
- `lib/cms/email.ts`: `newArticleEmail` returns a localized subject/html containing the article
  title + the unsubscribe URL.
- UI: `FollowAuthorButton` posts the email+authorId (component test, happy-dom); the article-view
  end CTA + `/articles` banner render the subscribe panel.
- Gates: `tsc` 0 · `vitest` green · `next build` 0.

## Verification (live, post-deploy)

1. Subscribe (global) on `/articles` and Follow an author on `/authors/[id]` → rows appear
   (`ArticleSubscriber` / `AuthorSubscription`) with tokens.
2. Publish an article → with Resend **off**, `notifiedAt` stays null (nothing sent, publish
   unaffected); the `/api/prefetch` sweep keeps it pending.
3. After flex provisions Resend (uncomment ESO entry + redeploy) → the next sweep sends the
   pending notification; `notifiedAt` is set; recipients get the email in their locale with a
   working unsubscribe link. A subsequent publish notifies inline.
4. Click an unsubscribe link → that subscription goes `active=false`; re-clicking still shows the
   confirmation.
