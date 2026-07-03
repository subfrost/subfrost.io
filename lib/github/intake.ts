import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { createTask } from "@/lib/tasks/store"
import { isAllowedRepo, repoLabel, githubSyncEnabled } from "./config"
import { commentOnIssue, setIssueState, getIssue, GithubError } from "./client"
import type { GithubIntakeState } from "@prisma/client"

// Triage + linking layer for external GitHub issues. The webhook feeds
// upsertIssueFromWebhook / applyPullRequestEvent; the triage UI uses the rest.

export class IntakeError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export interface IntakeIssueView {
  id: string
  repo: string
  repoLabel: string
  number: number
  title: string
  body: string
  author: string
  url: string
  state: string
  labels: string[]
  intake: GithubIntakeState
  taskId: string | null
  triagedAt: string | null
  createdAt: string
}

type IssuePayload = {
  number: number
  title?: string
  body?: string | null
  html_url?: string
  state?: string
  user?: { login?: string } | null
  labels?: ({ name?: string } | string)[]
  pull_request?: unknown
}

const labelNames = (labels: IssuePayload["labels"]): string[] =>
  (labels ?? []).map((l) => (typeof l === "string" ? l : l?.name ?? "")).filter(Boolean)

function view(r: {
  id: string; repo: string; number: number; title: string; body: string; author: string
  url: string; state: string; labels: string[]; intake: GithubIntakeState; taskId: string | null
  triagedAt: Date | null; createdAt: Date
}): IntakeIssueView {
  return {
    id: r.id, repo: r.repo, repoLabel: repoLabel(r.repo), number: r.number, title: r.title,
    body: r.body, author: r.author, url: r.url, state: r.state, labels: r.labels,
    intake: r.intake, taskId: r.taskId,
    triagedAt: r.triagedAt ? r.triagedAt.toISOString() : null, createdAt: r.createdAt.toISOString(),
  }
}

/** Upsert an external issue from a webhook `issues` event. Returns the row, or
 *  null if the repo isn't allow-listed or the payload is actually a PR. Triage
 *  state is never changed here — only the mirrored GitHub fields. */
export async function upsertIssueFromWebhook(
  repo: string, issue: IssuePayload, rawEvent: unknown,
): Promise<{ id: string; taskId: string | null } | null> {
  if (!isAllowedRepo(repo) || issue.pull_request) return null
  const data = {
    title: issue.title ?? `#${issue.number}`,
    body: issue.body ?? "",
    author: issue.user?.login ?? "",
    url: issue.html_url ?? `https://github.com/${repo}/issues/${issue.number}`,
    state: issue.state ?? "open",
    labels: labelNames(issue.labels),
    raw: (rawEvent ?? {}) as Prisma.InputJsonValue,
  }
  const row = await prisma.githubIssue.upsert({
    where: { repo_number: { repo, number: issue.number } },
    update: data,
    create: { repo, number: issue.number, ...data },
    select: { id: true, taskId: true, state: true },
  })
  // Mirror GitHub state onto a linked board task (pull side of sync).
  if (row.taskId) {
    await prisma.task.update({
      where: { id: row.taskId },
      data: { githubState: data.state, githubSyncedAt: new Date() },
    }).catch(() => {})
  }
  return { id: row.id, taskId: row.taskId }
}

/** Apply a `pull_request` event: reflect open/closed/merged onto any task linked
 *  to that PR number in that repo. PRs are not intake items. */
export async function applyPullRequestEvent(
  repo: string, number: number, prState: string, merged: boolean,
): Promise<number> {
  if (!isAllowedRepo(repo)) return 0
  const state = merged ? "merged" : prState
  const res = await prisma.task.updateMany({
    where: { githubRepo: repo, githubNumber: number, githubKind: "PR" },
    data: { githubState: state, githubSyncedAt: new Date() },
  })
  return res.count
}

export async function listIntake(filter?: { intake?: GithubIntakeState; repo?: string }): Promise<IntakeIssueView[]> {
  const rows = await prisma.githubIssue.findMany({
    where: { intake: filter?.intake, ...(filter?.repo ? { repo: filter.repo } : {}) },
    orderBy: [{ intake: "asc" }, { createdAt: "desc" }],
  })
  return rows.map(view)
}

export async function intakeCounts(): Promise<{ pending: number; accepted: number; denied: number }> {
  const [pending, accepted, denied] = await Promise.all([
    prisma.githubIssue.count({ where: { intake: "PENDING" } }),
    prisma.githubIssue.count({ where: { intake: "ACCEPTED" } }),
    prisma.githubIssue.count({ where: { intake: "DENIED" } }),
  ])
  return { pending, accepted, denied }
}

