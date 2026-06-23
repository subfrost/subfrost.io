import { describe, it, expect } from 'vitest'
import { resolveArticleLocale } from '@/lib/i18n/resolve'

describe('resolveArticleLocale', () => {
  it('?lang=zh wins over cookie en', () => expect(resolveArticleLocale('zh', 'en')).toBe('zh'))
  it('?lang=en wins over cookie zh', () => expect(resolveArticleLocale('en', 'zh')).toBe('en'))
  it('cookie zh when no ?lang=', () => expect(resolveArticleLocale(undefined, 'zh')).toBe('zh'))
  it('cookie en when no ?lang=', () => expect(resolveArticleLocale(undefined, 'en')).toBe('en'))
  it('default en when neither', () => expect(resolveArticleLocale(undefined, undefined)).toBe('en'))
  it('ignores junk ?lang=, falls to cookie', () => expect(resolveArticleLocale('fr', 'zh')).toBe('zh'))
  it('ignores junk cookie, falls to en', () => expect(resolveArticleLocale(undefined, 'fr')).toBe('en'))
})
