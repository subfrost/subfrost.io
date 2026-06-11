import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, verifySession } from "@/lib/cms/session"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Gate the /admin CMS (login page is exempt). Edge-only signature check;
  // full role/active enforcement happens in the server components via authz.
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin/login"
      url.searchParams.set("from", pathname)
      return NextResponse.redirect(url)
    }
  }

  const response = NextResponse.next()

  const isBroadcastPath = pathname.startsWith("/broadcast")

  // Add security headers. img-src already allows https: (covers GCS avatars).
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.cdnfonts.com; " +
      "font-src 'self' https://fonts.gstatic.com https://fonts.cdnfonts.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com wss://media.subfrost.io https://stream.subfrost.io https://storage.googleapis.com; " +
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
