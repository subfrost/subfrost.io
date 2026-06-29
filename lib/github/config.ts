// GitHub integration config. The board ingests external issues from these repos
// only; anything else the webhook receives is ignored. Keep this list in sync
// with the repos that point their webhook at /api/webhooks/github.

export const GITHUB_OWNER = "subfrost"

export const GITHUB_REPOS = [
  "subfrost/subfrost-app",
  "subfrost/subfrost",
  "subfrost/subfrost.io",
] as const

export type GithubRepo = (typeof GITHUB_REPOS)[number]

export function isAllowedRepo(fullName: string | undefined | null): fullName is GithubRepo {
  return !!fullName && (GITHUB_REPOS as readonly string[]).includes(fullName)
}

/** Short label for a repo full-name ("subfrost/subfrost-app" → "subfrost-app"). */
export function repoLabel(fullName: string): string {
  return fullName.includes("/") ? fullName.split("/")[1] : fullName
}

// Secrets (set via env / external-secrets). The PAT (subfrostdev, repo+issues
// scope across all three repos) powers push/pull; the webhook secret verifies
// inbound deliveries. Read at call time so runtime-injected env is picked up and
// so it's testable. Sync degrades gracefully when the PAT is absent.
export const githubPat = (): string => process.env.GITHUB_PAT || ""
export const githubWebhookSecret = (): string => process.env.GITHUB_WEBHOOK_SECRET || ""
export const githubSyncEnabled = (): boolean => githubPat().length > 0
