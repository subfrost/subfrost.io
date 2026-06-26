import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { actorFromBearer } from "@/lib/cms/apikey-auth"
import * as store from "@/lib/tasks/store"
import { TaskError } from "@/lib/tasks/store"

export const runtime = "nodejs"

// Bearer-key initiative API, companion to /api/admin/tasks.
//   POST /api/admin/initiatives  { name, goal?, color?, seedTitles?[] }   (needs tasks.edit)
//   GET  /api/admin/initiatives                                           (needs tasks.view)

const BOARD = "/admin/board"
const INITIATIVES = "/admin/board/initiatives"

const CreateInitiative = z.object({
  name: z.string().min(1, "A name is required"),
  goal: z.string().optional(),
  color: z.string().optional(),
  productId: z.string().nullable().optional(),
  seedTitles: z.array(z.string()).optional(),
})

const PatchInitiative = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  goal: z.string().optional(),
  color: z.string().optional(),
  archived: z.boolean().optional(),
  productId: z.string().nullable().optional(),
})

function mapError(e: unknown): { status: number; error: string } {
  if (e instanceof TaskError) return { status: 400, error: e.message }
  if (e instanceof Prisma.PrismaClientKnownRequestError) return { status: 400, error: "Database constraint error" }
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
  const parsed = CreateInitiative.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  try {
    const initiative = await store.createInitiativeWithSeed({ ...parsed.data, createdById: actor.id })
    revalidatePath(INITIATIVES)
    revalidatePath(BOARD)
    return NextResponse.json({ ok: true, initiative }, { status: 201 })
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
  const initiatives = await store.listInitiatives()
  return NextResponse.json({
    ok: true,
    initiatives: initiatives.map((i) => ({ id: i.id, name: i.name, goal: i.goal, color: i.color, status: i.status, archived: i.archived, productId: i.productId })),
  })
}

export async function PATCH(req: NextRequest) {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })
  if (!actor.privileges.includes("tasks.edit")) {
    return NextResponse.json({ error: "This key lacks the tasks.edit scope" }, { status: 403 })
  }
  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 }) }
  const parsed = PatchInitiative.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  const { id, ...patch } = parsed.data
  try {
    const initiative = await store.updateInitiative(id, patch)
    revalidatePath(INITIATIVES); revalidatePath(BOARD)
    return NextResponse.json({ ok: true, initiative })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return NextResponse.json({ error: "Initiative not found" }, { status: 404 })
    const { status, error } = mapError(e)
    return NextResponse.json({ error }, { status })
  }
}
