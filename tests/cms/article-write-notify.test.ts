import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  article: { update: vi.fn() },
  articleTranslation: { deleteMany: vi.fn(), upsert: vi.fn() },
  revision: { create: vi.fn() },
}

vi.mock('@/lib/prisma', () => {
  const article = {
    findUnique: vi.fn(),
    create: vi.fn(),
  }
  const client = { article, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) }
  return { prisma: client, default: client }
})
vi.mock('@/lib/cms/article-notify', () => ({ notifyNewArticle: vi.fn() }))

import prisma from '@/lib/prisma'
import { notifyNewArticle } from '@/lib/cms/article-notify'
import { upsertArticle } from '@/lib/cms/article-write'

const p = prisma as unknown as { article: Record<string, ReturnType<typeof vi.fn>>; $transaction: ReturnType<typeof vi.fn> }
const actor = { id: 'auth1', privileges: ['articles.publish', 'articles.edit_any'] as never }
const input = (over: Record<string, unknown> = {}) => ({
  translations: { en: { title: 'T', excerpt: 'E', body: 'B', sources: '' } }, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  // Restore $transaction and tx fns after mockReset wipes them
  tx.article.update.mockResolvedValue({})
  tx.articleTranslation.deleteMany.mockResolvedValue({})
  tx.articleTranslation.upsert.mockResolvedValue({})
  tx.revision.create.mockResolvedValue({})
  p.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
  vi.mocked(notifyNewArticle).mockResolvedValue(undefined)
})

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
    p.article.create.mockResolvedValue({ id: 'new1' })
    await upsertArticle(actor, input({ status: 'PUBLISHED' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(vi.mocked(notifyNewArticle)).toHaveBeenCalledWith('new1')
  })
})
