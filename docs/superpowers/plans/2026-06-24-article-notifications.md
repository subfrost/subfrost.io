# Article subscriptions & notify-on-publish (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email subscribers (global + per-author followers) when an article is published, add a "follow author" subscription and more-visible subscribe UI, with tokenized unsubscribe — degrading gracefully while Resend is unconfigured and flushing automatically once it returns.

**Architecture:** A new `AuthorSubscription` model + an `unsubscribeToken` on `ArticleSubscriber` + a `notifiedAt` flag on `Article`. A subscribe/follow/unsubscribe lib (`lib/cms/article-subscribe.ts`) backs the routes. On publish, `lib/cms/article-write.ts` fires `notifyNewArticle` (fire-and-forget) which emails active global subscribers + the author's followers (deduped), setting `notifiedAt` only when email is actually enabled; a sweep (`notifyPendingArticles`, run from `/api/prefetch`) flushes anything left pending. UI: a `FollowAuthorButton` + the existing `SubscribePanel` placed on four surfaces.

**Tech Stack:** Next.js 16 App Router (server + client), Prisma/Postgres (`@/lib/prisma`, default export), Resend (`lib/cms/email.ts`), zod v3, Vitest + @testing-library/react (happy-dom).

## Global Constraints

- **Branch → PR → merge, NEVER push to main.** Branch: `feat/article-notifications`. Never `git add` `.claude/`, `.npmrc`, or `.superpowers/`.
- **Gates (before each PR):** `npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0 (benign Windows `EINVAL` copy warnings fine).
- **Additive schema only**, applied by the `prisma db push` init container; `npx prisma generate` is the local type gate (no DB connection needed — Prisma is mocked in tests).
- **Sends are non-blocking:** notify is fire-and-forget; a notify error must never fail or delay the publish.
- **Anonymous email, single opt-in.** **Bilingual** (en/zh) for all reader-facing copy + emails.
- **Resend degradation:** `sendEmail` no-ops when `RESEND_API_KEY` is unset (returns `{ ok: true, skipped: true }`); `notifyNewArticle` must NOT mark an article notified in that case.
- **Pre-existing articles must never be notified:** the sweep only considers `publishedAt >= NOTIFY_SINCE` (the feature launch date).
- Prisma client: `import prisma from '@/lib/prisma'` (default). Test mock convention: `vi.mock('@/lib/prisma', () => { const m = {...}; const client = { ...m }; return { prisma: client, default: client } })`.
- **Each commit ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File map

- `prisma/schema.prisma` (modify) — `AuthorSubscription` model; `unsubscribeToken` on `ArticleSubscriber`; `notifiedAt` on `Article`; `authorFollowers` back-relation on `User`.
- `lib/cms/article-subscribe.ts` (new) — `subscribeGlobal`, `followAuthor`, `unsubscribeByToken`.
- `app/api/articles/subscribe/route.ts` (modify) — call `subscribeGlobal`.
- `app/api/articles/follow/route.ts` (new) — call `followAuthor`.
- `lib/cms/email.ts` (modify) — `isEmailEnabled()`, `newArticleEmail()`.
- `lib/cms/article-notify.ts` (new) — `notifyNewArticle`, `notifyPendingArticles`.
- `lib/cms/article-write.ts` (modify) — fire `notifyNewArticle` on publish.
- `app/api/prefetch/route.ts` (modify) — add the notify-pending sweep step.
- `app/unsubscribe/page.tsx` (new) — tokenized unsubscribe confirmation page.
- `components/articles/FollowAuthorButton.tsx` (new) — email-capture follow control.
- `components/articles/AuthorByline.tsx`, `app/authors/[id]/page.tsx`, `app/articles/[slug]/page.tsx`, `app/articles/page.tsx` (modify) — placements.
- Tests: `tests/cms/article-subscribe.test.ts`, `tests/api/articles-follow.test.ts`, `tests/cms/article-email.test.ts`, `tests/cms/article-notify.test.ts`, `tests/cms/article-write-notify.test.ts`, `tests/cms/follow-author-button.test.tsx` (all new).

---

## Task 1: Schema + subscribe/follow/unsubscribe lib

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/cms/article-subscribe.ts`
- Modify: `app/api/articles/subscribe/route.ts`
- Test: `tests/cms/article-subscribe.test.ts`

