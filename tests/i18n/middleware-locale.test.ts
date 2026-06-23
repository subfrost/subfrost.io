import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Avoid pulling the real session/db module at import time.
vi.mock('@/lib/cms/session', () => ({
  SESSION_COOKIE: 'sf_session',
  verifySession: vi.fn(async () => null),
}))

import { middleware } from '@/middleware'

describe('middleware locale detection', () => {
  it('sets subfrost_locale=zh for a zh visitor with no cookie', async () => {
    const req = new NextRequest('http://localhost/', {
      headers: { 'accept-language': 'zh-CN,en;q=0.8' },
    })
    const res = await middleware(req)
    expect(res.cookies.get('subfrost_locale')?.value).toBe('zh')
  })

  it('sets subfrost_locale=en for an en visitor with no cookie', async () => {
    const req = new NextRequest('http://localhost/', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    const res = await middleware(req)
    expect(res.cookies.get('subfrost_locale')?.value).toBe('en')
  })

  it('does not override an existing cookie', async () => {
    const req = new NextRequest('http://localhost/', {
      headers: { 'accept-language': 'zh-CN' },
    })
    req.cookies.set('subfrost_locale', 'en')
    const res = await middleware(req)
    expect(res.cookies.get('subfrost_locale')).toBeUndefined()
  })
})
