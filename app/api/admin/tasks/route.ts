import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { actorFromBearer } from "@/lib/cms/apikey-auth"
import * as store from "@/lib/tasks/store"
import { TaskError } from "@/lib/tasks/store"

export const runtime = "nodejs"

// Bearer-key task-board API, for agents/CLI to file tickets without a session.
//
//   Authorization: Bearer sk_...        (key needs the `tasks.edit` scope; GET needs `tasks.view`)
//
// POST /api/admin/tasks  — create ticket(s). JSON body, one of:
//   1. single ticket  { title, description?, priority?, labels?, initiativeId? }
//   2. many tickets   { tasks: [ {title, ...}, ... ] }   (each a full ticket)
//   3. bulk titles    { initiativeId, titles: ["…", "…"] }  (quick same-initiative add)
//
// GET  /api/admin/tasks  — discovery: returns initiatives (with ids) + a slim task list,
//   so a caller can look up a valid `initiativeId` before posting.

const BOARD = "/admin/board"

const Priority = z.enum(["LOW", "MEDIUM", "HIGH", "FIRE"])
const Ticket = z.object({
  title: z.string().min(1, "A title is required"),
  description: z.string().optional(),
  priority: Priority.optional(),
  labels: z.array(z.string()).optional(),
  color: z.string().optional(),
  colorLabel: z.string().optional(),
  // Acceptance-criteria style subtasks: plain strings, seeded unchecked.
  checklist: z.array(z.string()).optional(),
  initiativeId: z.string().nullable().optional(),
})
const Body = z.union([
  Ticket, // single
  z.object({ tasks: z.array(Ticket).min(1, "tasks[] cannot be empty") }), // many
  z.object({ initiativeId: z.string().min(1), titles: z.array(z.string()).min(1) }), // bulk titles
])

// Convert a parsed ticket (checklist as strings) into a store CreateTaskInput
// (checklist as items with ids), so acceptance criteria become real subtasks.
function toInput(t: z.infer<typeof Ticket>, actorId: string) {
  return {
    ...t,
    checklist: t.checklist?.map((text) => ({ id: crypto.randomUUID(), text, checked: false })),
    createdById: actorId,
  }
}

function mapError(e: unknown): { status: number; error: string } {
  if (e instanceof TaskError) return { status: 400, error: e.message }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2003" || e.code === "P2025") return { status: 400, error: "Unknown initiativeId" }
  }
  return { status: 500, error: "Internal error" }
}

export async function POST(req: NextRequest) {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })
  if (!actor.privileges.includes("tasks.edit")) {
    return NextResponse.json({ error: "This key lacks the tasks.edit scope" }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 })
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const body = parsed.data

  try {
    // Shape 3: bulk titles under one initiative.
    if ("titles" in body) {
      const count = await store.bulkCreateTasks({ initiativeId: body.initiativeId, titles: body.titles, createdById: actor.id })
      revalidatePath(BOARD)
      return NextResponse.json({ ok: true, count }, { status: 201 })
    }
    // Shape 2: many full tickets.
    if ("tasks" in body) {
      const tasks = []
      for (const t of body.tasks) tasks.push(await store.createTask(toInput(t, actor.id)))
      revalidatePath(BOARD)
      return NextResponse.json({ ok: true, tasks }, { status: 201 })
    }
    // Shape 1: a single ticket.
    const task = await store.createTask(toInput(body, actor.id))
    revalidatePath(BOARD)
    return NextResponse.json({ ok: true, task }, { status: 201 })
  } catch (e) {
    const { status, error } = mapError(e)
    return NextResponse.json({ error }, { status })
  }
}

export async function GET(req: NextRequest) {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })
  if (!actor.privileges.includes("tasks.view")) {
    return NextResponse.json({ error: "This key lacks the tasks.view scope" }, { status: 403 })
  }

  const [initiatives, tasks] = await Promise.all([store.listInitiatives(), store.listTasks()])
  return NextResponse.json({
    ok: true,
    initiatives: initiatives
      .filter((i) => !i.archived)
      .map((i) => ({ id: i.id, name: i.name, status: i.status })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, initiativeId: t.initiativeId })),
  })
}

// Permanently delete one or more tasks. Body: { id } or { ids: [...] }.
// Hard purge (not soft delete) — intended for CLI cleanup/re-seeding.
const DeleteBody = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ ids: z.array(z.string().min(1)).min(1) }),
])

export async function DELETE(req: NextRequest) {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })
  if (!actor.privileges.includes("tasks.edit")) {
    return NextResponse.json({ error: "This key lacks the tasks.edit scope" }, { status: 403 })
  }
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON ({id} or {ids:[…]})" }, { status: 400 })
  }
  const parsed = DeleteBody.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Provide {id} or {ids:[…]}" }, { status: 400 })
  const ids = "ids" in parsed.data ? parsed.data.ids : [parsed.data.id]

  let deleted = 0
  for (const id of ids) {
    try {
      await store.purgeTask(id)
      deleted++
    } catch (e) {
      // Ignore already-gone rows (P2025); surface anything else.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")) {
        return NextResponse.json({ error: "Internal error", deleted }, { status: 500 })
      }
    }
  }
  revalidatePath(BOARD)
  return NextResponse.json({ ok: true, deleted })
}

// Update fields on one or more tasks. Body: { id|ids, ...patch }. Used e.g. to
// clear labels in bulk. checklist accepts plain strings (seeded unchecked).
const PatchBody = z.object({
  id: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: Priority.optional(),
  labels: z.array(z.string()).optional(),
  color: z.string().optional(),
  colorLabel: z.string().optional(),
  blockerReason: z.string().optional(),
  initiativeId: z.string().nullable().optional(),
  checklist: z.array(z.string()).optional(),
}).refine((b) => b.id || (b.ids && b.ids.length), { message: "Provide id or ids[]" })

export async function PATCH(req: NextRequest) {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })
  if (!actor.privileges.includes("tasks.edit")) {
    return NextResponse.json({ error: "This key lacks the tasks.edit scope" }, { status: 403 })
  }
  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 }) }
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  const { id, ids, checklist, ...rest } = parsed.data
  const targets = ids?.length ? ids : id ? [id] : []
  const patch = {
    ...rest,
    ...(checklist ? { checklist: checklist.map((text) => ({ id: crypto.randomUUID(), text, checked: false })) } : {}),
  }
  try {
    let updated = 0
    for (const t of targets) { await store.updateTask(t, patch); updated++ }
    revalidatePath(BOARD)
    return NextResponse.json({ ok: true, updated })
  } catch (e) {
    const { status, error } = mapError(e)
    return NextResponse.json({ error }, { status })
  }
}