**Interfaces:**
- Produces: `subscribeGlobal(email: string, locale: 'en'|'zh', source: string): Promise<{ id: string }>`; `followAuthor(email: string, authorId: string, locale: 'en'|'zh'): Promise<{ ok: true } | { ok: false; error: string }>`; `unsubscribeByToken(token: string): Promise<{ unsubscribed: boolean; kind: 'global' | 'author' | null }>`.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`:
1. Add to `model ArticleSubscriber` (after its existing fields):
   ```prisma
   unsubscribeToken String @unique @default(cuid())
   ```
2. Add to `model Article` (after its existing fields, before the `@@index` lines):
   ```prisma
   notifiedAt DateTime?
   ```
3. Add to `model User` (alongside the existing `AuthoredArticles` relation):
   ```prisma
   authorFollowers AuthorSubscription[] @relation("AuthorFollowers")
   ```
4. Add the new model (near `ArticleSubscriber`):
   ```prisma
   model AuthorSubscription {
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
   ```

- [ ] **Step 2: Generate the client (type gate)**

Run: `npx prisma generate`
Expected: completes; `prisma.authorSubscription`, `ArticleSubscriber.unsubscribeToken`, `Article.notifiedAt` are typed.

- [ ] **Step 3: Write the failing test**

Create `tests/cms/article-subscribe.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const articleSubscriber = { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() }
  const authorSubscription = { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() }
  const user = { findUnique: vi.fn() }
  const client = { articleSubscriber, authorSubscription, user }
  return { prisma: client, default: client }
})

import prisma from '@/lib/prisma'
import { subscribeGlobal, followAuthor, unsubscribeByToken } from '@/lib/cms/article-subscribe'

const p = prisma as unknown as {
  articleSubscriber: Record<string, ReturnType<typeof vi.fn>>
  authorSubscription: Record<string, ReturnType<typeof vi.fn>>
  user: Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  Object.values(p).forEach((m) => Object.values(m).forEach((f) => f.mockReset()))
})

