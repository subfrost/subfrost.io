/**
 * /admin/errors - dashboard over app.subfrost.io error reports.
 *
 * Server component, fully GET-driven (filters and views are links / a GET
 * form; per-report detail uses <details> so no client JS is needed). Data is
 * proxied server-to-server from subfrost-app via lib/error-reports.ts - see
 * that file for the auth model. Gated by the errors.view privilege.
 *
 * Views:
 *   grouped (default) - one row per message fingerprint (count, last seen,
 *     distinct wallets). Clicking a message drills into its occurrences.
 *   list - flat newest-first reports; also the drill-down when a
 *     fingerprint filter is present.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { currentUser } from "@/lib/cms/authz"
import { fetchErrorReports, type ErrorReportRow } from "@/lib/error-reports"

export const dynamic = "force-dynamic"

const WINDOWS = [
  { key: "24h", label: "24h", hours: 24 },
  { key: "7d", label: "7d", hours: 24 * 7 },
  { key: "30d", label: "30d", hours: 24 * 30 },
  { key: "all", label: "All", hours: 0 },
] as const

const SOURCES = ["runtime-error", "unhandled-rejection", "user-report", "unknown"]

interface ErrorsSearchParams {
  view?: string
  search?: string
  source?: string
  window?: string
  fingerprint?: string
  page?: string
  sortBy?: string
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return "-"
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().replace("T", " ").slice(0, 19)
}

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "-"
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function ReportDetail({ report }: { report: ErrorReportRow }) {
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg bg-zinc-900/80 p-3 text-xs text-zinc-400">
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
        <span>wallet: <span className="text-zinc-200">{report.walletAddress || "-"}</span></span>
        <span>walletApp: {report.walletName || "-"} ({report.walletType || "-"})</span>
        <span>route: {report.route || "-"}</span>
        <span>browser: {report.browser || "-"} {report.browserVersion || ""}</span>
        <span>os: {report.os || "-"} / {report.deviceType || "-"}</span>
        <span>language: {report.language || "-"}</span>
        <span>received: {fmt(report.receivedAt)}</span>
        <span>reportId: {report.id}</span>
      </div>
      {report.userNote && (
        <div>
          <div className="text-zinc-500">user note</div>
          <div className="whitespace-pre-wrap text-zinc-300">{report.userNote}</div>
        </div>
      )}
      {report.rawError && (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 font-mono text-[11px] text-zinc-400">
          {report.rawError}
        </pre>
      )}
    </div>
  )
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<ErrorsSearchParams>
}) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("errors.view")) redirect("/admin")

  const params = await searchParams
  const view = params.view === "list" || params.fingerprint ? "list" : "grouped"
  const search = (params.search || "").trim()
  const source = SOURCES.includes(params.source || "") ? (params.source as string) : ""
  const windowKey = WINDOWS.some((w) => w.key === params.window) ? (params.window as string) : "7d"
  const sortBy = params.sortBy === "count" ? "count" : "lastSeen"
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1)

  const href = (overrides: Partial<ErrorsSearchParams>) => {
    const next: Record<string, string> = {
      ...(view !== "grouped" ? { view } : {}),
      ...(search ? { search } : {}),
      ...(source ? { source } : {}),
      ...(windowKey !== "7d" ? { window: windowKey } : {}),
      ...(params.fingerprint ? { fingerprint: params.fingerprint } : {}),
      ...(sortBy !== "lastSeen" ? { sortBy } : {}),
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === "") delete next[key]
      else next[key] = value
    }
    // View/filter changes reset pagination; explicit page overrides win.
    if (overrides.page) next.page = overrides.page
    const qs = new URLSearchParams(next).toString()
    return qs ? `/admin/errors?${qs}` : "/admin/errors"
  }

  const query: Record<string, string> = { view, page: String(page), limit: "25" }
  if (search) query.search = search
  if (source) query.source = source
  if (params.fingerprint) query.fingerprint = params.fingerprint
  if (view === "grouped") query.sortBy = sortBy
  const windowDef = WINDOWS.find((w) => w.key === windowKey)
  if (windowDef && windowDef.hours > 0) {
    query.since = new Date(Date.now() - windowDef.hours * 3_600_000).toISOString()
  }

  const result = await fetchErrorReports(query)

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">App errors</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Error reports from app.subfrost.io, grouped by root message. Proxied from the app backend.
      </p>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex gap-1 rounded-lg border border-zinc-800 p-1">
          <Link
            href={href({ view: undefined, fingerprint: undefined, page: undefined })}
            className={`rounded px-3 py-1 text-xs ${view === "grouped" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Grouped
          </Link>
          <Link
            href={href({ view: "list", fingerprint: undefined, page: undefined })}
            className={`rounded px-3 py-1 text-xs ${view === "list" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            All reports
          </Link>
        </div>
        <form action="/admin/errors" method="get" className="flex items-center gap-2">
          {view !== "grouped" && <input type="hidden" name="view" value={view} />}
          {windowKey !== "7d" && <input type="hidden" name="window" value={windowKey} />}
          <input
            name="search"
            defaultValue={search}
            placeholder="Search message / wallet / route"
            className="w-64 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
          />
          <select
            name="source"
            defaultValue={source}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-300"
          >
            <option value="">any source</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            Filter
          </button>
        </form>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <Link
              key={w.key}
              href={href({ window: w.key, page: undefined })}
              className={`rounded px-2.5 py-1 text-xs ${windowKey === w.key ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {w.label}
            </Link>
          ))}
        </div>
        {view === "grouped" && (
          <div className="flex gap-1 text-xs">
            <Link href={href({ sortBy: undefined, page: undefined })} className={sortBy === "lastSeen" ? "text-white" : "text-zinc-500 hover:text-zinc-300"}>
              by last seen
            </Link>
            <span className="text-zinc-700">/</span>
            <Link href={href({ sortBy: "count", page: undefined })} className={sortBy === "count" ? "text-white" : "text-zinc-500 hover:text-zinc-300"}>
              by count
            </Link>
          </div>
        )}
      </div>

      {params.fingerprint && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-xs text-zinc-400">
          Showing occurrences of fingerprint <span className="font-mono text-zinc-200">{params.fingerprint}</span>
          <Link href={href({ fingerprint: undefined, view: undefined, page: undefined })} className="text-zinc-300 underline hover:text-white">
            back to groups
          </Link>
        </div>
      )}

      {!result.configured ? (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          Not configured: set ERROR_REPORTS_SERVICE_TOKEN (and optionally ERROR_REPORTS_API_BASE) so this
          page can query the app backend. The same token must be set on the subfrost-app deployment.
        </div>
      ) : !result.ok ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          Failed to load reports: {result.error}
        </div>
      ) : view === "grouped" ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">Wallets</th>
                <th className="px-4 py-3">Source / Tag</th>
                <th className="px-4 py-3">Last route</th>
                <th className="px-4 py-3">First seen</th>
                <th className="px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {(result.groups || []).map((group) => (
                <tr key={group.fingerprint} className="border-t border-zinc-800 align-top">
                  <td className="max-w-md px-4 py-2.5 text-zinc-300">
                    <Link href={href({ view: "list", fingerprint: group.fingerprint, page: undefined })} className="hover:text-white hover:underline">
                      {truncate(group.sample?.message ?? group.fingerprint, 120)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-bold text-zinc-200">{group.count}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{group.distinctWallets}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">
                    {group.sample?.source || "-"}
                    {group.sample?.tag ? <span className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5">{group.sample.tag}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">{truncate(group.sample?.route, 40)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">{fmt(group.firstSeen)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">{fmt(group.lastSeen)}</td>
                </tr>
              ))}
              {(result.groups || []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-600">No error reports in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Message (expand for detail)</th>
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {(result.reports || []).map((report) => (
                <tr key={report.id} className="border-t border-zinc-800 align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">{fmt(report.receivedAt)}</td>
                  <td className="max-w-lg px-4 py-2.5 text-zinc-300">
                    <details>
                      <summary className="cursor-pointer hover:text-white">{truncate(report.message, 110)}</summary>
                      <ReportDetail report={report} />
                    </details>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">{truncate(report.walletAddress, 24)}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">{truncate(report.route, 36)}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">{report.source}</td>
                </tr>
              ))}
              {(result.reports || []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600">No error reports in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {result.configured && result.ok && (
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {result.pagination.total} {view === "grouped" ? "distinct errors" : "reports"}
          </span>
          <div className="flex items-center gap-3">
            {page > 1 ? (
              <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:bg-zinc-900">
                Prev
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-900 px-3 py-1.5 opacity-40">Prev</span>
            )}
            <span>page {result.pagination.page} / {Math.max(1, result.pagination.totalPages)}</span>
            {page < result.pagination.totalPages ? (
              <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:bg-zinc-900">
                Next
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-900 px-3 py-1.5 opacity-40">Next</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
