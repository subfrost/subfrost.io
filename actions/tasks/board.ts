"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as store from "@/lib/tasks/store"
import { TaskError } from "@/lib/tasks/store"
import type { TaskView, InitiativeView } from "@/lib/tasks/types"

const BOARD = "/admin/board"
const INITIATIVES = "/admin/board/initiatives"

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
type Gate = { ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(priv: "tasks.view" | "tasks.edit"): Promise<Gate> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(priv)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

const PriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"])
const StatusEnum = z.enum(["TODO", "IN_PROGRESS", "DONE"])

const CreateTaskSchema = z.object({
  title: z.string().min(1, "A title is required"),
  description: z.string().optional(),
  priority: PriorityEnum.optional(),
  labels: z.array(z.string()).optional(),
  initiativeId: z.string().nullable().optional(),
})
export type CreateTaskInput = z.input<typeof CreateTaskSchema>

export async function createTaskAction(input: CreateTaskInput): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = CreateTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.createTask({ ...parsed.data, createdById: g.me.id })
    await audit("task_create", { actorId: g.me.id, target: value.id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

const UpdateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: PriorityEnum.optional(),
  labels: z.array(z.string()).optional(),
  initiativeId: z.string().nullable().optional(),
})
export type UpdateTaskInput = z.input<typeof UpdateTaskSchema>

export async function updateTaskAction(id: string, patch: UpdateTaskInput): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = UpdateTaskSchema.safeParse(patch)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.updateTask(id, parsed.data)
    await audit("task_update", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

export async function moveTaskAction(id: string, status: z.infer<typeof StatusEnum>): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = StatusEnum.safeParse(status)
  if (!parsed.success) return { ok: false, error: "Invalid status" }
  const value = await store.moveTask(id, parsed.data)
  await audit("task_move", { actorId: g.me.id, target: id, details: { status: parsed.data }, ip: await ip() })
  revalidatePath(BOARD)
  return { ok: true, value }
}

export async function claimTaskAction(id: string): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const value = await store.claimTask(id, g.me.id)
  await audit("task_claim", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(BOARD)
  return { ok: true, value }
}

export async function deleteTaskAction(id: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  await store.deleteTask(id)
  await audit("task_delete", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(BOARD)
  return { ok: true, value: null }
}

const CreateInitiativeSchema = z.object({
  name: z.string().min(1, "An initiative name is required"),
  goal: z.string().optional(),
  color: z.string().optional(),
  seedText: z.string().optional(),
})
export type CreateInitiativeInput = z.input<typeof CreateInitiativeSchema>

export async function createInitiativeAction(input: CreateInitiativeInput): Promise<Result<InitiativeView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = CreateInitiativeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const seedTitles = (parsed.data.seedText ?? "").split("\n")
    const value = await store.createInitiativeWithSeed({
      name: parsed.data.name, goal: parsed.data.goal, color: parsed.data.color,
      seedTitles, createdById: g.me.id,
    })
    await audit("initiative_create", { actorId: g.me.id, target: value.id, ip: await ip() })
    revalidatePath(INITIATIVES)
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

const UpdateInitiativeSchema = z.object({
  name: z.string().optional(),
  goal: z.string().optional(),
  color: z.string().optional(),
})
export type UpdateInitiativeInput = z.input<typeof UpdateInitiativeSchema>

export async function updateInitiativeAction(id: string, patch: UpdateInitiativeInput): Promise<Result<InitiativeView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = UpdateInitiativeSchema.safeParse(patch)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.updateInitiative(id, parsed.data)
    await audit("initiative_update", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(INITIATIVES)
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

export async function archiveInitiativeAction(id: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  await store.archiveInitiative(id)
  await audit("initiative_archive", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(INITIATIVES)
  revalidatePath(BOARD)
  return { ok: true, value: null }
}
