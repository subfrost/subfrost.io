import { NextResponse } from "next/server"

// Public read API is consumed cross-origin by subfrost.io (and apex/www).
const ALLOWED = new Set([
  "https://subfrost.io",
  "https://www.subfrost.io",
  "http://localhost:3000",
])

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.has(origin) ? origin : "https://subfrost.io"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  }
}

export function jsonWithCors(
  data: unknown,
  origin: string | null,
  init: ResponseInit = {},
) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...corsHeaders(origin), ...(init.headers || {}) },
  })
}

export function preflight(origin: string | null) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}
