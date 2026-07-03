import { verifyWebhookSignature } from "@/lib/github/client"
import { upsertIssueFromWebhook, applyPullRequestEvent } from "@/lib/github/intake"
import { isAllowedRepo } from "@/lib/github/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GitHub webhook receiver for the allow-listed repos (subfrost-app, subfrost,
// subfrost.io). Public endpoint — security is the HMAC-SHA256 signature GitHub
// sends in `X-Hub-Signature-256`, verified in constant time against the shared
// webhook secret. Handles `issues` (intake) and `pull_request` (PR-link sync)
// events; every other event type is acknowledged with 200 and ignored.

const MAX_WEBHOOK_BYTES = 1024 * 1024 // 1 MiB ceiling for the public endpoint

export async function POST(req: Request): Promise<Response> {
  const cl = Number.parseInt(req.headers.get("content-length") ?? "", 10)
  if (Number.isFinite(cl) && cl > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "webhook body too large" }, { status: 413 })
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

  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "invalid webhook signature" }, { status: 401 })
  }

  const event = req.headers.get("x-github-event") ?? ""
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 })
  }

  const repo = (payload.repository as { full_name?: string } | undefined)?.full_name
  if (!isAllowedRepo(repo)) {
    return Response.json({ ignored: true, reason: "repo not allow-listed" })
  }

  try {
    if (event === "ping") {
      return Response.json({ ok: true, pong: true })
    }
    if (event === "issues") {
      const issue = payload.issue as Parameters<typeof upsertIssueFromWebhook>[1] | undefined
      if (!issue) return Response.json({ ignored: true, reason: "no issue in payload" })
      const res = await upsertIssueFromWebhook(repo, issue, payload)
      return Response.json({ ok: true, recorded: Boolean(res), intakeId: res?.id ?? null })
    }
    if (event === "pull_request") {
      const pr = payload.pull_request as { number?: number; state?: string; merged?: boolean } | undefined
      if (!pr?.number) return Response.json({ ignored: true, reason: "no pull_request in payload" })
      const touched = await applyPullRequestEvent(repo, pr.number, pr.state ?? "open", Boolean(pr.merged))
      return Response.json({ ok: true, tasksUpdated: touched })
    }
    return Response.json({ ignored: true, reason: `unhandled event: ${event}` })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}
