/**
 * Server-side client for the subfrost-app error-report API.
 *
 * The app's error reports live in subfrost-app's Postgres (they are POSTed to
 * app.subfrost.io/api/error-report by the web app). This site's /admin/errors
 * page reads them server-to-server via that repo's
 * GET /api/admin/error-reports, authenticated with a shared bearer token
 * (ERROR_REPORTS_SERVICE_TOKEN - the same value must be set on the
 * subfrost-app deployment). No database is shared between the two services.
 */

export interface ErrorReportRow {
  id: string
  receivedAt: string
  createdAt: string
  source: string
  message: string
  rawError: string | null
  tag: string | null
  fingerprint: string
  walletAddress: string | null
  route: string | null
  browser: string | null
  browserVersion: string | null
  os: string | null
  deviceType: string | null
  language: string | null
  walletName: string | null
  walletType: string | null
  userNote: string | null
}

export interface ErrorReportGroup {
  fingerprint: string
  count: number
  firstSeen: string | null
  lastSeen: string | null
  distinctWallets: number
  sample: Pick<
    ErrorReportRow,
    "id" | "message" | "source" | "tag" | "route" | "browser" | "os" | "walletAddress" | "receivedAt"
  > | null
}

export interface ErrorReportPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export type ErrorReportsResult =
  | { configured: false }
  | { configured: true; ok: false; error: string }
  | {
      configured: true
      ok: true
      groups?: ErrorReportGroup[]
      reports?: ErrorReportRow[]
      pagination: ErrorReportPagination
    }

export async function fetchErrorReports(query: Record<string, string>): Promise<ErrorReportsResult> {
  const token = process.env.ERROR_REPORTS_SERVICE_TOKEN
  if (!token) return { configured: false }

  const base = process.env.ERROR_REPORTS_API_BASE || "https://app.subfrost.io"
  try {
    const res = await fetch(`${base}/api/admin/error-reports?${new URLSearchParams(query)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return { configured: true, ok: false, error: `error-report API responded ${res.status}` }
    }
    const data = (await res.json()) as {
      groups?: ErrorReportGroup[]
      reports?: ErrorReportRow[]
      pagination: ErrorReportPagination
    }
    return { configured: true, ok: true, ...data }
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : "failed to reach the error-report API",
    }
  }
}
