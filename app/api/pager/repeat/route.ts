/**
 * Repeat-until-ack tick — hit every minute by the ntfy-pager-repeat CronJob
 * (k8s/ntfy/repeat-cronjob.yaml). Gated by the shared x-admin-secret like the
 * other machine-to-machine admin endpoints (/api/admin/users, /api/admin/keys).
 */
import { NextRequest, NextResponse } from "next/server"
import { repeatUnacked } from "@/lib/pager/send"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 503 })
  if (request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json(await repeatUnacked())
}
