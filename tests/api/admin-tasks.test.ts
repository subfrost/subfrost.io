import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/apikey-auth", () => ({ actorFromBearer: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/tasks/store", () => ({
  createTask: vi.fn(),
  bulkCreateTasks: vi.fn(),
  listInitiatives: vi.fn(),
  listTasks: vi.fn(),
  TaskError: class extends Error {},
}))

import { NextRequest } from "next/server"
import { POST, GET } from "@/app/api/admin/tasks/route"
import { actorFromBearer } from "@/lib/cms/apikey-auth"
import * as store from "@/lib/tasks/store"

const editor = { id: "u1", email: "a@x.io", name: "A", role: "ADMIN", privileges: ["tasks.view", "tasks.edit"], keyId: "k1" }
const viewer = { ...editor, privileges: ["tasks.view"] }

function post(body: unknown, auth = "Bearer sk_test") {
  return new NextRequest("https://subfrost.io/api/admin/tasks", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}
function get(auth = "Bearer sk_test") {
  return new NextRequest("https://subfrost.io/api/admin/tasks", { method: "GET", headers: { authorization: auth } })
}

beforeEach(() => vi.clearAllMocks())

describe("POST /api/admin/tasks", () => {
  it("401 without a valid key", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(null)
    const res = await POST(post({ title: "x" }))
    expect(res.status).toBe(401)
    expect(store.createTask).not.toHaveBeenCalled()
  })

  it("403 when the key lacks tasks.edit", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(viewer as never)
    const res = await POST(post({ title: "x" }))
    expect(res.status).toBe(403)
    expect(store.createTask).not.toHaveBeenCalled()
  })

  it("400 on an invalid body (missing title)", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    const res = await POST(post({ description: "no title" }))
    expect(res.status).toBe(400)
  })

  it("creates a single ticket stamped with the key owner", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.createTask).mockResolvedValue({ id: "t1", title: "Audit" } as never)
    const res = await POST(post({ title: "Audit", priority: "FIRE", initiativeId: "i1" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, task: { id: "t1", title: "Audit" } })
    expect(store.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Audit", priority: "FIRE", initiativeId: "i1", createdById: "u1" }))
  })

  it("creates many tickets from a tasks[] array", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.createTask).mockResolvedValueOnce({ id: "t1" } as never).mockResolvedValueOnce({ id: "t2" } as never)
    const res = await POST(post({ tasks: [{ title: "a" }, { title: "b" }] }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, tasks: [{ id: "t1" }, { id: "t2" }] })
    expect(store.createTask).toHaveBeenCalledTimes(2)
  })

  it("bulk-creates titles under an initiative", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.bulkCreateTasks).mockResolvedValue(3 as never)
    const res = await POST(post({ initiativeId: "i1", titles: ["a", "b", "c"] }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, count: 3 })
    expect(store.bulkCreateTasks).toHaveBeenCalledWith(expect.objectContaining({ initiativeId: "i1", titles: ["a", "b", "c"], createdById: "u1" }))
  })

  it("maps an unknown initiativeId (FK violation) to a 400", async () => {
    const { Prisma } = await import("@prisma/client")
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.createTask).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: "5.22.0" }) as never)
    const res = await POST(post({ title: "x", initiativeId: "ghost" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/initiativeId/i)
  })
})

describe("GET /api/admin/tasks", () => {
  it("403 when the key lacks tasks.view", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue({ ...editor, privileges: [] } as never)
    const res = await GET(get())
    expect(res.status).toBe(403)
  })

  it("returns slim initiatives + tasks for discovery", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(viewer as never)
    vi.mocked(store.listInitiatives).mockResolvedValue([
      { id: "i1", name: "frUSD", status: "TODO", archived: false },
      { id: "i2", name: "archived", status: "DONE", archived: true },
    ] as never)
    vi.mocked(store.listTasks).mockResolvedValue([
      { id: "t1", title: "Audit", status: "TODO", priority: "HIGH", initiativeId: "i1" },
    ] as never)
    const res = await GET(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.initiatives).toEqual([{ id: "i1", name: "frUSD", status: "TODO" }]) // archived dropped
    expect(body.tasks).toEqual([{ id: "t1", title: "Audit", status: "TODO", priority: "HIGH", initiativeId: "i1" }])
  })
})
