import { describe, it, expect } from "vitest"
import { insertAtCursor, replaceFirst } from "@/lib/cms/markdown-insert"

describe("insertAtCursor", () => {
  it("inserts at the caret and reports the new caret position", () => {
    const r = insertAtCursor("hello world", 5, 5, "X")
    expect(r.text).toBe("helloX world")
    expect(r.cursor).toBe(6)
  })
  it("replaces a selection range", () => {
    const r = insertAtCursor("hello world", 0, 5, "hi")
    expect(r.text).toBe("hi world")
    expect(r.cursor).toBe(2)
  })
})

describe("replaceFirst", () => {
  it("replaces only the first occurrence of the token", () => {
    expect(replaceFirst("a [T] b [T]", "[T]", "X")).toBe("a X b [T]")
  })
  it("returns the text unchanged when the token is absent", () => {
    expect(replaceFirst("abc", "[T]", "X")).toBe("abc")
  })
})
