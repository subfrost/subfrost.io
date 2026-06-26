import prisma from "@/lib/prisma"
import type { TaskView, InitiativeView, TaskStatus, TaskPriority, InitiativeStatus, MemberView, ChecklistItem, CommentView } from "./types"

export class TaskError extends Error {}

const TASK_INCLUDE = {
  owner: { select: { id: true, name: true, email: true } },
  _count: { select: { comments: true } },
}

type TaskRow = {
  id: string; title: string; description: string; status: string; priority: string
  labels: string[]; blockerReason: string; color: string; colorLabel: string; checklist: unknown
  initiativeId: string | null; position: number; deletedAt: Date | null; createdAt: Date; updatedAt: Date
  owner: { id: string; name: string | null; email: string } | null
  _count?: { comments: number }
}

// Tolerant parse: the checklist column is free-form JSON, so guard every field.
function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({
      id: typeof i.id === "string" ? i.id : "",
      text: typeof i.text === "string" ? i.text : "",
      checked: i.checked === true,
    }))
    .filter((i) => i.id && i.text)
}

function mapTask(r: TaskRow): TaskView {
  return {
    id: r.id, title: r.title, description: r.description,
    status: r.status as TaskStatus, priority: r.priority as TaskPriority,
    labels: r.labels, blockerReason: r.blockerReason, color: r.color, colorLabel: r.colorLabel,
    checklist: parseChecklist(r.checklist),
    commentCount: r._count?.comments ?? 0, owner: r.owner, initiativeId: r.initiativeId,
    position: r.position, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }
}

export async function listTasks(): Promise<TaskView[]> {
  const rows = (await prisma.task.findMany({ where: { deletedAt: null }, include: TASK_INCLUDE, orderBy: { createdAt: "desc" } })) as TaskRow[]
  return rows.map(mapTask)
}

export async function listDeletedTasks(): Promise<TaskView[]> {
  const rows = (await prisma.task.findMany({ where: { deletedAt: { not: null } }, include: TASK_INCLUDE, orderBy: { deletedAt: "desc" } })) as TaskRow[]
  return rows.map(mapTask)
}

export interface CreateTaskInput {
  title: string; description?: string; priority?: TaskPriority
  labels?: string[]; color?: string; colorLabel?: string
  initiativeId?: string | null; ownerId?: string | null; createdById?: string | null
}

// A color tag is only meaningful with a color; clearing the color clears its
// label. colorLabel is trimmed and capped (matches the UI maxLength).
function normalizeColor(color?: string, colorLabel?: string): { color?: string; colorLabel?: string } {
  const out: { color?: string; colorLabel?: string } = {}
  if (color !== undefined) out.color = color.trim()
  if (colorLabel !== undefined) out.colorLabel = colorLabel.trim().slice(0, 20)
  if (out.color === "") out.colorLabel = ""
  return out
}

export async function createTask(input: CreateTaskInput): Promise<TaskView> {
  const title = input.title.trim()
  if (!title) throw new TaskError("A title is required")
  const r = (await prisma.task.create({
    data: {
      title,
      description: input.description?.trim() || "",
      priority: input.priority ?? "MEDIUM",
      labels: input.labels ?? [],
      ...normalizeColor(input.color, input.colorLabel),
      initiativeId: input.initiativeId || null,
      ownerId: input.ownerId || null,
      createdById: input.createdById || null,
    },
    include: TASK_INCLUDE,
  })) as TaskRow
  return mapTask(r)
}

export interface UpdateTaskPatch {
  title?: string; description?: string; priority?: TaskPriority; labels?: string[]
  initiativeId?: string | null; blockerReason?: string; checklist?: ChecklistItem[]
  color?: string; colorLabel?: string
}

// Normalize an incoming checklist: drop blanks, coerce flags, keep ids stable.
function normalizeChecklist(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .map((i) => ({ id: String(i.id || ""), text: String(i.text || "").trim(), checked: i.checked === true }))
    .filter((i) => i.id && i.text)
}

