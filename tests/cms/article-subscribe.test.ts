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
