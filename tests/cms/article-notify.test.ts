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
import { sendEmail, isEmailEnabled, newArticleEmail } from '@/lib/cms/email'
import { notifyNewArticle, notifyPendingArticles } from '@/lib/cms/article-notify'

const p = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>
  articleSubscriber: Record<string, ReturnType<typeof vi.fn>>
  authorSubscription: Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEmailEnabled).mockReturnValue(true)
  vi.mocked(newArticleEmail).mockReturnValue({ subject: 's', html: 'h' })
  vi.mocked(sendEmail).mockResolvedValue({ ok: true })
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
