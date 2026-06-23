import type { CmsLocale } from '@/lib/cms/articles'

/**
 * Resolves the locale for an article page.
 * Precedence: explicit ?lang= > cookie > 'en'. Only 'en'/'zh' are valid;
 * anything else falls through to the next source.
 */
export function resolveArticleLocale(
  searchParamLang: string | undefined,
  cookieLocale: string | undefined,
): CmsLocale {
  if (searchParamLang === 'zh' || searchParamLang === 'en') return searchParamLang
  if (cookieLocale === 'zh' || cookieLocale === 'en') return cookieLocale
  return 'en'
}
