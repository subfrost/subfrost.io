import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/stats', () => ({ getStats: vi.fn() }))

import { GET } from '@/app/api/stats/route'
import { getStats } from '@/lib/stats'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/stats', () => {
  it('returns the assembled stats payload', async () => {
    vi.mocked(getStats).mockResolvedValueOnce({
      metrics: { alkanesBtcLocked: 99.6, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null, alkanesCirculating: null, brc20Circulating: null, alkanesTotalUnwraps: null, brc20TotalUnwraps: null, btcPrice: 62000 },
      marquee: { btcUsd: 62000, btcHeight: 955109, metashrewHeight: 955108, dieselUsd: 70.2, fireUsd: 55.2, btcDieselRatio: 62000 / 70.2, btcFireRatio: 62000 / 55.2 },
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.metrics.alkanesBtcLocked).toBe(99.6)
    expect(data.marquee.btcHeight).toBe(955109)
  })
})