/** Accept an external issue: create a board task (status REQUESTED) linked back
 *  to the issue, mark it ACCEPTED, and (best-effort) comment on GitHub. */
export async function acceptIssue(actorId: string | null, issueId: string): Promise<IntakeIssueView> {
  const issue = await prisma.githubIssue.findUnique({ where: { id: issueId } })
  if (!issue) throw new IntakeError("Issue not found", 404)
  if (issue.intake === "ACCEPTED") throw new IntakeError("Already accepted")

  const task = await createTask({
    title: issue.title,
    description: `${issue.body}\n\n— from ${issue.repo}#${issue.number} (${issue.url})`.trim(),
    createdById: actorId,
  })
  // createTask defaults to TODO; move into the Requested Tasks column + stamp the link.
  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "REQUESTED",
      githubRepo: issue.repo, githubNumber: issue.number, githubUrl: issue.url,
      githubKind: "ISSUE", githubState: issue.state, githubSyncedAt: new Date(),
    },
  })
  const updated = await prisma.githubIssue.update({
    where: { id: issueId },
    data: { intake: "ACCEPTED", taskId: task.id, triagedById: actorId, triagedAt: new Date() },
  })
  if (githubSyncEnabled()) {
    await commentOnIssue(issue.repo, issue.number,
      "Thanks — we've accepted this into the SUBFROST board for triage. We'll track it from here.")
      .catch(() => {}) // best-effort; never block the accept on a GitHub hiccup
  }
  return view(updated)
}

/** Deny an external issue. Optionally close it on GitHub with a not_planned reason. */
export async function denyIssue(
  actorId: string | null, issueId: string, opts?: { closeOnGithub?: boolean; reason?: string },
): Promise<IntakeIssueView> {
  const issue = await prisma.githubIssue.findUnique({ where: { id: issueId } })
  if (!issue) throw new IntakeError("Issue not found", 404)
  const updated = await prisma.githubIssue.update({
    where: { id: issueId },
    data: { intake: "DENIED", triagedById: actorId, triagedAt: new Date() },
  })
  if (opts?.closeOnGithub && githubSyncEnabled()) {
    if (opts.reason) await commentOnIssue(issue.repo, issue.number, opts.reason).catch(() => {})
    await setIssueState(issue.repo, issue.number, "closed", "not_planned").catch(() => {})
  }
  return view(updated)
}

/** Manually link a board task to a GitHub issue or PR (pulls current state). */
export async function linkTaskToGithub(
  taskId: string, repo: string, number: number,
): Promise<{ githubRepo: string; githubNumber: number; githubUrl: string; githubKind: string; githubState: string }> {
  if (!isAllowedRepo(repo)) throw new IntakeError(`Repo not allow-listed: ${repo}`)
  if (!githubSyncEnabled()) throw new IntakeError("GitHub sync disabled (no PAT configured)", 503)
  let info
  try {
    info = await getIssue(repo, number)
  } catch (e) {
    if (e instanceof GithubError) throw new IntakeError(e.message, e.status)
    throw e
  }
  const kind = info.pull_request ? "PR" : "ISSUE"
  await prisma.task.update({
    where: { id: taskId },
    data: {
      githubRepo: repo, githubNumber: number, githubUrl: info.html_url,
      githubKind: kind, githubState: info.state, githubSyncedAt: new Date(),
    },
  })
  return { githubRepo: repo, githubNumber: number, githubUrl: info.html_url, githubKind: kind, githubState: info.state }
}

export async function unlinkTaskFromGithub(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { githubRepo: null, githubNumber: null, githubUrl: null, githubKind: null, githubState: null, githubSyncedAt: null },
  })
}

/** Push: close the linked issue when a task is marked done. Best-effort no-op if
 *  sync is disabled or the task has no linked issue. */
export async function pushTaskDoneToGithub(taskId: string): Promise<void> {
  if (!githubSyncEnabled()) return
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { githubRepo: true, githubNumber: true, githubKind: true },
  })
  if (!t?.githubRepo || t.githubNumber == null || t.githubKind !== "ISSUE") return
  await commentOnIssue(t.githubRepo, t.githubNumber, "Resolved — marked done on the SUBFROST board.").catch(() => {})
  await setIssueState(t.githubRepo, t.githubNumber, "closed", "completed").catch(() => {})
  await prisma.task.update({ where: { id: taskId }, data: { githubState: "closed", githubSyncedAt: new Date() } }).catch(() => {})
}
