import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/stats-store', () => ({ storeGetAll: vi.fn() }))

import { getStats } from '@/lib/stats'
import { storeGetAll } from '@/lib/stats-store'

beforeEach(() => vi.clearAllMocks())

describe('getStats', () => {
  it('assembles metrics + marquee from the store rows', async () => {
    vi.mocked(storeGetAll).mockResolvedValueOnce({
      'alkanes-btc-locked': { btcLocked: 99.6, address: 'bc1pA' },
      'brc20-btc-locked': { btcLocked: 1.0, address: 'bc1pB' },
      'alkanes-circulating': { circulatingBtc: 99.2 },
      'brc20-circulating': { circulatingBtc: 0.95 },
      'alkanes-total-unwraps': { totalUnwrapsBtc: 74.2 },
      'brc20-total-unwraps': { totalUnwrapsBtc: 20.3 },
      'btc-price': { btcPrice: 62000 },
      'btc-height': { height: 955109 },
      'metashrew-height': { height: 955108 },
      'diesel-price': { usd: 70.2 },
      'fire-price': { usd: 55.2 },
    })
    const s = await getStats()
    expect(s.metrics.alkanesBtcLocked).toBe(99.6)
    expect(s.metrics.alkanesBtcLockedAddress).toBe('bc1pA')
    expect(s.metrics.brc20TotalUnwraps).toBe(20.3)
    expect(s.metrics.btcPrice).toBe(62000)
    expect(s.marquee.btcUsd).toBe(62000)
    expect(s.marquee.btcHeight).toBe(955109)
    expect(s.marquee.metashrewHeight).toBe(955108)
    expect(s.marquee.dieselUsd).toBe(70.2)
    expect(s.marquee.fireUsd).toBe(55.2)
  })

  it('yields null for cold/missing or malformed values (never throws)', async () => {
    vi.mocked(storeGetAll).mockResolvedValueOnce({
      'alkanes-btc-locked': { btcLocked: 'oops' }, // malformed
    })
    const s = await getStats()
    expect(s.metrics.alkanesBtcLocked).toBeNull()
    expect(s.metrics.alkanesBtcLockedAddress).toBeNull()
    expect(s.marquee.btcHeight).toBeNull()
    expect(s.marquee.dieselUsd).toBeNull()
  })
})
