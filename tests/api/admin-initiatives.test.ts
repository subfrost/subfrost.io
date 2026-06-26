import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/apikey-auth", () => ({ actorFromBearer: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/tasks/store", () => ({
  createInitiativeWithSeed: vi.fn(),
  listInitiatives: vi.fn(),
  updateInitiative: vi.fn(),
  TaskError: class extends Error {},
}))

import { NextRequest } from "next/server"
import { POST, GET, PATCH } from "@/app/api/admin/initiatives/route"
import { actorFromBearer } from "@/lib/cms/apikey-auth"
import * as store from "@/lib/tasks/store"

const editor = { id: "u1", email: "a@x.io", name: "A", role: "ADMIN", privileges: ["tasks.view", "tasks.edit"], keyId: "k1" }

function post(body: unknown, auth = "Bearer sk_test") {
  return new NextRequest("https://subfrost.io/api/admin/initiatives", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}
function get(auth = "Bearer sk_test") {
  return new NextRequest("https://subfrost.io/api/admin/initiatives", { method: "GET", headers: { authorization: auth } })
}

beforeEach(() => vi.clearAllMocks())

describe("POST /api/admin/initiatives", () => {
  it("401 without a valid key", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(null)
    const res = await POST(post({ name: "iOS" }))
    expect(res.status).toBe(401)
    expect(store.createInitiativeWithSeed).not.toHaveBeenCalled()
  })

  it("403 when the key lacks tasks.edit", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue({ ...editor, privileges: ["tasks.view"] } as never)
    const res = await POST(post({ name: "iOS" }))
    expect(res.status).toBe(403)
  })

  it("400 on a missing name", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    const res = await POST(post({ color: "#ffffff" }))
    expect(res.status).toBe(400)
  })

  it("creates an initiative stamped with the key owner", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.createInitiativeWithSeed).mockResolvedValue({ id: "i1", name: "iOS", color: "#ffffff" } as never)
    const res = await POST(post({ name: "iOS", color: "#ffffff", goal: "ship to apple" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, initiative: { id: "i1", name: "iOS", color: "#ffffff" } })
    expect(store.createInitiativeWithSeed).toHaveBeenCalledWith(expect.objectContaining({ name: "iOS", color: "#ffffff", goal: "ship to apple", createdById: "u1" }))
  })
})

describe("GET /api/admin/initiatives", () => {
  it("403 without tasks.view", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue({ ...editor, privileges: [] } as never)
    expect((await GET(get())).status).toBe(403)
  })

  it("lists initiatives", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.listInitiatives).mockResolvedValue([{ id: "i1", name: "iOS", goal: "g", color: "#fff", status: "TODO", archived: false }] as never)
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect((await res.json()).initiatives[0]).toMatchObject({ id: "i1", name: "iOS" })
  })
})

describe("PATCH /api/admin/initiatives", () => {
  it("renames an initiative and assigns it to a product", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.updateInitiative).mockResolvedValue({ id: "i1", name: "App Store Release", productId: "p1" } as never)
    const req = new NextRequest("https://subfrost.io/api/admin/initiatives", {
      method: "PATCH", headers: { authorization: "Bearer sk_test", "content-type": "application/json" },
      body: JSON.stringify({ id: "i1", name: "App Store Release", productId: "p1" }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(store.updateInitiative).toHaveBeenCalledWith("i1", { name: "App Store Release", productId: "p1" })
  })
})
