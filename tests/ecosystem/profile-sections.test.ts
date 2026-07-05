import { describe, it, expect } from "vitest"
import { splitProfileSections } from "@/lib/ecosystem/profile-sections"

describe("splitProfileSections", () => {
  it("returns everything as intro when there is no H2", () => {
    const md = "Just a paragraph.\n\nAnother one."
    expect(splitProfileSections(md)).toEqual({ intro: "Just a paragraph.\n\nAnother one.", sections: [] })
  })

  it("splits intro + sections on H2 lines", () => {
    const md = "Opening line.\n\n## Products\n\nBody A.\n\n## Reading on-chain data\n\nBody B."
    const out = splitProfileSections(md)
    expect(out.intro).toBe("Opening line.")
    expect(out.sections).toEqual([
      { title: "Products", body: "Body A." },
      { title: "Reading on-chain data", body: "Body B." },
    ])
  })

  it("does NOT split on ## inside code fences", () => {
    const md = "Intro.\n\n## Real\n\n```md\n## not a heading\n```\nafter fence."
    const out = splitProfileSections(md)
    expect(out.sections).toHaveLength(1)
    expect(out.sections[0].title).toBe("Real")
    expect(out.sections[0].body).toContain("## not a heading")
    expect(out.sections[0].body).toContain("after fence.")
  })

  it("handles empty intro (markdown starting at an H2) and ### is not a section", () => {
    const md = "## Only\n\nBody.\n\n### sub"
    const out = splitProfileSections(md)
    expect(out.intro).toBe("")
    expect(out.sections).toEqual([{ title: "Only", body: "Body.\n\n### sub" }])
  })
})
