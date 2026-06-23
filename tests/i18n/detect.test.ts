import { describe, it, expect } from 'vitest'
import { detectLocale, htmlLang } from '@/lib/i18n/detect'

describe('detectLocale', () => {
  it('zh-CN with en fallback -> zh', () => expect(detectLocale('zh-CN,en;q=0.9')).toBe('zh'))
  it('en-US -> en', () => expect(detectLocale('en-US,en;q=0.9')).toBe('en'))
  it('zh-TW -> zh', () => expect(detectLocale('zh-TW')).toBe('zh'))
  it('bare zh -> zh', () => expect(detectLocale('zh')).toBe('zh'))
  it('empty string -> en', () => expect(detectLocale('')).toBe('en'))
  it('null -> en', () => expect(detectLocale(null)).toBe('en'))
  it('fr,en -> en', () => expect(detectLocale('fr,en')).toBe('en'))
  it('en preferred when listed before zh', () => expect(detectLocale('en-US,zh;q=0.8')).toBe('en'))
})

describe('htmlLang', () => {
  it('zh -> zh-CN', () => expect(htmlLang('zh')).toBe('zh-CN'))
  it('en -> en', () => expect(htmlLang('en')).toBe('en'))
})
