import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const complianceRegister = { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() }
  const client = { complianceRegister }
  return { prisma: client, default: client }
})

import { getRegister, seedRegister, updateRegister, RegisterError, REGISTER_ID } from "@/lib/compliance/register"
import { prisma } from "@/lib/prisma"

const db = prisma.complianceRegister as unknown as Record<string, ReturnType<typeof vi.fn>>
beforeEach(() => vi.clearAllMocks())

describe("getRegister", () => {
  it("returns empty defaults when the singleton doesn't exist", async () => {
    db.findUnique.mockResolvedValueOnce(null)
    const r = await getRegister()
    expect(r.entityName).toBe("")
    expect(r.msbRegistered).toBe(true)
    expect(r.updatedAt).toBeNull()
  })
  it("maps the row when present", async () => {
    db.findUnique.mockResolvedValueOnce({
      entityName: "Acme, Inc.", msbRegistered: true, bsaId: "123", msbTracking: "T1",
      ccoName: "Jordan", ccoDesignated: "2026-01-01", updatedBy: "op@x.com", updatedAt: new Date("2026-07-01T00:00:00Z"),
    })
    const r = await getRegister()
    expect(r.bsaId).toBe("123")
    expect(r.updatedAt).toBe("2026-07-01T00:00:00.000Z")
  })
})

describe("seedRegister", () => {
  it("creates the singleton when absent", async () => {
    db.findUnique.mockResolvedValueOnce(null)
    db.create.mockResolvedValueOnce({})
    expect(await seedRegister()).toEqual({ created: true })
    expect(db.create).toHaveBeenCalledWith({ data: { id: REGISTER_ID } })
  })
  it("is a no-op when it already exists", async () => {
    db.findUnique.mockResolvedValueOnce({ id: REGISTER_ID })
    expect(await seedRegister()).toEqual({ created: false })
    expect(db.create).not.toHaveBeenCalled()
  })
})

describe("updateRegister", () => {
  const valid = {
    entityName: "Acme, Inc.", msbRegistered: true, bsaId: "31000",
    msbTracking: "MRX", ccoName: "Jordan Lee", ccoDesignated: "2026-05-26",
  }
  it("upserts valid input and stamps the editor", async () => {
    db.upsert.mockResolvedValueOnce({ ...valid, updatedBy: "op@x.com", updatedAt: new Date("2026-07-14T00:00:00Z") })
    const r = await updateRegister(valid, "op@x.com")
    expect(r.ccoName).toBe("Jordan Lee")
    const arg = db.upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ id: REGISTER_ID })
    expect(arg.update.updatedBy).toBe("op@x.com")
  })
  it("accepts an empty designated date", async () => {
    db.upsert.mockResolvedValueOnce({ ...valid, ccoDesignated: "", updatedBy: "x", updatedAt: new Date() })
    await expect(updateRegister({ ...valid, ccoDesignated: "" }, "x")).resolves.toBeTruthy()
  })
  it("rejects a malformed date without writing", async () => {
    await expect(updateRegister({ ...valid, ccoDesignated: "05/26/2026" }, "x")).rejects.toBeInstanceOf(RegisterError)
    expect(db.upsert).not.toHaveBeenCalled()
  })
})