describe('article-subscribe', () => {
  it('subscribeGlobal upserts the email active and returns the id', async () => {
    p.articleSubscriber.upsert.mockResolvedValueOnce({ id: 'sub1' })
    const r = await subscribeGlobal('A@x.com', 'en', 'articles_page')
    expect(r.id).toBe('sub1')
    const arg = p.articleSubscriber.upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ email: 'a@x.com' }) // lowercased
    expect(arg.create.active).toBe(true)
    expect(arg.update.active).toBe(true)
  })

  it('followAuthor rejects an unknown author', async () => {
    p.user.findUnique.mockResolvedValueOnce(null)
    const r = await followAuthor('a@x.com', 'nope', 'en')
    expect(r).toEqual({ ok: false, error: 'Unknown author' })
    expect(p.authorSubscription.upsert).not.toHaveBeenCalled()
  })

  it('followAuthor upserts a per-author subscription for a real author', async () => {
    p.user.findUnique.mockResolvedValueOnce({ id: 'auth1' })
    p.authorSubscription.upsert.mockResolvedValueOnce({ id: 'f1' })
    const r = await followAuthor('A@x.com', 'auth1', 'zh')
    expect(r).toEqual({ ok: true })
    const arg = p.authorSubscription.upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ email_authorId: { email: 'a@x.com', authorId: 'auth1' } })
    expect(arg.create.active).toBe(true)
    expect(arg.update.active).toBe(true)
  })

  it('unsubscribeByToken deactivates a global subscription', async () => {
    p.articleSubscriber.update.mockResolvedValueOnce({ id: 'sub1' })
    const r = await unsubscribeByToken('tok-global')
    expect(r).toEqual({ unsubscribed: true, kind: 'global' })
    expect(p.articleSubscriber.update.mock.calls[0][0]).toEqual({
      where: { unsubscribeToken: 'tok-global' }, data: { active: false },
    })
  })

  it('unsubscribeByToken falls back to author subscription, then to none', async () => {
    p.articleSubscriber.update.mockRejectedValueOnce(new Error('not found'))
    p.authorSubscription.update.mockResolvedValueOnce({ id: 'f1' })
    expect(await unsubscribeByToken('tok-author')).toEqual({ unsubscribed: true, kind: 'author' })

    p.articleSubscriber.update.mockRejectedValueOnce(new Error('not found'))
    p.authorSubscription.update.mockRejectedValueOnce(new Error('not found'))
    expect(await unsubscribeByToken('tok-bad')).toEqual({ unsubscribed: false, kind: null })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/article-subscribe.test.ts`
Expected: FAIL — module `@/lib/cms/article-subscribe` not found.

- [ ] **Step 5: Implement `lib/cms/article-subscribe.ts`**

```ts
import prisma from "@/lib/prisma"

type Locale = "en" | "zh"

/** Global "notify me of any new article" subscription (anonymous email, single opt-in). */
export async function subscribeGlobal(email: string, locale: Locale, source: string): Promise<{ id: string }> {
  const e = email.trim().toLowerCase()
  const saved = await prisma.articleSubscriber.upsert({
    where: { email: e },
    create: { email: e, locale, source, active: true },
    update: { locale, source, active: true },
    select: { id: true },
  })
  return { id: saved.id }
}

/** Per-author "follow" subscription. Idempotent on (email, author); reactivates. */
export async function followAuthor(
  email: string, authorId: string, locale: Locale,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase()
  const author = await prisma.user.findUnique({ where: { id: authorId }, select: { id: true } })
  if (!author) return { ok: false, error: "Unknown author" }
  await prisma.authorSubscription.upsert({
    where: { email_authorId: { email: e, authorId } },
    create: { email: e, authorId, locale, active: true },
    update: { locale, active: true },
    select: { id: true },
  })
  return { ok: true }
}

/** Deactivate the subscription that owns this unsubscribe token (global first, then author).
 *  Idempotent: an unknown token yields { unsubscribed: false, kind: null }. */
export async function unsubscribeByToken(
  token: string,
): Promise<{ unsubscribed: boolean; kind: "global" | "author" | null }> {
  try {
    await prisma.articleSubscriber.update({ where: { unsubscribeToken: token }, data: { active: false } })
    return { unsubscribed: true, kind: "global" }
  } catch {
    // not a global token — try author
  }
  try {
    await prisma.authorSubscription.update({ where: { unsubscribeToken: token }, data: { active: false } })
    return { unsubscribed: true, kind: "author" }
  } catch {
    return { unsubscribed: false, kind: null }
  }
}
```

- [ ] **Step 6: Wire the existing subscribe route to the lib**

Replace the body of `app/api/articles/subscribe/route.ts`'s `POST` (keep the imports of `NextRequest`/`NextResponse`/`z`, the `runtime`/`dynamic` exports, and `bodySchema`) so the inline prisma upsert becomes a call to `subscribeGlobal`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { subscribeGlobal } from "@/lib/cms/article-subscribe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(["en", "zh"]).optional().default("en"),
  source: z.string().trim().min(1).max(120).optional().default("articles_page"),
})

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { id } = await subscribeGlobal(parsed.data.email, parsed.data.locale, parsed.data.source)
  return NextResponse.json({ ok: true, message: "Subscribed", id }, { status: 201 })
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/article-subscribe.test.ts`
Expected: PASS (all cases).

- [ ] **Step 8: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add prisma/schema.prisma lib/cms/article-subscribe.ts app/api/articles/subscribe/route.ts tests/cms/article-subscribe.test.ts
git commit -m "feat(articles): subscription schema + subscribe/follow/unsubscribe lib

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `POST /api/articles/follow`

**Files:**
- Create: `app/api/articles/follow/route.ts`
- Test: `tests/api/articles-follow.test.ts`

**Interfaces:**
- Consumes: `followAuthor` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `tests/api/articles-follow.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cms/article-subscribe', () => ({ followAuthor: vi.fn() }))

import { POST } from '@/app/api/articles/follow/route'
import { followAuthor } from '@/lib/cms/article-subscribe'

const req = (body: unknown) => new Request('http://t/api/articles/follow', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}) as never

beforeEach(() => vi.clearAllMocks())

describe('POST /api/articles/follow', () => {
  it('201 when followAuthor succeeds', async () => {
    vi.mocked(followAuthor).mockResolvedValueOnce({ ok: true })
    const res = await POST(req({ email: 'a@x.com', authorId: 'auth1', locale: 'en' }))
    expect(res.status).toBe(201)
    expect(followAuthor).toHaveBeenCalledWith('a@x.com', 'auth1', 'en')
  })

  it('400 on invalid email', async () => {
    const res = await POST(req({ email: 'nope', authorId: 'auth1' }))
    expect(res.status).toBe(400)
    expect(followAuthor).not.toHaveBeenCalled()
  })

  it('400 when followAuthor reports an unknown author', async () => {
    vi.mocked(followAuthor).mockResolvedValueOnce({ ok: false, error: 'Unknown author' })
    const res = await POST(req({ email: 'a@x.com', authorId: 'nope', locale: 'en' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/api/articles-follow.test.ts`
Expected: FAIL — module `@/app/api/articles/follow/route` not found.

- [ ] **Step 3: Implement the route**

Create `app/api/articles/follow/route.ts`:

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { followAuthor } from "@/lib/cms/article-subscribe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().trim().email(),
  authorId: z.string().trim().min(1),
  locale: z.enum(["en", "zh"]).optional().default("en"),
})

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const result = await followAuthor(parsed.data.email, parsed.data.authorId, parsed.data.locale)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, message: "Following" }, { status: 201 })
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/api/articles-follow.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add app/api/articles/follow/route.ts tests/api/articles-follow.test.ts
git commit -m "feat(articles): POST /api/articles/follow (per-author subscribe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Email — `isEmailEnabled()` + `newArticleEmail()`

**Files:**
- Modify: `lib/cms/email.ts`
- Test: `tests/cms/article-email.test.ts`

