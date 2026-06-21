/**
 * Admin-only KYC review operations. Reached only through `actions/cms/kyc.ts`,
 * which gates on `MANAGE_AML`. Intakes originate from an external provider
 * (Stripe Identity / Persona / Sumsub) once that source is wired; until then
 * the queue reads whatever rows exist. Dispositions are append-only so the
 * full review history is preserved for audit.
 */
import prisma from "@/lib/prisma"

export class KycError extends Error {}

export type KycDecision = "APPROVE" | "REJECT" | "REVIEW"

const STATUS_BY_DECISION: Record<KycDecision, "APPROVED" | "REJECTED" | "IN_REVIEW"> = {
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  REVIEW: "IN_REVIEW",
}

export interface DispositionRow {
  id: string
  decision: KycDecision
  notes: string | null
  by: string
  at: string
}

export interface KycIntakeRow {
  id: string
  externalId: string | null
  customerEmail: string
  customerName: string
  provider: string
  riskScore: string
  status: string
  submittedAt: string
  latestDecision: KycDecision | null
  dispositions: DispositionRow[]
}

export async function listIntakes(): Promise<KycIntakeRow[]> {
  const rows = await prisma.kycIntake.findMany({
    orderBy: { submittedAt: "desc" },
    include: { dispositions: { orderBy: { at: "desc" } } },
  })
  return rows.map((r) => {
    const dispositions: DispositionRow[] = r.dispositions.map((d) => ({
      id: d.id,
      decision: d.decision as KycDecision,
      notes: d.notes,
      by: d.by,
      at: d.at.toISOString(),
    }))
    return {
      id: r.id,
      externalId: r.externalId,
      customerEmail: r.customerEmail,
      customerName: r.customerName,
      provider: r.provider,
      riskScore: r.riskScore,
      status: r.status,
      submittedAt: r.submittedAt.toISOString(),
      latestDecision: dispositions[0]?.decision ?? null,
      dispositions,
    }
  })
}

export async function recordDisposition(
  intakeId: string,
  decision: KycDecision,
  notes: string | null,
  by: string,
): Promise<{ customerName: string }> {
  if (!Object.prototype.hasOwnProperty.call(STATUS_BY_DECISION, decision)) {
    throw new KycError(`Invalid decision: ${decision}`)
  }
  const intake = await prisma.kycIntake.findUnique({ where: { id: intakeId } })
  if (!intake) throw new KycError("Intake not found")
  const cleanNotes = notes?.trim() || null
  await prisma.$transaction([
    prisma.kycDisposition.create({ data: { intakeId, decision, notes: cleanNotes, by } }),
    prisma.kycIntake.update({ where: { id: intakeId }, data: { status: STATUS_BY_DECISION[decision] } }),
  ])
  return { customerName: intake.customerName }
}
