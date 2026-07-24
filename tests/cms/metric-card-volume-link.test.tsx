import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MetricCard, type DataCardCopy } from '@/components/data/DataPageClient'
import type { PublicMetricKey } from '@/lib/marketing/public-data'

// Gabe (2026-07-24): the frBTC and BTC-locked boxes on /metrics should link out to
// Protocol volume (/volume). Only those two boxes — the other cards stay as they are.

const copyEn: DataCardCopy = { share: 'Copy card link', copied: 'Copied!', post: 'Post on X', sevenDays: '7d', protocolVolume: 'Protocol volume' }
const copyZh: DataCardCopy = { ...copyEn, protocolVolume: '协议交易量' }

afterEach(() => cleanup())

function renderCard(metric: PublicMetricKey, locale: 'en' | 'zh', copy: DataCardCopy) {
  return render(
    <MetricCard metric={metric} value={12.3456} deltaPct={null} series={[]} showChart={false} copy={copy} locale={locale} />,
  )
}

describe('MetricCard — Protocol volume link', () => {
  it('links the BTC-locked card to /volume', () => {
    renderCard('btc-locked', 'en', copyEn)
    expect(screen.getByRole('link', { name: 'Protocol volume' })).toHaveAttribute('href', '/volume')
  })

  it('links the frBTC-supply card to /volume', () => {
    renderCard('frbtc-supply', 'en', copyEn)
    expect(screen.getByRole('link', { name: 'Protocol volume' })).toHaveAttribute('href', '/volume')
  })

  it('does NOT add the link to the other metric cards', () => {
    for (const m of ['diesel-holders', 'diesel-price', 'diesel-marketcap', 'fire-price'] as PublicMetricKey[]) {
      renderCard(m, 'en', copyEn)
      expect(screen.queryByRole('link', { name: 'Protocol volume' })).toBeNull()
      cleanup()
    }
  })

  it('keeps the reader in Chinese on the zh link', () => {
    renderCard('btc-locked', 'zh', copyZh)
    expect(screen.getByRole('link', { name: '协议交易量' })).toHaveAttribute('href', '/volume?lang=zh')
  })
})
