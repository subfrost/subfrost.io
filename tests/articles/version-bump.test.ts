import { describe, it, expect } from "vitest"
import { bumpVersion, stageForStatus } from "@/lib/cms/article-versions"

// In-memory stand-in for prisma's `articleVersion` delegate so bumpVersion is
// testable without a database (it accepts an injected db/tx client).
function makeDb() {
  const rows: any[] = []
  return {
    rows,
    articleVersion: {
      async findFirst({ where, orderBy: _orderBy }: any) {
        const m = rows
          .filter((r) => r.articleId === where.articleId && r.locale === where.locale)
          .sort((a, b) => b.number - a.number)
        return m[0] ?? null
      },
      async create({ data }: any) {
        const row = { id: `v${rows.length + 1}`, createdAt: new Date(), ...data }
        rows.push(row)
        return row
      },
    },
  }
}

describe("bumpVersion", () => {
  it("maps article status to a version stage", () => {
    expect(stageForStatus("PUBLISHED")).toBe("PUBLISHED")
    expect(stageForStatus("REVIEW")).toBe("REVIEW")
    expect(stageForStatus("DRAFT")).toBe("DRAFT")
    expect(stageForStatus("ARCHIVED")).toBe("DRAFT")
  })

  it("increments the version number per locale and only on real change", async () => {
    const db = makeDb() as any
    const base = { articleId: "a1", stage: "DRAFT" as const, editorId: "u1" }

    const v1 = await bumpVersion({ ...base, locale: "en" as const, title: "Hello", body: "First body" }, db)
    expect(v1?.number).toBe(1)

    // No-op: identical title/body/stage → no new version.
    const noop = await bumpVersion({ ...base, locale: "en" as const, title: "Hello", body: "First body" }, db)
    expect(noop).toBeNull()

    // Independent numbering per locale.
    const zh1 = await bumpVersion({ ...base, locale: "zh" as const, title: "你好", body: "内容" }, db)
    expect(zh1?.number).toBe(1)

    // Real body change → v2 for en.
    const v2 = await bumpVersion({ ...base, locale: "en" as const, title: "Hello", body: "Edited body" }, db)
    expect(v2?.number).toBe(2)

    // Stage transition alone → v3.
    const v3 = await bumpVersion({ ...base, locale: "en" as const, title: "Hello", body: "Edited body", stage: "REVIEW" }, db)
    expect(v3?.number).toBe(3)
    expect(v3?.stage).toBe("REVIEW")

    const enRows = db.rows.filter((r: any) => r.locale === "en")
    expect(enRows.map((r: any) => r.number)).toEqual([1, 2, 3])
  })
})
