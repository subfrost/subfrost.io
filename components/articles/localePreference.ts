"use client"

import { EDITORIAL_LOCALE_COOKIE, EDITORIAL_LOCALE_COOKIE_MAX_AGE, type EditorialLocale } from "@/lib/editorial-locale"

export function rememberEditorialLocale(locale: EditorialLocale) {
  document.cookie = `${EDITORIAL_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${EDITORIAL_LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
}
