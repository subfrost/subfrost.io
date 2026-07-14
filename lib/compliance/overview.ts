// Data assembly for the master compliance dashboard (/admin/compliance).
// Read-only aggregation over the obligation calendar, BSA program pillars, KYC,
// FinCEN, MTL, e-sign, reviewer-link and audit stores, plus a computed
// "needs attention" list and an overall readiness score. Reached only from the
// aml.read-gated page — no mutations here.

import prisma from "@/lib/prisma"
import { mtlStatusCounts } from "@/lib/mtl/schema"
import { listObligations, type ObligationRow } from "./obligations"
import { listProgramItems, type ProgramItemRow } from "./program-store"
import {
  obligationHealth, dueState, daysUntil, CATEGORY_LABELS,
  type ObligationHealth,
} from "./obligations-schema"

const DAY_MS = 86_400_000
const OFAC_STALE_DAYS = 30
const KYC_STALE_DAYS = 7

export interface AttentionItem {
  severity: "red" | "amber"
  text: string
  href: string
}

export interface ComplianceOverview {
  readiness: {
    score: number // 0–100 blended obligation + program readiness
    obligationScore: number
    programScore: number
    openItems: number // overdue + blocked + program gaps
  }
  obligations: {
    rows: ObligationRow[]
    health: ObligationHealth
    byCategory: { category: string; label: string; total: number; open: number }[]
    upcoming: { id: string; title: string; dueDate: string | null; days: number | null; state: string; category: string }[]
    seeded: boolean
  }
  program: {
    items: ProgramItemRow[]
    ok: number
    partial: number
    gap: number
    seeded: boolean
  }
  kyc: {
    total: number
    pending: number
    inReview: number
    approved: number
    rejected: number
    oldestOpenDays: number | null
  }
  ofac: { lastRunAt: string | null; daysSince: number | null }
  fincen: {
    form107Drafted: boolean
    form107UpdatedAt: string | null
    sarDrafts: number
    ctrDrafts: number
    queued: number
    accepted: number
    rejected: number
  }
  mtl: {
    seeded: boolean
    total: number
    counts: Record<string, number>
    dueSoon: { state: string; name: string; due: string; overdue: boolean }[]
  }
  esign: { total: number; completed: number; awaiting: number; draft: number }
  reviews: { active: number; total: number; sessions: number }
  recentAudit: { action: string; target: string | null; at: string; actor: string | null }[]
  attention: AttentionItem[]
}

const COMPLIANCE_AUDIT_ACTIONS = [
  "kyc_disposition", "ofac_rescreen", "kyc_identity_sync",
  "save_form107", "create_fincen_draft", "update_fincen_draft", "queue_fincen_submission",
  "seed_mtl", "update_mtl",
  "review_link_create", "review_link_revoke", "review_login", "review_logout",
  "seed_obligations", "create_obligation", "update_obligation", "delete_obligation", "complete_obligation",
  "seed_program", "update_program_item",
]

