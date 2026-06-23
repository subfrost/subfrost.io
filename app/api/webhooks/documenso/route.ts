import { ZodError } from "zod"
import { verifyWebhookSecret, parseWebhookEvent } from "@/lib/esign/documenso"
import { esign } from "@/lib/esign/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Documenso webhook receiver (ported from subfrost-admin). Public endpoint —
// security is the shared-secret echo Documenso sends in `X-Documenso-Secret`
// (NOT an HMAC), compared in constant time. Verify → parse → applyWebhookEvent.
// Idempotency/replay-dedup lives in the state machine (appliedEventIds).

const MAX_WEBHOOK_BYTES = 1024 * 1024 // 1 MiB ceiling for the public endpoint

// Did parsing fail solely because the `event` discriminator was an enum value
// we don't recognise? Distinguishes "Documenso added a new event type" (absorb
// with 200) from "payload is genuinely malformed" (400).
function isUnknownEventError(err: unknown): boolean {
  if (!(err instanceof ZodError)) return false
  return err.issues.every(
    (i) => i.path.length === 1 && i.path[0] === "event" && i.code === "invalid_enum_value",
  )
}

export async function POST(req: Request): Promise<Response> {
  const cl = Number.parseInt(req.headers.get("content-length") ?? "", 10)
  if (Number.isFinite(cl) && cl > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "webhook body too large" }, { status: 413 })
  }

  const got = req.headers.get("x-documenso-secret")?.trim()
  if (!got || !verifyWebhookSecret(got)) {
    return Response.json({ error: "invalid webhook secret" }, { status: 401 })
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return Response.json({ error: "could not read request body" }, { status: 400 })
  }
  if (raw.length > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "webhook body exceeds 1 MiB" }, { status: 413 })
  }

  let event
  try {
    event = parseWebhookEvent(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid event"
    if (isUnknownEventError(err)) return Response.json({ ignored: true, reason: msg })
    return Response.json({ error: msg }, { status: 400 })
  }

  try {
    const updated = await esign.applyWebhookEvent(event)
    return Response.json({ matched: Boolean(updated), envelopeId: updated?.id })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}
