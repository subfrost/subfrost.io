import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Get response
  const response = NextResponse.next()

  const isBroadcastPath = request.nextUrl.pathname.startsWith("/broadcast")

  // Add security headers
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://www.google-analytics.com wss://media.subfrost.io https://stream.subfrost.io; " +
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
