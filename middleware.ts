import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, verifySession } from "@/lib/cms/session"
import { detectLocale, type Locale } from "@/lib/i18n/detect"
import { LOCALE_COOKIE, LOCALE_MAX_AGE_SECONDS } from "@/lib/i18n/cookie"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Gate the /admin CMS. Public auth pages (login + the emailed
  // set-password / forgot-password flows) are exempt. Edge-only signature
  // check; full role/active enforcement happens in server components via authz.
  const PUBLIC_ADMIN = ["/admin/login", "/admin/set-password", "/admin/forgot-password"]
  if (pathname.startsWith("/admin") && !PUBLIC_ADMIN.some((p) => pathname.startsWith(p))) {
    const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin/login"
      url.searchParams.set("from", pathname)
      return NextResponse.redirect(url)
    }
  }

  // Locale detection: on first visit (no cookie), pick en/zh from Accept-Language.
  // Set it on the forwarded request (so the same SSR render can read it via
  // cookies()) and on the response (so the browser persists it).
  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value
  let detected: Locale | undefined
  const requestHeaders = new Headers(request.headers)
  if (existingLocale !== "en" && existingLocale !== "zh") {
    detected = detectLocale(request.headers.get("accept-language"))
    const priorCookie = request.headers.get("cookie")
    requestHeaders.set(
      "cookie",
      priorCookie ? `${priorCookie}; ${LOCALE_COOKIE}=${detected}` : `${LOCALE_COOKIE}=${detected}`,
    )
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (detected) {
    response.cookies.set(LOCALE_COOKIE, detected, {
      path: "/",
      maxAge: LOCALE_MAX_AGE_SECONDS,
      sameSite: "lax",
    })
  }

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

export const config = {
  matcher: "/:path*",
}
