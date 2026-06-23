import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, verifySession } from "@/lib/cms/session"
import {
  EDITORIAL_LOCALE_COOKIE,
  EDITORIAL_LOCALE_COOKIE_MAX_AGE,
  isEditorialLocale,
  prefersChineseLocale,
} from "@/lib/editorial-locale"

const PUBLIC_ADMIN = ["/admin/login", "/admin/set-password", "/admin/forgot-password"]
const CHINESE_MARKETS = new Set(["CN", "HK"])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Gate the /admin CMS. Public auth pages (login + the emailed
  // set-password / forgot-password flows) are exempt. Edge-only signature
  // check; full role/active enforcement happens in server components via authz.
  if (pathname.startsWith("/admin") && !PUBLIC_ADMIN.some((p) => pathname.startsWith(p))) {
    const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin/login"
      url.searchParams.set("from", pathname)
      return withSecurityHeaders(NextResponse.redirect(url), pathname)
    }
  }

  if (isEditorialLocalePath(pathname)) {
    const explicitLocale = request.nextUrl.searchParams.get("lang")
    if (isEditorialLocale(explicitLocale)) {
      const response = NextResponse.next()
      rememberLocale(response, explicitLocale, request)
      return withSecurityHeaders(response, pathname)
    }

    const savedLocale = request.cookies.get(EDITORIAL_LOCALE_COOKIE)?.value
    if (!isEditorialLocale(savedLocale) && shouldDefaultToChinese(request)) {
      const url = request.nextUrl.clone()
      url.searchParams.set("lang", "zh")
      const response = NextResponse.redirect(url)
      rememberLocale(response, "zh", request)
      return withSecurityHeaders(response, pathname)
    }
  }

  return withSecurityHeaders(NextResponse.next(), pathname)
}

function withSecurityHeaders(response: NextResponse, pathname: string) {
  const isBroadcastPath = pathname.startsWith("/broadcast")

  // Add security headers. img-src already allows https: (covers GCS avatars).
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.cdnfonts.com; " +
      "font-src 'self' https://fonts.gstatic.com https://fonts.cdnfonts.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://www.google.com wss://media.subfrost.io https://stream.subfrost.io https://storage.googleapis.com; " +
      "media-src 'self' https://stream.subfrost.io blob:; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self';",
  )
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

  if (isBroadcastPath) {
    response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), interest-cohort=()")
  } else {
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()")
  }

  return response
}

function isEditorialLocalePath(pathname: string) {
  return pathname === "/articles" || pathname.startsWith("/articles/") || pathname.startsWith("/authors/")
}

function shouldDefaultToChinese(request: NextRequest) {
  const country = getCountryCode(request)
  return CHINESE_MARKETS.has(country) || prefersChineseLocale(request.headers.get("accept-language"))
}

function getCountryCode(request: NextRequest) {
  return (
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-country-code") ||
    request.headers.get("x-nf-country") ||
    request.headers.get("x-netlify-country") ||
    ""
  ).toUpperCase()
}

function rememberLocale(response: NextResponse, locale: "en" | "zh", request: NextRequest) {
  response.cookies.set(EDITORIAL_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: EDITORIAL_LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  })
}

export const config = {
  matcher: "/:path*",
}