**Interfaces:**
- Produces: `isEmailEnabled(): boolean`; `newArticleEmail(args: { title: string; excerpt: string; slug: string; locale: 'en'|'zh'; unsubscribeUrl: string }): { subject: string; html: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/article-email.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { isEmailEnabled, newArticleEmail } from '@/lib/cms/email'

const orig = process.env.RESEND_API_KEY
afterEach(() => { if (orig === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = orig })

describe('article email', () => {
  it('isEmailEnabled reflects RESEND_API_KEY', () => {
    delete process.env.RESEND_API_KEY
    expect(isEmailEnabled()).toBe(false)
    process.env.RESEND_API_KEY = 're_test'
    expect(isEmailEnabled()).toBe(true)
  })

  it('newArticleEmail builds a localized subject + html with the article link and unsubscribe url', () => {
    const { subject, html } = newArticleEmail({
      title: 'frBTC explained', excerpt: 'How wrapping works', slug: 'frbtc-explained',
      locale: 'en', unsubscribeUrl: 'https://subfrost.io/unsubscribe?token=abc&lang=en',
    })
    expect(subject).toContain('frBTC explained')
    expect(html).toContain('/articles/frbtc-explained')
    expect(html).toContain('https://subfrost.io/unsubscribe?token=abc&lang=en')
  })

  it('newArticleEmail localizes to zh', () => {
    const { html } = newArticleEmail({
      title: '标题', excerpt: '摘要', slug: 's', locale: 'zh',
      unsubscribeUrl: 'https://subfrost.io/unsubscribe?token=abc&lang=zh',
    })
    expect(html).toContain('退订') // unsubscribe label in zh
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/article-email.test.ts`
Expected: FAIL — `isEmailEnabled`/`newArticleEmail` not exported.

- [ ] **Step 3: Implement in `lib/cms/email.ts`**

