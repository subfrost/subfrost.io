import crypto from "crypto"
import { githubPat, githubWebhookSecret, githubSyncEnabled } from "./config"

// Minimal GitHub REST client + webhook verification. Dependency-free (raw fetch
// to api.github.com) to avoid pulling Octokit. Used by the intake/sync layer to
// comment on and close/reopen issues with the subfrostdev PAT.

const API = "https://api.github.com"

export class GithubError extends Error {
  constructor(message: string, public status = 502) { super(message) }
}

/** Constant-time verify of GitHub's `X-Hub-Signature-256` (HMAC-SHA256 of the
 *  raw body with the shared webhook secret). Returns false if either is empty
 *  or the digests differ. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = githubWebhookSecret()
  if (!secret || !signatureHeader) return false
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(signatureHeader, "utf8")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

async function gh(path: string, init?: RequestInit): Promise<unknown> {
  if (!githubSyncEnabled()) throw new GithubError("GitHub sync disabled (no PAT configured)", 503)
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${githubPat()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "subfrost-admin",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new GithubError(`GitHub ${res.status}: ${txt.slice(0, 200)}`, res.status)
  }
  return res.status === 204 ? null : res.json()
}

/** Post a comment on an issue/PR. repo = "owner/name". */
export function commentOnIssue(repo: string, number: number, body: string): Promise<unknown> {
  return gh(`/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) })
}

/** Set an issue's state ("closed" | "open"), optionally with a state_reason. */
export function setIssueState(
  repo: string, number: number, state: "open" | "closed", stateReason?: "completed" | "not_planned",
): Promise<unknown> {
  return gh(`/repos/${repo}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify({ state, ...(stateReason ? { state_reason: stateReason } : {}) }),
  })
}

/** Fetch a single issue (for manual link / refresh). */
export function getIssue(repo: string, number: number): Promise<{
  number: number; title: string; body: string | null; state: string; html_url: string
  user?: { login: string }; labels?: ({ name: string } | string)[]
  pull_request?: unknown
}> {
  return gh(`/repos/${repo}/issues/${number}`) as Promise<never>
}
