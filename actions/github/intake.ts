"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as intake from "@/lib/github/intake"
import { IntakeError } from "@/lib/github/intake"
import type { GithubIntakeState } from "@prisma/client"

const BOARD = "/admin/board"
const INTAKE = "/admin/board/intake"

type Result<T = unknown> = { ok: true; value: T } | { ok: false; error: string }
type Gate = { ok: true; me: CmsUser } | { ok: false; error: string }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}
async function gate(priv: "tasks.view" | "tasks.edit"): Promise<Gate> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(priv)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}
function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof IntakeError) return { ok: false, error: e.message }
  return { ok: false, error: e instanceof Error ? e.message : "Operation failed" }
}

export async function listIntakeAction(filter?: { intake?: GithubIntakeState; repo?: string }): Promise<Result<{ issues: intake.IntakeIssueView[]; counts: { pending: number; accepted: number; denied: number } }>> {
  const g = await gate("tasks.view")
  if (!g.ok) return g
  try {
    const [issues, counts] = await Promise.all([intake.listIntake(filter), intake.intakeCounts()])
    return { ok: true, value: { issues, counts } }
  } catch (e) { return fail(e) }
}

export async function acceptIssueAction(issueId: string): Promise<Result<intake.IntakeIssueView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    const value = await intake.acceptIssue(g.me.id, issueId)
    await audit("github_issue_accept", { actorId: g.me.id, target: `${value.repo}#${value.number}`, details: { taskId: value.taskId }, ip: await ip() })
    revalidatePath(INTAKE); revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) { return fail(e) }
}

export async function denyIssueAction(issueId: string, opts?: { closeOnGithub?: boolean; reason?: string }): Promise<Result<intake.IntakeIssueView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    const value = await intake.denyIssue(g.me.id, issueId, opts)
    await audit("github_issue_deny", { actorId: g.me.id, target: `${value.repo}#${value.number}`, details: { closed: !!opts?.closeOnGithub }, ip: await ip() })
    revalidatePath(INTAKE)
    return { ok: true, value }
  } catch (e) { return fail(e) }
}

export async function linkTaskAction(taskId: string, repo: string, number: number): Promise<Result<Awaited<ReturnType<typeof intake.linkTaskToGithub>>>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    const value = await intake.linkTaskToGithub(taskId, repo, number)
    await audit("github_task_link", { actorId: g.me.id, target: taskId, details: { repo, number }, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) { return fail(e) }
}

export async function unlinkTaskAction(taskId: string): Promise<Result> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    await intake.unlinkTaskFromGithub(taskId)
    await audit("github_task_unlink", { actorId: g.me.id, target: taskId, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value: undefined }
  } catch (e) { return fail(e) }
}
