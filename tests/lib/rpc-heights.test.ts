import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

import { getBtcHeight, getMetashrewHeight } from '@/lib/rpc-client'

const rpc = (result: unknown) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) })

beforeEach(() => vi.clearAllMocks())

describe('getBtcHeight / getMetashrewHeight', () => {
  it('getBtcHeight queries esplora_blocks:tip:height and returns a number', async () => {
    mockFetch.mockResolvedValueOnce(rpc(955109))
    const h = await getBtcHeight()
    expect(h).toBe(955109)
    const body = JSON.parse(String((mockFetch.mock.calls[0][1] as RequestInit).body))
    expect(body.method).toBe('esplora_blocks:tip:height')
  })

  it('getMetashrewHeight coerces the string height to a number', async () => {
    mockFetch.mockResolvedValueOnce(rpc('955108'))
    const h = await getMetashrewHeight()
    expect(h).toBe(955108)
    const body = JSON.parse(String((mockFetch.mock.calls[0][1] as RequestInit).body))
    expect(body.method).toBe('metashrew_height')
  })
})
