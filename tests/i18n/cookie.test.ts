import { describe, it, expect, beforeEach } from 'vitest'
import { setLocaleCookie, LOCALE_COOKIE } from '@/lib/i18n/cookie'

describe('setLocaleCookie', () => {
  beforeEach(() => {
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`
  })

  it('writes the locale cookie', () => {
    setLocaleCookie('zh')
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=zh`)
  })

  it('overwrites the previous value', () => {
    setLocaleCookie('zh')
    setLocaleCookie('en')
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`)
    expect(document.cookie).not.toContain(`${LOCALE_COOKIE}=zh`)
  })
})
