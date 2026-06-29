"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as store from "@/lib/tasks/store"
import { TaskError } from "@/lib/tasks/store"
import { pushTaskDoneToGithub } from "@/lib/github/intake"
import type { TaskView, InitiativeView, ProductView, CommentView } from "@/lib/tasks/types"

const BOARD = "/admin/board"
const INITIATIVES = "/admin/board/initiatives"
const PRODUCTS = "/admin/board/products"

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
type Gate = { ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }

// Maps expected, user-facing errors to a Result; returns null for anything else
// so the caller rethrows. P2025 = Prisma "record not found", which happens when
// two admins act on the same task and one already deleted/purged it — surface a
// friendly "refresh" message instead of a 500.
function mapError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof TaskError) return { ok: false, error: e.message }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
    return { ok: false, error: "That item no longer exists — refresh the board." }
  }
  return null
}

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(priv: "tasks.view" | "tasks.edit"): Promise<Gate> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(priv)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

const PriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "FIRE"])
const StatusEnum = z.enum(["REQUESTED", "TODO", "BLOCKED", "IN_PROGRESS", "DONE"])
const InitiativeStatusEnum = z.enum(["TODO", "IN_PROGRESS", "ON_HOLD", "DONE"])

const CreateTaskSchema = z.object({
  title: z.string().min(1, "A title is required"),
  description: z.string().optional(),
  priority: PriorityEnum.optional(),
  labels: z.array(z.string()).optional(),
  color: z.string().optional(),
  colorLabel: z.string().optional(),
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
    return mapError(e) ?? (() => { throw e })()
  }
}

const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  checked: z.boolean(),
})

const UpdateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: PriorityEnum.optional(),
  labels: z.array(z.string()).optional(),
  initiativeId: z.string().nullable().optional(),
  blockerReason: z.string().optional(),
  blocked: z.boolean().optional(),
  color: z.string().optional(),
  colorLabel: z.string().optional(),
  checklist: z.array(ChecklistItemSchema).optional(),
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
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function moveTaskAction(id: string, status: z.infer<typeof StatusEnum>, position?: number): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = StatusEnum.safeParse(status)
  if (!parsed.success) return { ok: false, error: "Invalid status" }
  const pos = typeof position === "number" && Number.isFinite(position) ? position : undefined
  try {
    const value = await store.moveTask(id, parsed.data, pos)
    await audit("task_move", { actorId: g.me.id, target: id, details: { status: parsed.data }, ip: await ip() })
    // Push side of sync: moving a GitHub-linked task to Done closes its issue.
    // Best-effort and fire-and-forget — never block the board move on GitHub.
    if (parsed.data === "DONE") void pushTaskDoneToGithub(id).catch(() => {})
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function claimTaskAction(id: string): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    const value = await store.claimTask(id, g.me.id)
    await audit("task_claim", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function assignTaskAction(id: string, ownerId: string | null): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    const value = await store.assignTask(id, ownerId)
    await audit("task_assign", { actorId: g.me.id, target: id, details: { ownerId }, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

const BulkCreateSchema = z.object({
  initiativeId: z.string().min(1, "An initiative is required"),
  titles: z.array(z.string()),
})
export type BulkCreateInput = z.input<typeof BulkCreateSchema>

export async function bulkCreateTasksAction(input: BulkCreateInput): Promise<Result<{ count: number }>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = BulkCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const count = await store.bulkCreateTasks({ initiativeId: parsed.data.initiativeId, titles: parsed.data.titles, createdById: g.me.id })
    await audit("task_bulk_create", { actorId: g.me.id, target: parsed.data.initiativeId, details: { count }, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value: { count } }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function deleteTaskAction(id: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    await store.deleteTask(id) // soft delete → recycle bin
    await audit("task_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value: null }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function restoreTaskAction(id: string): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    const value = await store.restoreTask(id)
    await audit("task_restore", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function purgeTaskAction(id: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    await store.purgeTask(id)
    await audit("task_purge", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value: null }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function listCommentsAction(taskId: string): Promise<Result<CommentView[]>> {
  const g = await gate("tasks.view")
  if (!g.ok) return g
  const value = await store.listComments(taskId)
  return { ok: true, value }
}

const AddCommentSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1, "A comment cannot be empty"),
})
export type AddCommentInput = z.input<typeof AddCommentSchema>

export async function addCommentAction(input: AddCommentInput): Promise<Result<CommentView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = AddCommentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.addComment(parsed.data.taskId, g.me.id, parsed.data.body)
    await audit("task_comment", { actorId: g.me.id, target: parsed.data.taskId, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function deleteCommentAction(id: string, taskId: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    await store.deleteComment(id)
    await audit("task_comment_delete", { actorId: g.me.id, target: taskId, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value: null }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
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
    return mapError(e) ?? (() => { throw e })()
  }
}

const UpdateInitiativeSchema = z.object({
  name: z.string().optional(),
  goal: z.string().optional(),
  color: z.string().optional(),
  productId: z.string().nullable().optional(),
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
    return mapError(e) ?? (() => { throw e })()
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

export async function moveInitiativeAction(id: string, status: z.infer<typeof InitiativeStatusEnum>): Promise<Result<InitiativeView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = InitiativeStatusEnum.safeParse(status)
  if (!parsed.success) return { ok: false, error: "Invalid status" }
  try {
    const value = await store.moveInitiative(id, parsed.data)
    await audit("initiative_move", { actorId: g.me.id, target: id, details: { status: parsed.data }, ip: await ip() })
    revalidatePath(INITIATIVES)
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

// --- Products ---

const CreateProductSchema = z.object({
  name: z.string().min(1, "A product name is required"),
  color: z.string().optional(),
})
export type CreateProductInput = z.input<typeof CreateProductSchema>

export async function createProductAction(input: CreateProductInput): Promise<Result<ProductView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = CreateProductSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.createProduct({ ...parsed.data, createdById: g.me.id })
    await audit("product_create", { actorId: g.me.id, target: value.id, ip: await ip() })
    revalidatePath(PRODUCTS); revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

const UpdateProductSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
})
export type UpdateProductInput = z.input<typeof UpdateProductSchema>

export async function updateProductAction(id: string, patch: UpdateProductInput): Promise<Result<ProductView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = UpdateProductSchema.safeParse(patch)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.updateProduct(id, parsed.data)
    await audit("product_update", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(PRODUCTS); revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}

export async function archiveProductAction(id: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    await store.updateProduct(id, { archived: true })
    await audit("product_archive", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(PRODUCTS); revalidatePath(BOARD)
    return { ok: true, value: null }
  } catch (e) {
    return mapError(e) ?? (() => { throw e })()
  }
}
