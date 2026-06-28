import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/apikey-auth", () => ({ actorFromBearer: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/tasks/store", () => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  TaskError: class extends Error {},
}))

import { NextRequest } from "next/server"
import { POST, GET, PATCH } from "@/app/api/admin/products/route"
import { actorFromBearer } from "@/lib/cms/apikey-auth"
import * as store from "@/lib/tasks/store"

const editor = { id: "u1", email: "a@x.io", name: "A", role: "ADMIN", privileges: ["tasks.view", "tasks.edit"], keyId: "k1" }

function req(method: string, body?: unknown, auth = "Bearer sk_test") {
  return new NextRequest("https://subfrost.io/api/admin/products", {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => vi.clearAllMocks())

describe("/api/admin/products", () => {
  it("POST 401 without key, 403 without tasks.edit", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(null)
    expect((await POST(req("POST", { name: "iOS" }))).status).toBe(401)
    vi.mocked(actorFromBearer).mockResolvedValue({ ...editor, privileges: ["tasks.view"] } as never)
    expect((await POST(req("POST", { name: "iOS" }))).status).toBe(403)
  })

  it("POST creates a product stamped with the owner", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.createProduct).mockResolvedValue({ id: "p1", name: "iOS", color: "#ffffff" } as never)
    const res = await POST(req("POST", { name: "iOS", color: "#ffffff" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, product: { id: "p1", name: "iOS", color: "#ffffff" } })
    expect(store.createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "iOS", color: "#ffffff", createdById: "u1" }))
  })

  it("GET lists products (tasks.view)", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.listProducts).mockResolvedValue([{ id: "p1", name: "iOS" }] as never)
    const res = await GET(req("GET"))
    expect(res.status).toBe(200)
    expect((await res.json()).products[0]).toMatchObject({ id: "p1", name: "iOS" })
  })

  it("PATCH updates a product", async () => {
    vi.mocked(actorFromBearer).mockResolvedValue(editor as never)
    vi.mocked(store.updateProduct).mockResolvedValue({ id: "p1", name: "iOS", archived: true } as never)
    const res = await PATCH(req("PATCH", { id: "p1", archived: true }))
    expect(res.status).toBe(200)
    expect(store.updateProduct).toHaveBeenCalledWith("p1", { archived: true })
  })
})
