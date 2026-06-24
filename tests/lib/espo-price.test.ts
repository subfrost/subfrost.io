import { describe, it, expect, vi } from 'vitest'
import { getEspoUsdPrice, DIESEL_POOL, FIRE_POOL } from '@/lib/espo-price'

const candleReply = (close: string) => ({
  ok: true,
  json: async () => ({ jsonrpc: '2.0', id: 1, result: { ok: true, candles: [{ close }] } }),
})

describe('getEspoUsdPrice', () => {
  it('POSTs ammdata.get_candles and parses candle.close / 1e16', async () => {
    const fetchImpl = vi.fn(async () => candleReply('702147774299597804')) as unknown as typeof fetch
    const usd = await getEspoUsdPrice(DIESEL_POOL, fetchImpl)
    expect(usd).toBeCloseTo(70.2147774299597804, 4)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect(String(url)).toBe('https://api.alkanode.com/rpc')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.method).toBe('ammdata.get_candles')
    expect(body.params.pool).toBe('2:0-usd')
    expect(body.params.timeframe).toBe('10m')
  })

  it('exposes the FIRE pool id', () => {
    expect(FIRE_POOL).toBe('2:77623-usd')
  })

  it('throws when no candle is returned', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ result: { ok: true, candles: [] } }) })) as unknown as typeof fetch
    await expect(getEspoUsdPrice(DIESEL_POOL, fetchImpl)).rejects.toThrow()
  })
})
