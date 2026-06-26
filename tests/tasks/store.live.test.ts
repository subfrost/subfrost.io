// Live integration test against a REAL Postgres (not mocked). Gated behind
// RUN_LIVE_DB so normal CI skips it. Run with:
//   DATABASE_URL=postgresql://subfrost:test@localhost:55432/subfrost RUN_LIVE_DB=1 \
//     npx vitest run tests/tasks/store.live.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"

const LIVE = !!process.env.RUN_LIVE_DB && !!process.env.LIVE_DATABASE_URL

// store + prisma are imported dynamically AFTER we fix DATABASE_URL, because
// tests/setup.ts overwrites it and lib/prisma builds the client at import time.
let store: typeof import("@/lib/tasks/store")
let prisma: typeof import("@/lib/prisma").default
let userId = ""
let initiativeId = ""

describe.runIf(LIVE)("store (live Postgres)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.LIVE_DATABASE_URL
    store = await import("@/lib/tasks/store")
    prisma = (await import("@/lib/prisma")).default
    const u = await prisma.user.create({ data: { email: `live-${Date.now()}@x.io`, passwordHash: "x", name: "Live Tester" } })
    userId = u.id
    const i = await prisma.initiative.create({ data: { name: "Live initiative" } })
    initiativeId = i.id
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.taskComment.deleteMany({})
    await prisma.task.deleteMany({})
    await prisma.initiative.deleteMany({ where: { id: initiativeId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it("createTask defaults: empty checklist, 0 comments, visible in listTasks", async () => {
    const t = await store.createTask({ title: "  Audit mint path  ", initiativeId, createdById: userId })
    expect(t.title).toBe("Audit mint path")
    expect(t.checklist).toEqual([])
    expect(t.commentCount).toBe(0)
    const list = await store.listTasks()
    expect(list.find((x) => x.id === t.id)).toBeTruthy()
  })

  it("guarantees checklist is never NULL and tolerates a non-array jsonb value", async () => {
    const t = await store.createTask({ title: "legacy row" })
    // The column is `jsonb NOT NULL DEFAULT '[]'`, so prod's ALTER backfills
    // existing rows to [] and the DB itself rejects a NULL — verify that.
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Task" SET checklist = NULL WHERE id = $1`, t.id),
    ).rejects.toThrow()
    // A malformed (non-array) value is still parsed defensively to [].
    await prisma.$executeRawUnsafe(`UPDATE "Task" SET checklist = '{"not":"an array"}'::jsonb WHERE id = $1`, t.id)
    const got = (await store.listTasks()).find((x) => x.id === t.id)
    expect(got?.checklist).toEqual([])
  })

  it("updateTask normalizes and persists the checklist as a real jsonb array", async () => {
    const t = await store.createTask({ title: "checklist task" })
    await store.updateTask(t.id, { checklist: [
      { id: "a", text: "  keep  ", checked: true },
      { id: "b", text: "   ", checked: false }, // blank text → dropped
      { id: "", text: "no id", checked: false }, // no id → dropped
    ] })
    const got = (await store.listTasks()).find((x) => x.id === t.id)
    expect(got?.checklist).toEqual([{ id: "a", text: "keep", checked: true }])
  })

  it("soft delete hides from listTasks, shows in recycle bin, and restores", async () => {
    const t = await store.createTask({ title: "to delete" })
    await store.deleteTask(t.id)
    expect((await store.listTasks()).find((x) => x.id === t.id)).toBeUndefined()
    expect((await store.listDeletedTasks()).find((x) => x.id === t.id)).toBeTruthy()
    await store.restoreTask(t.id)
    expect((await store.listTasks()).find((x) => x.id === t.id)).toBeTruthy()
    expect((await store.listDeletedTasks()).find((x) => x.id === t.id)).toBeUndefined()
  })

  it("comments: add (ordered), count via _count, delete", async () => {
    const t = await store.createTask({ title: "with comments" })
    await store.addComment(t.id, userId, "  first  ")
    await store.addComment(t.id, userId, "second")
    const comments = await store.listComments(t.id)
    expect(comments.map((c) => c.body)).toEqual(["first", "second"]) // trimmed + ordered asc
    expect(comments[0].author?.id).toBe(userId)
    const got = (await store.listTasks()).find((x) => x.id === t.id)
    expect(got?.commentCount).toBe(2)
    await store.deleteComment(comments[0].id)
    expect((await store.listComments(t.id)).length).toBe(1)
    await expect(store.addComment(t.id, userId, "   ")).rejects.toBeInstanceOf(store.TaskError)
  })

  it("purge cascade-deletes the task's comments", async () => {
    const t = await store.createTask({ title: "purge me" })
    await store.deleteTask(t.id)
    await store.addComment(t.id, userId, "orphan-to-be")
    await store.purgeTask(t.id)
    const remaining = await prisma.taskComment.count({ where: { taskId: t.id } })
    expect(remaining).toBe(0)
    expect(await prisma.task.findUnique({ where: { id: t.id } })).toBeNull()
  })

  it("moveTask sets status and an explicit drag position", async () => {
    const t = await store.createTask({ title: "drag me" })
    const moved = await store.moveTask(t.id, "DONE", -5)
    expect(moved.status).toBe("DONE")
    expect(moved.position).toBe(-5)
  })

  it("persists color + colorLabel and clears the label when color is removed", async () => {
    const t = await store.createTask({ title: "colored", color: "#ef4444", colorLabel: "  bug  " })
    let got = (await store.listTasks()).find((x) => x.id === t.id)
    expect(got?.color).toBe("#ef4444")
    expect(got?.colorLabel).toBe("bug")
    await store.updateTask(t.id, { color: "" })
    got = (await store.listTasks()).find((x) => x.id === t.id)
    expect(got?.color).toBe("")
    expect(got?.colorLabel).toBe("") // cleared with the color
  })

  it("assignTask rejects an inactive/unknown user and clears on null", async () => {
    const t = await store.createTask({ title: "assign me" })
    await expect(store.assignTask(t.id, "does-not-exist")).rejects.toBeInstanceOf(store.TaskError)
    const assigned = await store.assignTask(t.id, userId)
    expect(assigned.owner?.id).toBe(userId)
    const cleared = await store.assignTask(t.id, null)
    expect(cleared.owner).toBeNull()
  })
})