export async function complianceOverview(): Promise<ComplianceOverview> {
  const now = Date.now()

  const [
    obligationRows, programItems,
    kycByStatus, oldestOpen, ofacRun,
    form107, sarDrafts, ctrDrafts, subsByStatus,
    mtlEntries, envByStatus, reviewLinks, sessions, auditRows,
  ] = await Promise.all([
    listObligations(),
    listProgramItems(),
    prisma.kycIntake.groupBy({ by: ["status"], _count: true }),
    prisma.kycIntake.findFirst({
      where: { status: { in: ["PENDING", "IN_REVIEW"] } },
      orderBy: { submittedAt: "asc" },
      select: { submittedAt: true },
    }),
    prisma.auditLog.findFirst({ where: { action: "ofac_rescreen" }, orderBy: { createdAt: "desc" } }),
    prisma.fincenDraft.findFirst({ where: { type: "FORM107" }, select: { updatedAt: true } }),
    prisma.fincenDraft.count({ where: { type: "SAR" } }),
    prisma.fincenDraft.count({ where: { type: "CTR" } }),
    prisma.fincenSubmission.groupBy({ by: ["status"], _count: true }),
    prisma.mtlEntry.findMany({ select: { state: true, name: true, status: true, nextFilingDue: true } }),
    prisma.envelope.groupBy({ by: ["status"], _count: true }),
    prisma.reviewLink.findMany({ select: { expiresAt: true, revokedAt: true } }),
    prisma.reviewSession.count(),
    prisma.auditLog.findMany({
      where: { action: { in: COMPLIANCE_AUDIT_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { actor: { select: { email: true } } },
    }),
  ])

  // ---- Obligations ----
  const health = obligationHealth(obligationRows, now)
  const catMap = new Map<string, { total: number; open: number }>()
  for (const r of obligationRows) {
    const c = catMap.get(r.category) ?? { total: 0, open: 0 }
    c.total++
    const st = dueState(r.dueDate, r.status, now)
    if (st === "overdue" || r.status === "BLOCKED") c.open++
    catMap.set(r.category, c)
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, label: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category, ...v }))
    .sort((a, b) => b.open - a.open || b.total - a.total)
  const upcoming = obligationRows
    .map((r) => ({ r, state: dueState(r.dueDate, r.status, now), days: daysUntil(r.dueDate, now) }))
    .filter(({ state }) => state === "overdue" || state === "due-soon")
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9))
    .slice(0, 8)
    .map(({ r, state, days }) => ({ id: r.id, title: r.title, dueDate: r.dueDate, days, state, category: r.category }))

  // ---- Program ----
  const program = {
    items: programItems,
    ok: programItems.filter((p) => p.status === "OK").length,
    partial: programItems.filter((p) => p.status === "PARTIAL").length,
    gap: programItems.filter((p) => p.status === "GAP").length,
    seeded: programItems.length > 0,
  }

  // ---- KYC / OFAC ----
  const kycCount = (s: string) => kycByStatus.find((r) => r.status === s)?._count ?? 0
  const kyc = {
    total: kycByStatus.reduce((n, r) => n + r._count, 0),
    pending: kycCount("PENDING"),
    inReview: kycCount("IN_REVIEW"),
    approved: kycCount("APPROVED"),
    rejected: kycCount("REJECTED"),
    oldestOpenDays: oldestOpen ? Math.floor((now - oldestOpen.submittedAt.getTime()) / DAY_MS) : null,
  }
  const ofac = {
    lastRunAt: ofacRun?.createdAt.toISOString() ?? null,
    daysSince: ofacRun ? Math.floor((now - ofacRun.createdAt.getTime()) / DAY_MS) : null,
  }

  // ---- FinCEN ----
  const subCount = (s: string) => subsByStatus.find((r) => r.status === s)?._count ?? 0
  const fincen = {
    form107Drafted: form107 != null,
    form107UpdatedAt: form107?.updatedAt.toISOString() ?? null,
    sarDrafts,
    ctrDrafts,
    queued: subCount("QUEUED"),
    accepted: subCount("ACCEPTED"),
    rejected: subCount("REJECTED"),
  }

  // ---- MTL ----
  const dueSoon = mtlEntries
    .filter((e) => e.nextFilingDue)
    .map((e) => {
      const due = new Date(e.nextFilingDue as string).getTime()
      return { state: e.state, name: e.name, due: e.nextFilingDue as string, dueMs: due, overdue: due < now }
    })
    .filter((e) => e.overdue || e.dueMs - now < 60 * DAY_MS)
    .sort((a, b) => a.dueMs - b.dueMs)
    .map(({ state, name, due, overdue }) => ({ state, name, due, overdue }))
  const mtl = { seeded: mtlEntries.length > 0, total: mtlEntries.length, counts: mtlStatusCounts(mtlEntries), dueSoon }

  // ---- E-sign / reviews / audit ----
  const envCount = (s: string) => envByStatus.find((r) => r.status === s)?._count ?? 0
  const esignTotal = envByStatus.reduce((n, r) => n + r._count, 0)
  const esign = {
    total: esignTotal,
    completed: envCount("completed"),
    draft: envCount("draft"),
    awaiting: esignTotal - envCount("completed") - envCount("draft") - envCount("voided"),
  }
  const reviews = {
    active: reviewLinks.filter((l) => !l.revokedAt && l.expiresAt.getTime() > now).length,
    total: reviewLinks.length,
    sessions,
  }
  const recentAudit = auditRows.map((r) => ({
    action: r.action, target: r.target, at: r.createdAt.toISOString(), actor: r.actor?.email ?? null,
  }))

  // ---- Readiness (blended) ----
  const programScore = program.seeded
    ? Math.round(((program.ok + program.partial * 0.5) / program.items.length) * 100)
    : 0
  const obligationScore = health.score
  const score = Math.round(obligationScore * 0.6 + programScore * 0.4)
  const readiness = {
    score, obligationScore, programScore,
    openItems: health.overdue + health.blocked + program.gap,
  }

  // ---- Attention list ----
  const attention: AttentionItem[] = []
  if (obligationRows.length === 0) {
    attention.push({ severity: "amber", text: "The obligation calendar is empty — seed it to load the company's tax, corporate, AML, and licensing deadlines.", href: "/admin/compliance/obligations" })
  }
  for (const u of upcoming) {
    if (u.state === "overdue") {
      attention.push({ severity: "red", text: `${u.title} is OVERDUE${u.days != null ? ` by ${Math.abs(u.days)}d` : ""}.`, href: "/admin/compliance/obligations" })
    }
  }
  for (const r of obligationRows) {
    if (r.status === "BLOCKED") {
      attention.push({ severity: "red", text: `Blocked: ${r.title}${r.notes ? ` — ${r.notes}` : ""}`, href: "/admin/compliance/obligations" })
    }
  }
  for (const u of upcoming) {
    if (u.state === "due-soon") {
      attention.push({ severity: "amber", text: `${u.title} due in ${u.days}d (${u.dueDate}).`, href: "/admin/compliance/obligations" })
    }
  }
  for (const p of program.items) {
    if (p.status === "GAP") {
      attention.push({ severity: "amber", text: `AML program gap: ${p.title}${p.action ? ` — ${p.action}` : ""}`, href: "/admin/compliance" })
    }
  }
  if (!mtl.seeded) {
    attention.push({ severity: "amber", text: "MTL tracker is empty — seed the 51 jurisdictions to track license status.", href: "/admin/mtl" })
  }
  for (const d of mtl.dueSoon) {
    attention.push({
      severity: d.overdue ? "red" : "amber",
      text: d.overdue ? `${d.name} MTL filing is OVERDUE (was due ${d.due}).` : `${d.name} MTL filing due ${d.due}.`,
      href: "/admin/mtl",
    })
  }
  const openKyc = kyc.pending + kyc.inReview
  if (openKyc > 0 && (kyc.oldestOpenDays ?? 0) > KYC_STALE_DAYS) {
    attention.push({ severity: "amber", text: `${openKyc} KYC intake${openKyc === 1 ? "" : "s"} awaiting disposition — oldest has waited ${kyc.oldestOpenDays} days.`, href: "/admin/kyc" })
  }
  if (kyc.total > 0 && (ofac.daysSince == null || ofac.daysSince > OFAC_STALE_DAYS)) {
    attention.push({
      severity: "amber",
      text: ofac.daysSince == null ? "No OFAC rescreen has ever been run against the KYC base." : `Last OFAC rescreen was ${ofac.daysSince} days ago (target: every ${OFAC_STALE_DAYS}).`,
      href: "/admin/kyc",
    })
  }
  if (fincen.queued > 0) {
    attention.push({ severity: "red", text: `${fincen.queued} FinCEN submission${fincen.queued === 1 ? "" : "s"} queued LOCALLY — BSA E-Filing transport is not live, so nothing has actually reached FinCEN.`, href: "/admin/fincen" })
  }

  return {
    readiness,
    obligations: { rows: obligationRows, health, byCategory, upcoming, seeded: obligationRows.length > 0 },
    program, kyc, ofac, fincen, mtl, esign, reviews, recentAudit, attention,
  }
}
