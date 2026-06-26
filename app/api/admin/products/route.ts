import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { actorFromBearer } from "@/lib/cms/apikey-auth"
import * as store from "@/lib/tasks/store"
import { TaskError } from "@/lib/tasks/store"

export const runtime = "nodejs"

// Bearer-key Product API — the top of the board hierarchy (Product -> Initiative
// -> Task). POST/PATCH need tasks.edit; GET needs tasks.view.

const BOARD = "/admin/board"
const INITIATIVES = "/admin/board/initiatives"

const Create = z.object({ name: z.string().min(1, "A name is required"), color: z.string().optional() })
const Patch = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  color: z.string().optional(),
  archived: z.boolean().optional(),
})

function fail(e: unknown): { status: number; error: string } {
  if (e instanceof TaskError) return { status: 400, error: e.message }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { status: 404, error: "Product not found" }
  return { status: 500, error: "Internal error" }
}

async function gate(req: NextRequest, priv: "tasks.view" | "tasks.edit") {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return { error: NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 }) }
  if (!actor.privileges.includes(priv)) return { error: NextResponse.json({ error: `This key lacks the ${priv} scope` }, { status: 403 }) }
  return { actor }
}

export async function GET(req: NextRequest) {
  const g = await gate(req, "tasks.view")
  if (g.error) return g.error
  const products = await store.listProducts()
  return NextResponse.json({ ok: true, products })
}

export async function POST(req: NextRequest) {
  const g = await gate(req, "tasks.edit")
  if (g.error) return g.error
  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 }) }
  const parsed = Create.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  try {
    const product = await store.createProduct({ ...parsed.data, createdById: g.actor.id })
    revalidatePath(INITIATIVES); revalidatePath(BOARD)
    return NextResponse.json({ ok: true, product }, { status: 201 })
  } catch (e) { const { status, error } = fail(e); return NextResponse.json({ error }, { status }) }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req, "tasks.edit")
  if (g.error) return g.error
  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 }) }
  const parsed = Patch.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  const { id, ...patch } = parsed.data
  try {
    const product = await store.updateProduct(id, patch)
    revalidatePath(INITIATIVES); revalidatePath(BOARD)
    return NextResponse.json({ ok: true, product })
  } catch (e) { const { status, error } = fail(e); return NextResponse.json({ error }, { status }) }
}