Add at the end of the file (it reuses the file's existing `shell()` helper and the `APP_URL` const):

```ts
/** True when Resend is configured — lets callers tell a real send from the no-op. */
export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY
}

export function newArticleEmail(args: {
  title: string
  excerpt: string
  slug: string
  locale: "en" | "zh"
  unsubscribeUrl: string
}): { subject: string; html: string } {
  const href = `${APP_URL}/articles/${args.slug}`
  const copy =
    args.locale === "zh"
      ? { subject: `新文章：${args.title}`, heading: args.title, read: "阅读全文", unsub: "退订" }
      : { subject: `New article: ${args.title}`, heading: args.title, read: "Read the article", unsub: "Unsubscribe" }
  const body = `<p>${args.excerpt}</p>
  <p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${copy.read}</a></p>
  <p style="font-size:12px;color:#94a3b8;margin-top:8px"><a href="${args.unsubscribeUrl}" style="color:#94a3b8">${copy.unsub}</a></p>`
  return { subject: copy.subject, html: shell(copy.heading, body) }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/article-email.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add lib/cms/email.ts tests/cms/article-email.test.ts
git commit -m "feat(articles): isEmailEnabled + newArticleEmail (bilingual, with unsubscribe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Notify dispatch — `notifyNewArticle` + `notifyPendingArticles`

**Files:**
- Create: `lib/cms/article-notify.ts`
- Test: `tests/cms/article-notify.test.ts`

**Interfaces:**
- Consumes: `sendEmail`, `isEmailEnabled`, `newArticleEmail` (Task 3); prisma `article`/`articleSubscriber`/`authorSubscription`.
- Produces: `notifyNewArticle(articleId: string): Promise<void>`; `notifyPendingArticles(): Promise<{ swept: number }>`.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/article-notify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const article = { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() }
  const articleSubscriber = { findMany: vi.fn() }
  const authorSubscription = { findMany: vi.fn() }
  const client = { article, articleSubscriber, authorSubscription }
  return { prisma: client, default: client }
})
vi.mock('@/lib/cms/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
  isEmailEnabled: vi.fn().mockReturnValue(true),
  newArticleEmail: vi.fn().mockReturnValue({ subject: 's', html: 'h' }),
}))

import prisma from '@/lib/prisma'
import { sendEmail, isEmailEnabled } from '@/lib/cms/email'
import { notifyNewArticle, notifyPendingArticles } from '@/lib/cms/article-notify'

const p = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>
  articleSubscriber: Record<string, ReturnType<typeof vi.fn>>
  authorSubscription: Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEmailEnabled).mockReturnValue(true)
  p.article.findUnique.mockResolvedValue({
    id: 'a1', slug: 'frbtc', status: 'PUBLISHED', authorId: 'auth1', primaryLocale: 'en',
    translations: [{ locale: 'en', title: 'T', excerpt: 'E' }],
  })
})

describe('notifyNewArticle', () => {
  it('dedupes a global + author subscriber by email and sends once, then marks notified', async () => {
    p.articleSubscriber.findMany.mockResolvedValueOnce([{ email: 'a@x.com', locale: 'en', unsubscribeToken: 'g1' }])
    p.authorSubscription.findMany.mockResolvedValueOnce([
      { email: 'a@x.com', locale: 'en', unsubscribeToken: 'f1' }, // dup of global
      { email: 'b@x.com', locale: 'en', unsubscribeToken: 'f2' },
    ])
    await notifyNewArticle('a1')
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2) // a@ once (global wins), b@ once
    expect(p.article.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { notifiedAt: expect.any(Date) } })
  })

  it('does NOT send or mark notified when email is disabled (Resend off)', async () => {
    vi.mocked(isEmailEnabled).mockReturnValue(false)
    await notifyNewArticle('a1')
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
    expect(p.article.update).not.toHaveBeenCalled()
  })
})

describe('notifyPendingArticles', () => {
  it('sweeps only PUBLISHED articles with notifiedAt null since the cutoff', async () => {
    p.article.findMany.mockResolvedValueOnce([{ id: 'a1' }])
    p.articleSubscriber.findMany.mockResolvedValue([])
    p.authorSubscription.findMany.mockResolvedValue([])
    const r = await notifyPendingArticles()
    expect(r.swept).toBe(1)
    const where = p.article.findMany.mock.calls[0][0].where
    expect(where.status).toBe('PUBLISHED')
    expect(where.notifiedAt).toBeNull()
    expect(where.publishedAt.gte).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/article-notify.test.ts`
Expected: FAIL — module `@/lib/cms/article-notify` not found.

- [ ] **Step 3: Implement `lib/cms/article-notify.ts`**

```ts
import prisma from "@/lib/prisma"
import { sendEmail, isEmailEnabled, newArticleEmail } from "@/lib/cms/email"

const APP_URL = process.env.CMS_BASE_URL ?? "https://subfrost.io"
// Articles published before the feature launch must never be notified about.
const NOTIFY_SINCE = new Date("2026-06-24T00:00:00Z")

type Recipient = { email: string; locale: "en" | "zh"; token: string }

/** Email global subscribers + the article author's followers (deduped by email).
 *  No-op (and does NOT mark the article notified) when Resend is unconfigured —
 *  the sweep retries later. Never throws to its caller's critical path. */
export async function notifyNewArticle(articleId: string): Promise<void> {
  if (!isEmailEnabled()) return

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true, slug: true, status: true, authorId: true, primaryLocale: true,
      translations: { select: { locale: true, title: true, excerpt: true } },
    },
  })
  if (!article || article.status !== "PUBLISHED") return

  const [globals, followers] = await Promise.all([
    prisma.articleSubscriber.findMany({ where: { active: true }, select: { email: true, locale: true, unsubscribeToken: true } }),
    prisma.authorSubscription.findMany({ where: { authorId: article.authorId, active: true }, select: { email: true, locale: true, unsubscribeToken: true } }),
  ])

  // Dedup by email; the global subscription wins (its locale + token).
  const byEmail = new Map<string, Recipient>()
  for (const f of followers) byEmail.set(f.email, { email: f.email, locale: f.locale, token: f.unsubscribeToken })
  for (const g of globals) byEmail.set(g.email, { email: g.email, locale: g.locale, token: g.unsubscribeToken })

  const pickTr = (loc: "en" | "zh") =>
    article.translations.find((t) => t.locale === loc) ??
    article.translations.find((t) => t.locale === article.primaryLocale) ??
    article.translations[0]

  for (const r of byEmail.values()) {
    const tr = pickTr(r.locale)
    if (!tr) continue
    const { subject, html } = newArticleEmail({
      title: tr.title, excerpt: tr.excerpt, slug: article.slug, locale: r.locale,
      unsubscribeUrl: `${APP_URL}/unsubscribe?token=${r.token}&lang=${r.locale}`,
    })
    await sendEmail({ to: r.email, subject, html })
  }

  await prisma.article.update({ where: { id: article.id }, data: { notifiedAt: new Date() } })
}

/** Flush any published-but-not-yet-notified articles (since the cutoff). Run by the
 *  prefetch cron — when Resend is restored, this delivers everything that queued up. */
export async function notifyPendingArticles(): Promise<{ swept: number }> {
  if (!isEmailEnabled()) return { swept: 0 }
  const pending = await prisma.article.findMany({
    where: { status: "PUBLISHED", notifiedAt: null, publishedAt: { gte: NOTIFY_SINCE } },
    select: { id: true },
  })
  for (const a of pending) await notifyNewArticle(a.id)
  return { swept: pending.length }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/article-notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add lib/cms/article-notify.ts tests/cms/article-notify.test.ts
git commit -m "feat(articles): notify dispatch (dedup, locale, Resend-resilient) + pending sweep

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Fire the notify on publish (`article-write.ts`)

**Files:**
- Modify: `lib/cms/article-write.ts`
- Test: `tests/cms/article-write-notify.test.ts`

**Interfaces:**
- Consumes: `notifyNewArticle` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `tests/cms/article-write-notify.test.ts`. This test asserts the wiring: publishing fires the notify; a draft save does not.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  article: { update: vi.fn().mockResolvedValue({}) },
  articleTranslation: { deleteMany: vi.fn().mockResolvedValue({}), upsert: vi.fn().mockResolvedValue({}) },
  revision: { create: vi.fn().mockResolvedValue({}) },
}
vi.mock('@/lib/prisma', () => {
  const article = {
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'new1' }),
  }
  const client = { article, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) }
  return { prisma: client, default: client }
})
vi.mock('@/lib/cms/article-notify', () => ({ notifyNewArticle: vi.fn().mockResolvedValue(undefined) }))

import prisma from '@/lib/prisma'
import { notifyNewArticle } from '@/lib/cms/article-notify'
import { upsertArticle } from '@/lib/cms/article-write'

const p = prisma as unknown as { article: Record<string, ReturnType<typeof vi.fn>> }
const actor = { id: 'auth1', privileges: ['articles.publish', 'articles.edit_any'] as never }
const input = (over: Record<string, unknown> = {}) => ({
  translations: { en: { title: 'T', excerpt: 'E', body: 'B', sources: '' } }, ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('upsertArticle → notify wiring', () => {
  it('fires notifyNewArticle when an existing draft becomes PUBLISHED', async () => {
    p.article.findUnique.mockResolvedValueOnce({ id: 'a1', slug: 's', status: 'DRAFT', authorId: 'auth1', publishedAt: null })
    await upsertArticle(actor, input({ id: 'a1', status: 'PUBLISHED' }))
    await new Promise((r) => setTimeout(r, 0)) // let the fire-and-forget microtask run
    expect(vi.mocked(notifyNewArticle)).toHaveBeenCalledWith('a1')
  })

  it('does NOT fire when saving a draft', async () => {
    p.article.findUnique.mockResolvedValueOnce({ id: 'a1', slug: 's', status: 'DRAFT', authorId: 'auth1', publishedAt: null })
    await upsertArticle(actor, input({ id: 'a1', status: 'DRAFT' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(vi.mocked(notifyNewArticle)).not.toHaveBeenCalled()
  })

  it('fires when creating an article already PUBLISHED', async () => {
    await upsertArticle(actor, input({ status: 'PUBLISHED' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(vi.mocked(notifyNewArticle)).toHaveBeenCalledWith('new1')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/article-write-notify.test.ts`
Expected: FAIL — `notifyNewArticle` never called (wiring absent).

- [ ] **Step 3: Wire the trigger in `lib/cms/article-write.ts`**

Add the import at the top:
```ts
import { notifyNewArticle } from "@/lib/cms/article-notify"
```

In the **update path**, replace `return { ok: true, slug, id: existing.id }` with a fire-and-forget notify when it just became published:
```ts
    if (becomingPublished) void notifyNewArticle(existing.id).catch((e) => console.error("[notify] update", e))
    return { ok: true, slug, id: existing.id }
```

In the **create path**, replace `return { ok: true, slug, id: created.id }` with:
```ts
    if (status === "PUBLISHED") void notifyNewArticle(created.id).catch((e) => console.error("[notify] create", e))
    return { ok: true, slug, id: created.id }
```

(`becomingPublished` and `status` are already in scope; `notifyNewArticle` is fire-and-forget so it never blocks or fails the publish.)

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/article-write-notify.test.ts`
Expected: PASS (fires on publish + create-published, not on draft).

- [ ] **Step 5: Typecheck + full suite + commit**

Run: `npx tsc --noEmit` → 0, then `CI=true npx vitest run` → green (no regression in the existing article-write tests).
```bash
git add lib/cms/article-write.ts tests/cms/article-write-notify.test.ts
git commit -m "feat(articles): fire notify-on-publish (fire-and-forget) from upsertArticle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Pending-sweep step in `/api/prefetch`

**Files:**
- Modify: `app/api/prefetch/route.ts`

**Interfaces:**
- Consumes: `notifyPendingArticles` (Task 4).

> No new unit test: it is one `run(key, fn)` orchestration step (the sweep logic is tested in Task 4), verified by `tsc` + `next build` + the live post-deploy run. Match the existing `run(...)` pattern.

- [ ] **Step 1: Add the import**

In `app/api/prefetch/route.ts`, add:
```ts
import { notifyPendingArticles } from '@/lib/cms/article-notify';
```

- [ ] **Step 2: Add the sweep step**

Inside the existing `await Promise.allSettled([ … ])` array, add:
```ts
    run('notify-pending', async () => {
      await notifyPendingArticles();
    }),
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` → 0, then `npx next build` → 0.

- [ ] **Step 4: Commit**

```bash
git add app/api/prefetch/route.ts
git commit -m "feat(articles): flush pending article notifications from the prefetch cron

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Unsubscribe page

**Files:**
- Create: `app/unsubscribe/page.tsx`

**Interfaces:**
- Consumes: `unsubscribeByToken` (Task 1).

> No new unit test: a thin server component over the already-tested `unsubscribeByToken`; verified by `tsc` + `next build`.

- [ ] **Step 1: Implement the page**

Create `app/unsubscribe/page.tsx`:

```tsx
import { unsubscribeByToken } from "@/lib/cms/article-subscribe"

export const dynamic = "force-dynamic"

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; lang?: string }>
}) {
  const { token, lang } = await searchParams
  const zh = lang === "zh"
  const result = token ? await unsubscribeByToken(token) : { unsubscribed: false, kind: null as null }

  const copy = result.unsubscribed
    ? zh
      ? { h: "已退订", p: "你将不再收到这些邮件。" }
      : { h: "You're unsubscribed", p: "You won't receive these emails anymore." }
    : zh
      ? { h: "链接无效", p: "这个退订链接无效或已过期。" }
      : { h: "Link invalid", p: "This unsubscribe link is invalid or has expired." }

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>{copy.h}</h1>
      <p style={{ color: "#475569" }}>{copy.p}</p>
      <p style={{ marginTop: 24 }}><a href="/articles" style={{ color: "#0ea5e9" }}>{zh ? "返回文章" : "Back to articles"}</a></p>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → 0, then `npx next build` → 0 (the `/unsubscribe` route appears).

- [ ] **Step 3: Commit**

```bash
git add app/unsubscribe/page.tsx
git commit -m "feat(articles): tokenized unsubscribe confirmation page (bilingual)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `FollowAuthorButton` component

**Files:**
- Create: `components/articles/FollowAuthorButton.tsx`
- Test: `tests/cms/follow-author-button.test.tsx`

**Interfaces:**
- Produces: `FollowAuthorButton` (default export) — props `{ authorId: string; authorName: string; locale: 'en'|'zh' }`. POSTs `{ email, authorId, locale }` to `/api/articles/follow`.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/follow-author-button.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import FollowAuthorButton from '@/components/articles/FollowAuthorButton'

beforeEach(() => { (global.fetch as unknown) = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) })
afterEach(() => cleanup())

describe('FollowAuthorButton', () => {
  it('posts the email + authorId to /api/articles/follow', async () => {
    const { getByPlaceholderText, getByRole, getAllByRole } = render(
      <FollowAuthorButton authorId="auth1" authorName="Gabe" locale="en" />,
    )
    // open the email field
    fireEvent.click(getAllByRole('button')[0])
    fireEvent.change(getByPlaceholderText(/email/i), { target: { value: 'a@x.com' } })
    // submit
    const form = getByRole('button', { name: /follow|subscribe|confirm|✓|→/i })
    fireEvent.click(form)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toBe('/api/articles/follow')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body).toMatchObject({ email: 'a@x.com', authorId: 'auth1', locale: 'en' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/follow-author-button.test.tsx`
Expected: FAIL — module `@/components/articles/FollowAuthorButton` not found.

- [ ] **Step 3: Implement `components/articles/FollowAuthorButton.tsx`**

```tsx
"use client"

import { FormEvent, useState } from "react"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FollowAuthorButton({
  authorId, authorName, locale,
}: { authorId: string; authorName: string; locale: "en" | "zh" }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")

  const copy = locale === "zh"
    ? { follow: `关注 ${authorName}`, placeholder: "输入你的邮箱地址", confirm: "关注", done: "已关注", invalid: "请输入有效邮箱。", error: "失败，请重试。" }
    : { follow: `Follow ${authorName}`, placeholder: "Enter your email", confirm: "Follow", done: "Following", invalid: "Enter a valid email.", error: "Failed, try again." }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(normalized)) { setState("error"); return }
    setState("loading")
    try {
      const res = await fetch("/api/articles/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, authorId, locale }),
      })
      if (!res.ok) throw new Error("failed")
      setState("success")
    } catch {
      setState("error")
    }
  }

  if (state === "success") {
    return <span className="ed-follow-done text-[13px] font-medium" style={{ color: "var(--ed-body)" }}>✓ {copy.done}</span>
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="ed-follow-btn inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
        style={{ borderColor: "color-mix(in srgb, var(--ed-ink) 18%, transparent)", color: "var(--ed-ink)" }}>
        {copy.follow}
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="inline-flex items-center gap-2">
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={copy.placeholder}
        autoComplete="email" disabled={state === "loading"}
        className="ed-follow-input min-w-0 rounded-[6px] border bg-transparent px-2 py-1.5 text-[13px] outline-none"
        style={{ borderColor: state === "error" ? "#c73c28" : "color-mix(in srgb, var(--ed-ink) 18%, transparent)", color: "var(--ed-ink)" }} />
      <button type="submit" disabled={state === "loading"}
        className="rounded-[6px] px-3 py-1.5 text-[13px] font-semibold"
        style={{ background: "var(--ed-action-bg)", color: "var(--ed-action-fg)" }}>
        {state === "loading" ? "..." : copy.confirm}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/follow-author-button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add components/articles/FollowAuthorButton.tsx tests/cms/follow-author-button.test.tsx
git commit -m "feat(articles): FollowAuthorButton (email-capture per-author subscribe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: UI placements (follow ×2 + subscribe ×2)

**Files:**
- Modify: `components/articles/AuthorByline.tsx` (follow button on the byline)
- Modify: `app/authors/[id]/page.tsx` (follow button in the author header)
- Modify: `app/articles/[slug]/page.tsx` (SubscribePanel at the end of the article)
- Modify: `app/articles/page.tsx` (SubscribePanel banner near the top)

**Interfaces:**
- Consumes: `FollowAuthorButton` (Task 8); `SubscribePanel` (existing, `components/articles/SubscribePanel.tsx`, props `{ locale: 'en'|'zh'; fullBleed?; footer? }`).

> No new unit test: these are component placements in existing pages (the component behavior is covered by Task 8 and SubscribePanel already ships). Verified by `tsc` + `next build`. First READ each target file and follow its existing locale-resolution + layout patterns; the snippets below show what to add, not where verbatim.

- [ ] **Step 1: Follow button on the byline**

In `components/articles/AuthorByline.tsx`, render `FollowAuthorButton` next to the author name. The component already knows the article's author and locale — pass them through:
```tsx
import FollowAuthorButton from "@/components/articles/FollowAuthorButton"
// …next to the author name, where layout allows:
<FollowAuthorButton authorId={author.id} authorName={author.name ?? "this author"} locale={locale} />
```
If `AuthorByline` does not already receive `author.id`/`locale`, thread them from its caller (the article view / `app/articles/[slug]/page.tsx`) — they are available there (the article has `authorId`; the page resolves locale).

- [ ] **Step 2: Follow button on the author profile**

In `app/authors/[id]/page.tsx`, render the follow button prominently in the author header (after the name/bio):
```tsx
import FollowAuthorButton from "@/components/articles/FollowAuthorButton"
// …in the header block, using the page's resolved author + locale:
<FollowAuthorButton authorId={author.id} authorName={author.name ?? "this author"} locale={locale} />
```

- [ ] **Step 3: Global subscribe at the end of the article**

In `app/articles/[slug]/page.tsx`, after the article body, render the existing panel:
```tsx
import { SubscribePanel } from "@/components/articles/SubscribePanel"
// …after the body content:
<SubscribePanel locale={locale} />
```

- [ ] **Step 4: Global subscribe banner on /articles**

In `app/articles/page.tsx`, near the top of the index (above or just under the heading), render:
```tsx
import { SubscribePanel } from "@/components/articles/SubscribePanel"
// …near the top:
<SubscribePanel locale={locale} />
```
(The footer keeps its existing `<SubscribePanel … footer />` — do not remove it.)

- [ ] **Step 5: Typecheck + full suite + build**

Run: `npx tsc --noEmit` → 0 · `CI=true npx vitest run` → green · `npx next build` → 0.

- [ ] **Step 6: Commit**

```bash
git add components/articles/AuthorByline.tsx app/authors/[id]/page.tsx app/articles/[slug]/page.tsx app/articles/page.tsx
git commit -m "feat(articles): place follow button (byline + author page) and subscribe (article end + /articles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (before opening the PR)

- [ ] **Full gates**

```bash
npx tsc --noEmit
CI=true npx vitest run
npx next build
```
Expected: tsc 0 · vitest green (incl. new `article-subscribe`, `articles-follow`, `article-email`, `article-notify`, `article-write-notify`, `follow-author-button` suites) · build 0.

- [ ] **Open the PR** (do NOT merge or bump `newTag` without Vitor's go):

```bash
git push -u origin feat/article-notifications
gh pr create --title "Article subscriptions + notify-on-publish (v1): follow-author, visible subscribe, tokenized unsubscribe" --body "$(cat <<'EOF'
Builds article subscriptions + notify-on-publish for subfrost.io/articles.

- **Global + per-author subscriptions** — keeps the existing global subscribe; adds a "follow author" (anonymous email, single opt-in). New `AuthorSubscription` model + `unsubscribeToken` on `ArticleSubscriber`.
- **Notify-on-publish** — `upsertArticle` fires `notifyNewArticle` (fire-and-forget) on publish; emails active global subscribers + the author's followers, deduped by email, in their locale.
- **Resend-resilient** — sends no-op gracefully while `RESEND_API_KEY` is unset; `notifiedAt` is set only on a real send; a sweep on the `/api/prefetch` cron flushes anything pending once Resend is restored (articles before the launch cutoff are never notified).
- **Tokenized unsubscribe** — every email carries an `/unsubscribe?token=…` link; bilingual confirmation page.
- **UI** — `FollowAuthorButton` on the author profile + article byline; the subscribe panel at the end of each article and as a banner on `/articles` (footer unchanged).

Additive schema (`prisma db push`). Gates: tsc 0 · vitest green · build 0. ⚠️ Email sending activates only once flex provisions `resend-api-key` in Secret Manager and the RESEND entry in `k8s/external-secrets.yaml` is uncommented.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Post-merge / deploy notes
- Deploy is human-owned: merge → Cloud Build → bump `newTag` in `k8s/kustomization.yaml` via PR → Flux (reconcile the GitRepository source before the Kustomization). The `prisma db push` init container creates `AuthorSubscription` + the new columns.
- **Email stays dormant until flex provisions Resend:** create `resend-api-key` in GCP Secret Manager, then uncomment the `RESEND_API_KEY` entry in `k8s/external-secrets.yaml` (lines ~56-57) so ESO syncs it. The next `/api/prefetch` sweep then delivers any pending notifications automatically.
- Live check: subscribe on `/articles` + follow on `/authors/[id]` → rows created; publish an article → with Resend off, `notifiedAt` stays null; once Resend is on, the sweep sends and `notifiedAt` is set; an unsubscribe link flips `active=false`.
