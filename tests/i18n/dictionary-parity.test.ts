import { describe, it, expect } from 'vitest'
import en from '@/i18n/en'
import zh from '@/i18n/zh'

describe('i18n dictionary parity', () => {
  it('en and zh expose the same keys', () => {
    const enKeys = Object.keys(en).sort()
    const zhKeys = Object.keys(zh).sort()
    const missingInZh = enKeys.filter((k) => !(k in zh))
    const missingInEn = zhKeys.filter((k) => !(k in en))
    expect({ missingInZh, missingInEn }).toEqual({ missingInZh: [], missingInEn: [] })
  })

  it('no value is an empty string', () => {
    const blanks = Object.entries(en)
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k)
      .concat(Object.entries(zh).filter(([, v]) => v.trim() === '').map(([k]) => k))
    expect(blanks).toEqual([])
  })
})
