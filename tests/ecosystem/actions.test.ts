// tests/ecosystem/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cms/translate", () => ({
  translate: vi.fn(),
  translationUnavailable: vi.fn(() => false),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: {
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(),
    },
    ecosystemSettings: { upsert: vi.fn() },
  },
}))

import { currentUser } from "@/lib/cms/authz"
import { prisma } from "@/lib/prisma"
import { translate } from "@/lib/cms/translate"
import {
  saveEcosystemProject,
  deleteEcosystemProject,
  setFeaturedBandEnabled,
  translateEcosystemDescription,
} from "@/actions/ecosystem/projects"

const editor = { privileges: ["ecosystem.view", "ecosystem.edit"] }
const viewer = { privileges: ["ecosystem.view"] }

const validInput = {
  name: "Fairmints",
  category: "Launchpad",
  status: "Live",
  url: "https://fairmints.io",
  xUrl: "https://x.com/fairmints",
  docsUrl: null,
  descriptionEn: "Bitcoin minting made easy.",
  descriptionZh: "",
  featured: false,
  sortOrder: 10,
  published: true,
}

beforeEach(() => vi.clearAllMocks())

describe("saveEcosystemProject", () => {
  it("rejects unauthenticated", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null as never)
    const res = await saveEcosystemProject(validInput)
    expect(res.ok).toBe(false)
    expect(prisma.ecosystemProject.create).not.toHaveBeenCalled()
  })

  it("rejects viewer without edit privilege", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(viewer as never)
    const res = await saveEcosystemProject(validInput)
    expect(res.ok).toBe(false)
    expect(prisma.ecosystemProject.create).not.toHaveBeenCalled()
  })

  it("rejects bad category, status and url", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    expect((await saveEcosystemProject({ ...validInput, category: "Meme" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, status: "Dead" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, url: "javascript:x" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, xUrl: "notaurl" })).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, name: "  " })).ok).toBe(false)
    expect(prisma.ecosystemProject.create).not.toHaveBeenCalled()
  })

  it("creates with derived slug when none given", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject(validInput)
    expect(res).toEqual({ ok: true, id: "p1" })
    expect(prisma.ecosystemProject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "fairmints" }) })
    )
  })

  it("updates when id given", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.update).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject({ ...validInput, id: "p1" })
    expect(res.ok).toBe(true)
    expect(prisma.ecosystemProject.update).toHaveBeenCalled()
  })

  it("maps a unique-constraint violation on create to a friendly slug error", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockRejectedValueOnce(
      new Error("Unique constraint failed on the fields: (slug)") as never
    )
    const res = await saveEcosystemProject(validInput)
    expect(res).toEqual({ ok: false, error: "Slug already exists" })
  })

  it("persists kind and alkaneId", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValue({ id: "e1" } as never)
    const res = await saveEcosystemProject({ ...validInput, kind: "Contract", alkaneId: " 2:0 " } as never)
    expect(res.ok).toBe(true)
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.kind).toBe("Contract")
    expect(data.alkaneId).toBe("2:0") // trimmed
  })
  it("rejects an unknown kind", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    const res = await saveEcosystemProject({ ...validInput, kind: "Token" } as never)
    expect(res).toEqual({ ok: false, error: "Unknown kind" })
  })
  it("rejects a malformed alkaneId", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    const res = await saveEcosystemProject({ ...validInput, kind: "Contract", alkaneId: "2-0" } as never)
    expect(res).toEqual({ ok: false, error: "Alkane ID must look like block:tx (e.g. 2:0)" })
  })

  it("persists bannerUrl trimmed and rejects a non-http banner", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValue({ id: "b1" } as never)
    const ok = await saveEcosystemProject({ ...validInput, bannerUrl: " https://cdn.x/b.png " } as never)
    expect(ok.ok).toBe(true)
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.bannerUrl).toBe("https://cdn.x/b.png")
    const bad = await saveEcosystemProject({ ...validInput, bannerUrl: "javascript:x" } as never)
    expect(bad.ok).toBe(false)
  })
})

describe("saveEcosystemProject — profile & contracts", () => {
  it("rejects a contract row with empty label or bad alkaneId", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    expect((await saveEcosystemProject({ ...validInput, contracts: [{ label: " ", alkaneId: "2:0" }] } as never)).ok).toBe(false)
    expect((await saveEcosystemProject({ ...validInput, contracts: [{ label: "ARBUZ", alkaneId: "2-0" }] } as never)).ok).toBe(false)
    expect(prisma.ecosystemProject.create).not.toHaveBeenCalled()
  })

  it("creates with nested contracts, sortOrder from array index, trimmed", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.create).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject({
      ...validInput,
      profileEn: "  # Body  ",
      contracts: [
        { label: " Fireball ", alkaneId: " 4:257 ", noteEn: " lottery " },
        { label: "ARBUZ", alkaneId: "2:25349" },
      ],
    } as never)
    expect(res.ok).toBe(true)
    const data = vi.mocked(prisma.ecosystemProject.create).mock.calls[0][0].data
    expect(data.profileEn).toBe("# Body")
    expect(data.contracts).toEqual({
      create: [
        { label: "Fireball", alkaneId: "4:257", noteEn: "lottery", noteZh: "", sortOrder: 0 },
        { label: "ARBUZ", alkaneId: "2:25349", noteEn: "", noteZh: "", sortOrder: 1 },
      ],
    })
  })

  it("update replaces contract rows (deleteMany + create)", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.update).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await saveEcosystemProject({ ...validInput, id: "p1", contracts: [{ label: "ARBUZ", alkaneId: "2:25349" }] } as never)
    expect(res.ok).toBe(true)
    const data = vi.mocked(prisma.ecosystemProject.update).mock.calls[0][0].data
    expect(data.contracts!.deleteMany).toEqual({})
    expect(data.contracts!.create).toHaveLength(1)
  })

  it("update with no contracts field still clears rows only when [] sent explicitly", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(prisma.ecosystemProject.update).mockResolvedValueOnce({ id: "p1" } as never)
    await saveEcosystemProject({ ...validInput, id: "p1" } as never) // sem contracts
    const data = vi.mocked(prisma.ecosystemProject.update).mock.calls[0][0].data
    expect(data.contracts).toBeUndefined() // undefined = não mexe nas linhas
  })
})

describe("deleteEcosystemProject / setFeaturedBandEnabled", () => {
  it("requires edit privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(viewer as never)
    expect((await deleteEcosystemProject("p1")).ok).toBe(false)
    expect(prisma.ecosystemProject.delete).not.toHaveBeenCalled()
    expect((await setFeaturedBandEnabled(false)).ok).toBe(false)
    expect(prisma.ecosystemSettings.upsert).not.toHaveBeenCalled()
  })

  it("upserts the settings row", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    const res = await setFeaturedBandEnabled(false)
    expect(res.ok).toBe(true)
    expect(prisma.ecosystemSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { featuredBandEnabled: false },
      create: { id: 1, featuredBandEnabled: false },
    })
  })
})

describe("translateEcosystemDescription", () => {
  it("returns the translated body", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(translate).mockResolvedValueOnce({ title: "", excerpt: "", body: "中文描述", sources: "" } as never)
    const res = await translateEcosystemDescription("English description")
    expect(res).toEqual({ ok: true, zh: "中文描述" })
  })

  it("rejects empty source", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    const res = await translateEcosystemDescription("   ")
    expect(res.ok).toBe(false)
  })
})
