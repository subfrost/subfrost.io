import Link from "next/link"
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { complianceOverview, type AttentionItem } from "@/lib/compliance/overview"
import { getRegister } from "@/lib/compliance/register"
import { MTL_STATUS_LABELS, type MtlStatusValue } from "@/lib/mtl/schema"
import { CATEGORY_LABELS, type ObligationCategory } from "@/lib/compliance/obligations-schema"
import { ProgramManager } from "@/components/cms/compliance/ProgramManager"
import { RegisterManager } from "@/components/cms/compliance/RegisterManager"

export const dynamic = "force-dynamic"

const AUDIT_LABELS: Record<string, string> = {
  kyc_disposition: "KYC decision recorded",
  ofac_rescreen: "OFAC rescreen run",
  kyc_identity_sync: "KYC provider sync",
  save_form107: "Form 107 saved",
  create_fincen_draft: "FinCEN draft created",
  update_fincen_draft: "FinCEN draft updated",
  queue_fincen_submission: "FinCEN submission queued",
  seed_mtl: "MTL jurisdictions seeded",
  update_mtl: "MTL entry updated",
  review_link_create: "Reviewer link minted",
  review_link_revoke: "Reviewer link revoked",
  review_login: "External reviewer signed in",
  review_logout: "External reviewer signed out",
  seed_obligations: "Obligation calendar seeded",
  create_obligation: "Obligation added",
  update_obligation: "Obligation updated",
  delete_obligation: "Obligation deleted",
  complete_obligation: "Obligation marked done",
  seed_program: "Program pillars seeded",
  update_program_item: "Program pillar updated",
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-400"
  if (score >= 60) return "text-amber-400"
  return "text-red-400"
}
function scoreRing(score: number): string {
  if (score >= 85) return "border-emerald-500/40"
  if (score >= 60) return "border-amber-500/40"
  return "border-red-500/40"
}

