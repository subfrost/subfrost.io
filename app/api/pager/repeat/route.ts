/**
 * Repeat-until-ack tick — hit every minute by the ntfy-pager-repeat CronJob
 * (k8s/ntfy/repeat-cronjob.yaml). Gated by the shared x-admin-secret like the
 * other machine-to-machine admin endpoints (/api/admin/users, /api/admin/keys).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdminSecret } from "@/lib/api/service-key"
import { repeatUnacked } from "@/lib/pager/send"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  // 7-24 audit: constant-time compare via the shared guard (was a plain `!==`).
  const denied = requireAdminSecret(request)
  if (denied) return denied
  return NextResponse.json(await repeatUnacked())
}
