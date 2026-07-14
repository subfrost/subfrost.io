import { cookies } from "next/headers"
import {
  resolveReviewSession,
  recordReviewPageView,
  scopeSurfaces,
  scopeAllows,
  SCOPE_LABELS,
  REVIEW_COOKIE,
} from "@/lib/compliance/reviews"
import { getForm107, listSar, listCtr, listSubmissions } from "@/lib/fincen/admin"
import { listIntakes } from "@/lib/kyc/admin"
import { listEntries } from "@/lib/mtl/admin"
import { envelopes } from "@/lib/esign/store"
import { ENVELOPE_STATUS_LABELS } from "@/lib/esign/document-ui"
import { listObligations } from "@/lib/compliance/obligations"
import { listProgramItems } from "@/lib/compliance/program-store"
import {
  dueState, daysUntil, CATEGORY_LABELS, STATUS_LABELS,
  type ObligationCategory, type ObligationStatus,
} from "@/lib/compliance/obligations-schema"
import type { PillarStatus } from "@/lib/compliance/program"
import { ReviewLogin } from "@/components/cms/compliance/ReviewLogin"
import { ReviewLogout } from "@/components/cms/compliance/ReviewLogout"

export const dynamic = "force-dynamic"

export default async function ReviewPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const jar = await cookies()
  const ctx = await resolveReviewSession(jar.get(REVIEW_COOKIE)?.value)

  // A valid session must belong to the link in the URL — otherwise treat as
  // unauthenticated (someone following a different link while signed in).
  if (!ctx || ctx.token !== token) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4">
        <ReviewLogin token={token} />
      </main>
    )
  }

  await recordReviewPageView(ctx.sessionId, "dashboard")
  const surfaces = scopeSurfaces(ctx.scope)

  const [program, obligations, form107, sars, ctrs, submissions, intakes, mtl, envs] = await Promise.all([
    scopeAllows(ctx.scope, "program") ? listProgramItems() : Promise.resolve([]),
    scopeAllows(ctx.scope, "obligations") ? listObligations() : Promise.resolve([]),
    scopeAllows(ctx.scope, "fincen") ? getForm107() : Promise.resolve(null),
    scopeAllows(ctx.scope, "fincen") ? listSar() : Promise.resolve([]),
    scopeAllows(ctx.scope, "fincen") ? listCtr() : Promise.resolve([]),
    scopeAllows(ctx.scope, "fincen") ? listSubmissions() : Promise.resolve([]),
    scopeAllows(ctx.scope, "kyc") ? listIntakes() : Promise.resolve([]),
    scopeAllows(ctx.scope, "mtl") ? listEntries() : Promise.resolve([]),
    scopeAllows(ctx.scope, "documents") ? envelopes.list() : Promise.resolve([]),
  ])
  const nowMs = Date.now()

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-zinc-950 px-4 py-8 text-zinc-200">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-sky-400">SUBFROST · Compliance review</div>
          <h1 className="mt-1 text-2xl font-bold text-white">{ctx.reviewerLabel}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Read-only access · {SCOPE_LABELS[ctx.scope]}
          </p>
        </div>
        <ReviewLogout />
      </header>

      <p className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-500">
        This is a read-only reviewer view. You can see {surfaces.map((s) => s.label).join(", ")}. All
        access is logged. Contact your SUBFROST point of contact with questions.
      </p>

      {scopeAllows(ctx.scope, "program") && program.length > 0 && (
        <Section title="AML/BSA program status">
          <div className="space-y-2">
            {program.map((p) => (
              <div key={p.key} className="border-b border-zinc-900 pb-2 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-200">{p.title}</span>
                  <PillarBadge status={p.status} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{p.detail}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {scopeAllows(ctx.scope, "obligations") && obligations.length > 0 && (
        <Section title={`Obligation calendar (${obligations.length})`}>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1">Obligation</th><th>Category</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              {obligations.map((r) => {
                const st = dueState(r.dueDate, r.status as ObligationStatus, nowMs)
                const days = daysUntil(r.dueDate, nowMs)
                return (
                  <tr key={r.id} className="border-t border-zinc-900">
                    <td className="py-1.5 text-zinc-200">{r.title}</td>
                    <td className="text-xs text-zinc-400">{CATEGORY_LABELS[r.category as ObligationCategory] ?? r.category}</td>
                    <td className="text-xs text-zinc-400">{STATUS_LABELS[r.status as ObligationStatus] ?? r.status}</td>
                    <td className={`text-xs ${st === "overdue" ? "text-red-400" : st === "due-soon" ? "text-amber-400" : "text-zinc-400"}`}>
                      {r.dueDate ?? "—"}{days != null && st === "overdue" ? ` (${Math.abs(days)}d over)` : ""}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      )}

      {scopeAllows(ctx.scope, "fincen") && (
        <Section title="FinCEN filings">
          <KV label="Form 107 (MSB registration)" value={form107 ? `drafted — updated ${form107.updatedAt.slice(0, 10)}` : "no draft yet"} />
          <KV label="SAR drafts" value={String(sars.length)} />
          <KV label="CTR drafts" value={String(ctrs.length)} />
          <KV label="Queued submissions" value={String(submissions.length)} />
          {submissions.length > 0 && (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1">Type</th><th>Tracking</th><th>Status</th><th>Submitted</th></tr></thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-t border-zinc-900">
                    <td className="py-1.5">{s.type}</td>
                    <td className="font-mono text-xs text-zinc-400">{s.trackingId}</td>
                    <td>{s.status}</td>
                    <td className="text-zinc-400">{s.submittedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {scopeAllows(ctx.scope, "kyc") && (
        <Section title={`KYC queue (${intakes.length})`}>
          {intakes.length === 0 ? <Empty>No intakes.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1">Customer</th><th>Risk</th><th>Status</th><th>Submitted</th></tr></thead>
              <tbody>
                {intakes.map((i) => (
                  <tr key={i.id} className="border-t border-zinc-900">
                    <td className="py-1.5 text-zinc-200">{i.customerName}</td>
                    <td>{i.riskScore}</td>
                    <td>{i.status}</td>
                    <td className="text-zinc-400">{new Date(i.submittedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {scopeAllows(ctx.scope, "mtl") && (
        <Section title={`MTL licensing (${mtl.length})`}>
          <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
            {mtl.map((m) => (
              <div key={m.state} className="rounded border border-zinc-900 px-2 py-1">
                <span className="font-mono text-zinc-300">{m.state}</span>
                <span className="ml-2 text-xs text-zinc-500">{m.status}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {scopeAllows(ctx.scope, "documents") && (
        <Section title={`Documents (${envs.length})`}>
          {envs.length === 0 ? <Empty>No documents.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1">Subject</th><th>Kind</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {envs.map((e) => (
                  <tr key={e.id} className="border-t border-zinc-900">
                    <td className="py-1.5 text-zinc-200">{e.subject}</td>
                    <td className="text-xs text-zinc-400">{e.kind}</td>
                    <td>{ENVELOPE_STATUS_LABELS[e.status]}</td>
                    <td className="text-zinc-400">{e.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 py-1 text-sm last:border-0">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>
}
function PillarBadge({ status }: { status: PillarStatus }) {
  const map: Record<PillarStatus, { label: string; cls: string }> = {
    OK: { label: "In place", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    PARTIAL: { label: "Partial", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    GAP: { label: "Gap", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
  }
  const b = map[status]
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.label}</span>
}
