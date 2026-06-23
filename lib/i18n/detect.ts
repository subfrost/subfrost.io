export type Locale = 'en' | 'zh'

/** Maps an app locale to the BCP-47 tag used in <html lang>. */
export function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en'
}

/**
 * Picks 'en' or 'zh' from an Accept-Language header. The first supported
 * language tag in header order wins (Accept-Language is already preference-
 * ordered in practice). Any zh* tag (zh, zh-CN, zh-TW, ...) -> 'zh'.
 * Falls back to 'en' when nothing matches or the header is absent.
 */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return 'en'
  const tags = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase())
    .filter(Boolean)
  for (const tag of tags) {
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh'
    if (tag === 'en' || tag.startsWith('en-')) return 'en'
  }
  return 'en'
}
