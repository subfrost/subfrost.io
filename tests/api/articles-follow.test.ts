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
    expect(await res.json()).toMatchObject({ ok: false, error: 'Unknown author' })
  })

  it('400 on invalid JSON', async () => {
    const r = new Request('http://t/api/articles/follow', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json',
    }) as never
    const res = await POST(r)
    expect(res.status).toBe(400)
    expect(followAuthor).not.toHaveBeenCalled()
  })
})
