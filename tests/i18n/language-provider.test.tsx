import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { LanguageProvider, useLanguage } from '@/context/LanguageContext'
import { LOCALE_COOKIE } from '@/lib/i18n/cookie'

function Probe() {
  const { locale, toggleLocale } = useLanguage()
  return <button onClick={toggleLocale}>{locale}</button>
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`
  })

  it('uses initialLocale for the first render (no flash)', () => {
    render(
      <LanguageProvider initialLocale="zh">
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('zh')
  })

  it('toggle flips locale and writes the cookie', () => {
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('zh')
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=zh`)
  })
})
