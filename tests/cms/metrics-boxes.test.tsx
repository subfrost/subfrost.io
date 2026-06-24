import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import MetricsBoxes from '@/components/MetricsBoxes'
import type { HomeStats } from '@/lib/stats'

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

beforeEach(() => cleanup())

const stats = (over: Partial<HomeStats['metrics']> = {}): HomeStats => ({
  metrics: {
    alkanesBtcLocked: 99.6, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null,
    alkanesCirculating: 99.2, brc20Circulating: 0.95, alkanesTotalUnwraps: 74.2, brc20TotalUnwraps: 20.3,
    btcPrice: 62000, ...over,
  },
  marquee: { btcUsd: 62000, btcHeight: null, metashrewHeight: null, dieselUsd: null, fireUsd: null, btcDieselRatio: null, btcFireRatio: null },
})

const renderWith = (s: HomeStats) =>
  render(
    <SWRConfig value={{ fallback: { '/api/stats': s }, provider: () => new Map() }}>
      <MetricsBoxes onPartnershipsClick={() => {}} />
    </SWRConfig>,
  )

describe('MetricsBoxes — SSR fallback', () => {
  it('renders the combined BTC locked from the fallback (99.6 + 1 = 100.6)', () => {
    const { getByText } = renderWith(stats())
    expect(getByText('100.600')).toBeTruthy()
  })

  it('shows the full lifetime value when all inputs are present (74.2+20.3+99.2+0.95)', () => {
    const { getByText } = renderWith(stats())
    expect(getByText('194.650')).toBeTruthy()
  })

  it('shows a loading state (not a partial sum) when a lifetime input is null', () => {
    const { queryByText } = renderWith(stats({ brc20TotalUnwraps: null }))
    // must NOT render the partial sum that drops the missing part
    expect(queryByText('174.350')).toBeNull()
  })
})