export default async function CompliancePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("aml.read")) redirect("/admin")
  const canEdit = me.privileges.includes("aml.edit")

  const [o, register] = await Promise.all([complianceOverview(), getRegister()])
  const entityName = register.entityName.trim() || "the company"

  return (
    <div className="max-w-5xl">
      <h1 className="mb-2 text-2xl font-bold text-white">Compliance</h1>
      <p className="mb-6 max-w-3xl text-sm text-zinc-500">
        The master view of {entityName}&apos;s regulatory program. It reads top-down: an overall
        readiness score, what needs attention right now, the company&apos;s obligation calendar, the
        five things a registered money services business must maintain, then each working tool with a
        plain-English description and live numbers. Links marked &ldquo;Open&rdquo; go to where the
        work happens.
      </p>

      {/* ---- Readiness header ---- */}
      <section className="mb-8 grid gap-3 sm:grid-cols-4">
        <div className={`flex flex-col items-center justify-center rounded-xl border bg-zinc-900/40 p-4 ${scoreRing(o.readiness.score)}`}>
          <div className={`text-4xl font-bold ${scoreColor(o.readiness.score)}`}>{o.readiness.score}</div>
          <div className="mt-1 text-xs text-zinc-500">Readiness score</div>
        </div>
        <HeaderStat label="Open items" value={o.readiness.openItems} sub="overdue + blocked + program gaps" warn={o.readiness.openItems > 0} />
        <HeaderStat label="Obligations on-track" value={`${o.obligations.health.settled + o.obligations.health.inProgress}/${o.obligations.health.tracked}`} sub={`${o.obligations.health.overdue} overdue · ${o.obligations.health.dueSoon} due soon`} warn={o.obligations.health.overdue > 0} />
        <HeaderStat label="AML program" value={`${o.program.ok}/${o.program.items.length || 5}`} sub={`${o.program.gap} gap · ${o.program.partial} partial`} warn={o.program.gap > 0} />
      </section>

      {/* ---- Needs attention ---- */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Needs attention</h2>
        {o.attention.length === 0 ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-400">
            Nothing is overdue, blocked, or stale. New items appear here automatically as obligations
            come due, program gaps open, KYC reviews age, or FinCEN submissions queue.
          </p>
        ) : (
          <ul className="space-y-2">
            {o.attention.map((a, i) => <AttentionRow key={i} item={a} />)}
          </ul>
        )}
      </section>

      {/* ---- Obligation calendar ---- */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Obligation calendar</h2>
          <Link href="/admin/compliance/obligations" className="text-xs text-sky-400 hover:text-sky-300">Open calendar →</Link>
        </div>
        {!o.obligations.seeded ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">
            The obligation calendar hasn&apos;t been seeded yet.{" "}
            <Link href="/admin/compliance/obligations" className="underline">Open the calendar</Link> and seed the
            company&apos;s tax, corporate, AML, licensing, and securities obligations.
          </div>
        ) : (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {o.obligations.byCategory.map((c) => (
                <Link key={c.category} href="/admin/compliance/obligations" className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 transition-colors hover:border-zinc-700">
                  <div className="text-xs text-zinc-500">{CATEGORY_LABELS[c.category as ObligationCategory] ?? c.label}</div>
                  <div className="mt-0.5 text-sm text-zinc-200">
                    {c.total} tracked{c.open > 0 && <span className="ml-1.5 text-red-400">· {c.open} open</span>}
                  </div>
                </Link>
              ))}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Next up</h3>
              {o.obligations.upcoming.length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing due in the next 30 days.</p>
              ) : (
                <ul className="divide-y divide-zinc-900">
                  {o.obligations.upcoming.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="text-zinc-200">{u.title}</span>
                      <span className={`shrink-0 text-xs ${u.state === "overdue" ? "text-red-400" : "text-amber-400"}`}>
                        {u.days != null && u.days < 0 ? `${Math.abs(u.days)}d overdue` : u.days === 0 ? "today" : `in ${u.days}d`}
                        {u.dueDate ? ` · ${u.dueDate}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---- Register (editable identity facts) ---- */}
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">Registration</h2>
        <p className="mb-3 text-xs text-zinc-600">
          The company&apos;s identity and MSB registration facts. Stored in the database and editable
          here — the confidential values live only in this authenticated app, never in the codebase.
        </p>
        <RegisterManager canEdit={canEdit} />
      </section>

      {/* ---- Program pillars (editable) ---- */}
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">AML/BSA program status</h2>
        <p className="mb-3 text-xs text-zinc-600">
          The Bank Secrecy Act requires a registered MSB to maintain all five of these. Edit a pillar
          as its status changes — no code deploy needed.
        </p>
        <ProgramManager canEdit={canEdit} />
      </section>

      {/* ---- Working areas ---- */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Working tools</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <AreaCard
            title="KYC review"
            href="/admin/kyc"
            what="Every customer who verifies identity (for SUBFROST Pay and other regulated features) lands here as an intake. Each gets a decision — approve, reject, or hold — kept forever as append-only history."
            stats={[
              { label: "Total intakes", value: o.kyc.total },
              { label: "Awaiting decision", value: o.kyc.pending + o.kyc.inReview, warn: o.kyc.pending + o.kyc.inReview > 0 },
              { label: "Approved", value: o.kyc.approved },
              { label: "Rejected", value: o.kyc.rejected },
            ]}
            foot={o.ofac.lastRunAt ? `Last OFAC rescreen: ${o.ofac.lastRunAt.slice(0, 10)} (${o.ofac.daysSince}d ago).` : "OFAC rescreen has never been run."}
          />
          <AreaCard
            title="FinCEN filings"
            href="/admin/fincen"
            what="Drafting desk for the three federal MSB reports: Form 107 (registration, renewed every two years), SARs (suspicious activity), and CTRs (cash over $10k). Drafts are validated, then queued."
            stats={[
              { label: "Form 107", value: o.fincen.form107Drafted ? "drafted" : "none", warn: !o.fincen.form107Drafted },
              { label: "SAR drafts", value: o.fincen.sarDrafts },
              { label: "CTR drafts", value: o.fincen.ctrDrafts },
              { label: "Queued locally", value: o.fincen.queued, warn: o.fincen.queued > 0 },
            ]}
            foot="The live BSA E-Filing connection is not mounted — queued items have NOT reached FinCEN. Real filings go through the BSA E-Filing site by hand for now."
          />
          <AreaCard
            title="MTL licensing"
            href="/admin/mtl"
            what="One row per US state + DC tracking whether we can transmit money there: agent of Stripe, licensed, filing pending, exempt, or needs a filing. Deadlines here surface in the attention list."
            stats={
              o.mtl.seeded
                ? (Object.entries(o.mtl.counts) as [MtlStatusValue, number][]).filter(([, n]) => n > 0).map(([s, n]) => ({ label: MTL_STATUS_LABELS[s] ?? s, value: n }))
                : [{ label: "Jurisdictions", value: "not seeded", warn: true }]
            }
            foot={o.mtl.dueSoon.length > 0 ? `${o.mtl.dueSoon.length} filing(s) due within 60 days.` : "No filings due within 60 days."}
          />
          <AreaCard
            title="E-Sign documents"
            href="/admin/documents"
            what="Where compliance paperwork gets executed: board consents, the AML program adoption, engagement letters, contractor agreements. Send a PDF, track signatures, store the completed doc against the person."
            stats={[
              { label: "Envelopes", value: o.esign.total },
              { label: "Awaiting signature", value: o.esign.awaiting, warn: o.esign.awaiting > 0 },
              { label: "Completed", value: o.esign.completed },
              { label: "Drafts", value: o.esign.draft },
            ]}
          />
          <AreaCard
            title="Reviewer links (external sharing)"
            href="/admin/compliance/reviews"
            what="How auditors, examiners, and the independent AML reviewer see our compliance state without an account. Mint a scoped link (everything, FinCEN only, or KYC only) with a one-time password and expiry; revoke anytime. Every page they view is logged."
            stats={[
              { label: "Active links", value: o.reviews.active },
              { label: "Ever minted", value: o.reviews.total },
              { label: "Reviewer sessions", value: o.reviews.sessions },
            ]}
            foot="Flow: mint link → send URL and password over separate channels → reviewer signs in read-only → revoke when done."
          />
          <AreaCard
            title="Audit log"
            href="/admin/audit"
            what="The append-only record of who did what: every KYC decision, OFAC rescreen, FinCEN draft, MTL update, obligation change, and reviewer-link event, with operator and IP. The evidence trail an examiner asks for."
            stats={[{ label: "Recent compliance events", value: o.recentAudit.length }]}
          />
        </div>
      </section>

      {/* ---- Recent activity ---- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Recent compliance activity</h2>
        {o.recentAudit.length === 0 ? (
          <p className="text-sm text-zinc-500">No compliance actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">What</th>
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {o.recentAudit.map((r, i) => (
                  <tr key={i} className="border-t border-zinc-900">
                    <td className="whitespace-nowrap px-4 py-2 text-zinc-400">{r.at.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-4 py-2 text-zinc-200">{AUDIT_LABELS[r.action] ?? r.action}</td>
                    <td className="px-4 py-2 text-zinc-400">{r.target ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-400">{r.actor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function HeaderStat({ label, value, sub, warn }: { label: string; value: string | number; sub: string; warn?: boolean }) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className={`text-2xl font-bold ${warn ? "text-amber-400" : "text-zinc-100"}`}>{value}</div>
      <div className="mt-1 text-xs text-zinc-400">{label}</div>
      <div className="mt-0.5 text-[11px] text-zinc-600">{sub}</div>
    </div>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const cls = item.severity === "red"
    ? "border-red-500/30 bg-red-500/5 text-red-300"
    : "border-amber-500/30 bg-amber-500/5 text-amber-300"
  return (
    <li>
      <Link href={item.href} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition-colors hover:brightness-125 ${cls}`}>
        <span>{item.text}</span>
        <span className="shrink-0 text-xs opacity-70">Open →</span>
      </Link>
    </li>
  )
}

function AreaCard({
  title, href, what, stats, foot,
}: {
  title: string
  href: string
  what: string
  stats: { label: string; value: string | number; warn?: boolean }[]
  foot?: string
}) {
  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <Link href={href} className="text-xs text-sky-400 hover:text-sky-300">Open →</Link>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-zinc-400">{what}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-lg border px-2.5 py-1.5 text-xs ${s.warn ? "border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-300"}`}>
            <span className="mr-1.5 font-semibold">{s.value}</span>
            <span className="text-zinc-500">{s.label}</span>
          </div>
        ))}
      </div>
      {foot && <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{foot}</p>}
    </div>
  )
}
