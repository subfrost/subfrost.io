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
  initiativeId: z.string().nullable().optional(),
})
const Body = z.union([
  Ticket, // single
  z.object({ tasks: z.array(Ticket).min(1, "tasks[] cannot be empty") }), // many
  z.object({ initiativeId: z.string().min(1), titles: z.array(z.string()).min(1) }), // bulk titles
])

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
      for (const t of body.tasks) tasks.push(await store.createTask({ ...t, createdById: actor.id }))
      revalidatePath(BOARD)
      return NextResponse.json({ ok: true, tasks }, { status: 201 })
    }
    // Shape 1: a single ticket.
    const task = await store.createTask({ ...body, createdById: actor.id })
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
