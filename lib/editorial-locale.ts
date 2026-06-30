export const EDITORIAL_LOCALE_COOKIE = "subfrost_locale"
export const EDITORIAL_LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type EditorialLocale = "en" | "zh"

export function isEditorialLocale(value: string | null | undefined): value is EditorialLocale {
  return value === "en" || value === "zh"
}

export function prefersChineseLocale(acceptLanguage: string | null): boolean {
  if (!acceptLanguage) return false
  return acceptLanguage
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === "zh" || part.startsWith("zh-") || part.startsWith("zh_"))
}
