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

  it('does not set a locale cookie for an en visitor with no cookie', async () => {
    const req = new NextRequest('http://localhost/', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    const res = await middleware(req)
    expect(res.cookies.get('subfrost_locale')).toBeUndefined()
  })

  it('does not override an existing cookie', async () => {
    const req = new NextRequest('http://localhost/', {
      headers: { 'accept-language': 'zh-CN' },
    })
    req.cookies.set('subfrost_locale', 'en')
    const res = await middleware(req)
    expect(res.cookies.get('subfrost_locale')).toBeUndefined()
  })

  it('redirects an /articles/<slug> deep link to the saved zh cookie locale', async () => {
    const req = new NextRequest('http://localhost/articles/some-post', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    req.cookies.set('subfrost_locale', 'zh')
    const res = await middleware(req)
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location') || '', 'http://localhost')
    expect(location.pathname).toBe('/articles/some-post')
    expect(location.searchParams.get('lang')).toBe('zh')
  })

  it('redirects an /ecosystem/<slug> deep link to the saved zh cookie locale', async () => {
    const req = new NextRequest('http://localhost/ecosystem/arbuzino', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    req.cookies.set('subfrost_locale', 'zh')
    const res = await middleware(req)
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location') || '', 'http://localhost')
    expect(location.pathname).toBe('/ecosystem/arbuzino')
    expect(location.searchParams.get('lang')).toBe('zh')
  })
})
