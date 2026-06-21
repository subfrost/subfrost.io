import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

// Append-only audit trail. Writes are best-effort: an audit failure must never
// break the underlying action, so callers fire-and-forget or await defensively.

export type AuditAction =
  | "login"
  | "login_2fa"
  | "login_failed"
  | "logout"
  | "create_user"
  | "update_user"
  | "delete_user"
  | "change_password"
  | "reset_password"
  | "invite_user"
  | "revoke_session"
  | "key_mint"
  | "key_revoke"
  | "totp_enabled"
  | "totp_disabled"
  | "create_code"
  | "update_code"
  | "delete_code"
  | "upsert_fuel"
  | "delete_fuel"
  | "kyc_disposition"
  | "save_form107"
  | "create_fincen_draft"
  | "update_fincen_draft"
  | "queue_fincen_submission"
  | "seed_mtl"
  | "update_mtl"
  | "ofac_rescreen"
  | "stripe_application_update"
  | "stripe_subscription_action"
  | "stripe_promo_create"
  | "stripe_money_queue"
  | "stripe_money_confirm"
  | "stripe_money_cancel"
  | "stripe_card_control"
  | "stripe_dispute_evidence"

export async function audit(
  action: AuditAction,
  opts: {
    actorId?: string | null
    target?: string | null
    details?: Prisma.InputJsonValue
    ip?: string | null
  } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        actorId: opts.actorId ?? null,
        target: opts.target ?? null,
        details: opts.details ?? undefined,
        ip: opts.ip ?? null,
      },
    })
  } catch (e) {
    console.error("[audit] failed to write", action, e)
  }
}

export interface AuditEntry {
  id: string
  action: string
  actorEmail: string | null
  target: string | null
  details: unknown
  ip: string | null
  createdAt: Date
}

export async function listAudit(limit = 100, cursor?: string): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { email: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorEmail: r.actor?.email ?? null,
    target: r.target,
    details: r.details,
    ip: r.ip,
    createdAt: r.createdAt,
  }))
}
