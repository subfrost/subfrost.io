/**
 * POST /api/v1/pay/usage — SUBFROST Pay usage-event ingest.
 *
 * The mobile-api backend ("subvh") mirrors every Pay audit event here so
 * operators can track Pay usage from /admin/pay-usage. Server-to-server
 * auth: shared `x-api-key` (PAY_API_KEY), the same convention the FUEL +
 * referral endpoints use (lib/api/service-key.ts). The backend's audit
 * ULID is the row id, so redelivery upserts idempotently. Payload is
 * non-PII by construction (the backend forwards only the audit action +
 * actor + its already-scrubbed details_json).
 */
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireApiKey } from "@/lib/api/service-key"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface UsageEventBody {
  id?: string
  action?: string
  actor_kind?: string
  actor_id?: string | null
  user_id?: string | null
  details_json?: string | null
  timestamp_sec?: number
}

export async function POST(request: NextRequest) {
  try {
    const denied = requireApiKey(request, process.env.PAY_API_KEY, "PAY_API_KEY")
    if (denied) return denied

    let body: UsageEventBody
    try {
      body = (await request.json()) as UsageEventBody
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
    }

    const id = body.id?.trim() ?? ""
    const action = body.action?.trim() ?? ""
    const actorKind = body.actor_kind?.trim() ?? ""
    const timestampSec = body.timestamp_sec

    if (!id || !action || !actorKind || typeof timestampSec !== "number") {
      return NextResponse.json(
        { error: "id, action, actor_kind, and timestamp_sec are required" },
        { status: 400 },
      )
    }

    const data = {
      action,
      actorKind,
      actorId: body.actor_id ?? null,
      userId: body.user_id ?? null,
      detailsJson: body.details_json ?? null,
      timestampSec,
    }

    // Upsert by the backend audit ULID → idempotent on redelivery.
    await prisma.payUsageEvent.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[API /v1/pay/usage] error:", error)
    return NextResponse.json({ error: "Failed to ingest usage event" }, { status: 500 })
  }
}
