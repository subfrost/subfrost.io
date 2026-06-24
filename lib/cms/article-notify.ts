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
