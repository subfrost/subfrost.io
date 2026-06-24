import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const homeStat = { upsert: vi.fn(), findMany: vi.fn() }
  const client = { homeStat }
  return { prisma: client, default: client }
})

import prisma from '@/lib/prisma'
import { storeSet, storeGetAll } from '@/lib/stats-store'

const hs = (prisma as unknown as { homeStat: Record<string, ReturnType<typeof vi.fn>> }).homeStat

beforeEach(() => {
  hs.upsert.mockReset()
  hs.findMany.mockReset()
})

describe('stats-store', () => {
  it('storeSet upserts the key with the value on both create and update', async () => {
    await storeSet('btc-height', { height: 955109 })
    expect(hs.upsert).toHaveBeenCalledWith({
      where: { key: 'btc-height' },
      create: { key: 'btc-height', value: { height: 955109 } },
      update: { value: { height: 955109 } },
    })
  })

  it('storeGetAll returns a key→value map from the rows', async () => {
    hs.findMany.mockResolvedValueOnce([
      { key: 'btc-price', value: { btcPrice: 62000 }, updatedAt: new Date() },
      { key: 'btc-height', value: { height: 955109 }, updatedAt: new Date() },
    ])
    const all = await storeGetAll()
    expect(all['btc-price']).toEqual({ btcPrice: 62000 })
    expect(all['btc-height']).toEqual({ height: 955109 })
  })
})
