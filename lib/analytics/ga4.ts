// GA4 Data API adapter. Raw runReport REST calls (bearer from google-auth) +
// normalizers into the shapes in source.ts. Every function is guarded; a missing
// token, HTTP error, or malformed body yields an empty/zeroed result, never throws.
import { getGoogleAccessToken } from "@/lib/analytics/google-auth"
import type { VisitorsSeries, TopPageRow, TrafficSourceRow } from "@/lib/analytics/source"

const DATA_API = "https://analyticsdata.googleapis.com/v1beta"

export interface GaRow { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }
export interface GaReportResponse { rows?: GaRow[] }

const num = (v: string | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const str = (v: string | undefined): string | null => (v && v !== "(not set)" ? v : null)

export async function runReport(body: Record<string, unknown>): Promise<GaReportResponse | null> {
  const token = await getGoogleAccessToken()
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!token || !propertyId) return null
  try {
    const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return (await res.json()) as GaReportResponse
  } catch {
    return null
  }
}

export function normalizeVisitors(res: GaReportResponse | null): VisitorsSeries {
  const rows = res?.rows ?? []
  const points = rows.map((r) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    activeUsers: num(r.metricValues?.[0]?.value),
    sessions: num(r.metricValues?.[1]?.value),
    pageViews: num(r.metricValues?.[2]?.value),
  }))
  const totals = points.reduce(
    (acc, p) => ({
      activeUsers: acc.activeUsers + p.activeUsers,
      sessions: acc.sessions + p.sessions,
      pageViews: acc.pageViews + p.pageViews,
    }),
    { activeUsers: 0, sessions: 0, pageViews: 0 },
  )
  return { points, totals }
}

export function normalizeTopPages(res: GaReportResponse | null): TopPageRow[] {
  return (res?.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "",
    title: str(r.dimensionValues?.[1]?.value),
    pageViews: num(r.metricValues?.[0]?.value),
  }))
}

export function normalizeTrafficSources(res: GaReportResponse | null): TrafficSourceRow[] {
  return (res?.rows ?? []).map((r) => ({
    channel: r.dimensionValues?.[0]?.value ?? "",
    source: str(r.dimensionValues?.[1]?.value),
    campaign: str(r.dimensionValues?.[2]?.value),
    sessions: num(r.metricValues?.[0]?.value),
  }))
}
