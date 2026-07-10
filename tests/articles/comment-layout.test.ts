import { describe, it, expect } from "vitest"
import {
  layoutCards,
  orderThreadsByAnchor,
  partitionThreads,
  isInsideAny,
  type Thread,
} from "@/lib/cms/comment-layout"

function thread(
  id: string,
  start: number | null,
  status: Thread["root"]["status"] = "OPEN",
  createdAt = "2026-01-01T00:00:00.000Z",
): Thread {
  return {
    root: {
      id, articleId: "a", versionId: null, locale: "en",
      author: { id: "u", name: "U", avatarUrl: null },
      anchor: (start == null
        ? undefined
        : { quote: "q", prefix: "", suffix: "", blockIndex: 0, start, end: start + 1 }) as Thread["root"]["anchor"],
      body: "b", status, parentId: null, createdAt, updatedAt: createdAt,
    },
    replies: [],
  }
}

describe("layoutCards", () => {
  it("returns an empty map for no cards", () => {
    expect(layoutCards([], null, 10).size).toBe(0)
  })

  it("places a single card at its desired top", () => {
    const out = layoutCards([{ id: "a", top: 42, height: 30 }], null, 10)
    expect(out.get("a")).toBe(42)
  })

  it("leaves non-overlapping cards at their desired tops (no focus)", () => {
    const out = layoutCards(
      [{ id: "a", top: 0, height: 50 }, { id: "b", top: 100, height: 50 }],
      null, 10,
    )
    expect(out.get("a")).toBe(0)
    expect(out.get("b")).toBe(100)
  })

  it("pushes an overlapping lower card down by the gap (no focus)", () => {
    const out = layoutCards(
      [{ id: "a", top: 0, height: 50 }, { id: "b", top: 30, height: 40 }],
      null, 10,
    )
    expect(out.get("a")).toBe(0)
    expect(out.get("b")).toBe(60) // 0 + 50 + 10
  })

  it("pins the focused card and makes neighbours cede space", () => {
    const out = layoutCards(
      [
        { id: "a", top: 0, height: 100 },
        { id: "b", top: 50, height: 40 },
        { id: "c", top: 60, height: 100 },
      ],
      "b", 10,
    )
    expect(out.get("b")).toBe(50)          // pinned at desired
    expect(out.get("c")).toBe(100)         // below: max(60, 50+40+10)
    expect(out.get("a")).toBe(-60)         // above: min(0, 50-10-100)
  })
})

describe("orderThreadsByAnchor", () => {
  it("sorts by anchor.start, null anchors last", () => {
    const ids = orderThreadsByAnchor([thread("c", 30), thread("a", 10), thread("z", null), thread("b", 20)])
      .map((t) => t.root.id)
    expect(ids).toEqual(["a", "b", "c", "z"])
  })
})

describe("partitionThreads", () => {
  it("buckets by status and orders open by anchor", () => {
    const p = partitionThreads([
      thread("r", 5, "RESOLVED"),
      thread("o2", 40, "OPEN"),
      thread("orph", 0, "ORPHANED"),
      thread("o1", 10, "OPEN"),
    ])
    expect(p.open.map((t) => t.root.id)).toEqual(["o1", "o2"])
    expect(p.resolved.map((t) => t.root.id)).toEqual(["r"])
    expect(p.orphaned.map((t) => t.root.id)).toEqual(["orph"])
  })
})

describe("isInsideAny", () => {
  it("is true only when target is contained by an element", () => {
    const outer = document.createElement("div")
    const inner = document.createElement("span")
    outer.appendChild(inner)
    const other = document.createElement("div")
    expect(isInsideAny(inner, [outer])).toBe(true)
    expect(isInsideAny(inner, [other, null, undefined])).toBe(false)
    expect(isInsideAny(null, [outer])).toBe(false)
  })
})