export async function updateTask(id: string, patch: UpdateTaskPatch): Promise<TaskView> {
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const t = patch.title.trim()
    if (!t) throw new TaskError("A title is required")
    data.title = t
  }
  if (patch.description !== undefined) data.description = patch.description.trim()
  if (patch.priority !== undefined) data.priority = patch.priority
  if (patch.labels !== undefined) data.labels = patch.labels
  if (patch.initiativeId !== undefined) data.initiativeId = patch.initiativeId || null
  if (patch.blockerReason !== undefined) data.blockerReason = patch.blockerReason.trim()
  if (patch.color !== undefined || patch.colorLabel !== undefined) {
    Object.assign(data, normalizeColor(patch.color, patch.colorLabel))
  }
  if (patch.checklist !== undefined) data.checklist = normalizeChecklist(patch.checklist)
  const r = (await prisma.task.update({ where: { id }, data, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function moveTask(id: string, status: TaskStatus, position?: number): Promise<TaskView> {
  const data: Record<string, unknown> = { status }
  if (position !== undefined && Number.isFinite(position)) data.position = position
  const r = (await prisma.task.update({ where: { id }, data, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function claimTask(id: string, ownerId: string): Promise<TaskView> {
  const r = (await prisma.task.update({ where: { id }, data: { ownerId }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function deleteTask(id: string): Promise<void> {
  // Soft delete — moves the task to the recycle bin instead of dropping it.
  await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } })
}

export async function restoreTask(id: string): Promise<TaskView> {
  const r = (await prisma.task.update({ where: { id }, data: { deletedAt: null }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function purgeTask(id: string): Promise<void> {
  // Permanent delete from the recycle bin. Cascades comments via the relation.
  await prisma.task.delete({ where: { id } })
}

// --- Comments ---

type CommentRow = {
  id: string; taskId: string; body: string; createdAt: Date
  author: { id: string; name: string | null; email: string } | null
}

function mapComment(r: CommentRow): CommentView {
  return { id: r.id, taskId: r.taskId, author: r.author, body: r.body, createdAt: r.createdAt }
}

export async function listComments(taskId: string): Promise<CommentView[]> {
  const rows = (await prisma.taskComment.findMany({
    where: { taskId },
    include: { author: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  })) as CommentRow[]
  return rows.map(mapComment)
}

export async function addComment(taskId: string, authorId: string | null, body: string): Promise<CommentView> {
  const text = body.trim()
  if (!text) throw new TaskError("A comment cannot be empty")
  const r = (await prisma.taskComment.create({
    data: { taskId, authorId: authorId || null, body: text },
    include: { author: { select: { id: true, name: true, email: true } } },
  })) as CommentRow
  return mapComment(r)
}

export async function deleteComment(id: string): Promise<void> {
  await prisma.taskComment.delete({ where: { id } })
}

export async function assignTask(id: string, ownerId: string | null): Promise<TaskView> {
  if (ownerId) {
    const u = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, active: true } })
    if (!u || !u.active) throw new TaskError("User not found")
  }
  const r = (await prisma.task.update({ where: { id }, data: { ownerId }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function listAssignableUsers(): Promise<MemberView[]> {
  const rows = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email }))
}

export async function bulkCreateTasks(input: { initiativeId: string; titles: string[]; createdById?: string | null }): Promise<number> {
  const titles = input.titles.map((t) => t.trim()).filter(Boolean)
  if (titles.length === 0) throw new TaskError("Add at least one task")
  const r = await prisma.task.createMany({
    data: titles.map((title) => ({ title, initiativeId: input.initiativeId, createdById: input.createdById || null })),
  })
  return r.count
}

// --- Initiatives ---

type InitiativeRow = { id: string; name: string; goal: string; color: string; status: string; archived: boolean; createdAt: Date; updatedAt: Date }

function mapInitiative(r: InitiativeRow): InitiativeView {
  return { id: r.id, name: r.name, goal: r.goal, color: r.color, status: r.status as InitiativeStatus, archived: r.archived, createdAt: r.createdAt, updatedAt: r.updatedAt }
}

export async function listInitiatives(): Promise<InitiativeView[]> {
  const rows = (await prisma.initiative.findMany({ orderBy: { createdAt: "desc" } })) as InitiativeRow[]
  return rows.map(mapInitiative)
}

export interface CreateInitiativeInput {
  name: string; goal?: string; color?: string; seedTitles?: string[]; createdById?: string | null
}

export async function createInitiativeWithSeed(input: CreateInitiativeInput): Promise<InitiativeView> {
  const name = input.name.trim()
  if (!name) throw new TaskError("An initiative name is required")
  const titles = (input.seedTitles ?? []).map((t) => t.trim()).filter(Boolean)
  const r = (await prisma.initiative.create({
    data: {
      name,
      goal: input.goal?.trim() || "",
      color: input.color?.trim() || "#38bdf8",
      createdById: input.createdById || null,
      tasks: { create: titles.map((title) => ({ title, createdById: input.createdById || null })) },
    },
  })) as InitiativeRow
  return mapInitiative(r)
}

export interface UpdateInitiativePatch { name?: string; goal?: string; color?: string; archived?: boolean }

export async function updateInitiative(id: string, patch: UpdateInitiativePatch): Promise<InitiativeView> {
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const n = patch.name.trim()
    if (!n) throw new TaskError("An initiative name is required")
    data.name = n
  }
  if (patch.goal !== undefined) data.goal = patch.goal.trim()
  if (patch.color !== undefined) data.color = patch.color.trim()
  if (patch.archived !== undefined) data.archived = patch.archived
  const r = (await prisma.initiative.update({ where: { id }, data })) as InitiativeRow
  return mapInitiative(r)
}

export async function archiveInitiative(id: string): Promise<void> {
  await prisma.initiative.update({ where: { id }, data: { archived: true } })
}

export async function moveInitiative(id: string, status: InitiativeStatus): Promise<InitiativeView> {
  const r = (await prisma.initiative.update({ where: { id }, data: { status } })) as InitiativeRow
  return mapInitiative(r)
}
