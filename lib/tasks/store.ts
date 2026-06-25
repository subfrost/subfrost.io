import prisma from "@/lib/prisma"
import type { TaskView, InitiativeView, TaskStatus, TaskPriority } from "./types"

export class TaskError extends Error {}

const TASK_INCLUDE = { owner: { select: { id: true, name: true, email: true } } }

type TaskRow = {
  id: string; title: string; description: string; status: string; priority: string
  labels: string[]; initiativeId: string | null; position: number; createdAt: Date; updatedAt: Date
  owner: { id: string; name: string | null; email: string } | null
}

function mapTask(r: TaskRow): TaskView {
  return {
    id: r.id, title: r.title, description: r.description,
    status: r.status as TaskStatus, priority: r.priority as TaskPriority,
    labels: r.labels, owner: r.owner, initiativeId: r.initiativeId,
    position: r.position, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }
}

export async function listTasks(): Promise<TaskView[]> {
  const rows = (await prisma.task.findMany({ include: TASK_INCLUDE, orderBy: { createdAt: "desc" } })) as TaskRow[]
  return rows.map(mapTask)
}

export interface CreateTaskInput {
  title: string; description?: string; priority?: TaskPriority
  labels?: string[]; initiativeId?: string | null; ownerId?: string | null; createdById?: string | null
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
      initiativeId: input.initiativeId || null,
      ownerId: input.ownerId || null,
      createdById: input.createdById || null,
    },
    include: TASK_INCLUDE,
  })) as TaskRow
  return mapTask(r)
}

export interface UpdateTaskPatch {
  title?: string; description?: string; priority?: TaskPriority; labels?: string[]; initiativeId?: string | null
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
  const r = (await prisma.task.update({ where: { id }, data, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function moveTask(id: string, status: TaskStatus): Promise<TaskView> {
  const r = (await prisma.task.update({ where: { id }, data: { status }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function claimTask(id: string, ownerId: string): Promise<TaskView> {
  const r = (await prisma.task.update({ where: { id }, data: { ownerId }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({ where: { id } })
}

// --- Initiatives ---

type InitiativeRow = { id: string; name: string; goal: string; color: string; archived: boolean; createdAt: Date; updatedAt: Date }

function mapInitiative(r: InitiativeRow): InitiativeView {
  return { id: r.id, name: r.name, goal: r.goal, color: r.color, archived: r.archived, createdAt: r.createdAt, updatedAt: r.updatedAt }
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
