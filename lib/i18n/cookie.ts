export const LOCALE_COOKIE = 'subfrost_locale'
export const LOCALE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // ~1 year

/**
 * Writes the locale preference cookie from the client. Not HttpOnly by design
 * — it is a non-sensitive UI preference that the toggle must read/write, and
 * it mirrors the cookie the middleware/server sets.
 */
export function setLocaleCookie(locale: 'en' | 'zh'): void {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_MAX_AGE_SECONDS}; samesite=lax`
}
