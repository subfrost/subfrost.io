import { describe, it, expect } from "vitest"
import { PERSONAS, applyPersona, personaGrantable, type Persona } from "@/lib/cms/iam/personas"

const ALL = ["articles.write", "articles.edit_any", "articles.publish", "fuel.read"]
const byKey = (k: string) => PERSONAS.find((p) => p.key === k) as Persona

describe("PERSONAS", () => {
  it("defines the two article tiers", () => {
    expect(byKey("articles_editor").privileges).toEqual(["articles.write"])
    expect(byKey("articles_superuser").privileges).toEqual(["articles.edit_any"])
  })
})

describe("applyPersona", () => {
  it("superuser pulls in the implied base write capability", () => {
    const result = applyPersona([], byKey("articles_superuser"), ALL)
    expect(result).toContain("articles.edit_any")
    expect(result).toContain("articles.write") // via implies/expand
  })
  it("is additive — keeps unrelated existing grants and de-dupes", () => {
    const result = applyPersona(["fuel.read", "articles.write"], byKey("articles_editor"), ALL)
    expect(result).toContain("fuel.read")
    expect(result.filter((c) => c === "articles.write")).toHaveLength(1)
  })
  it("caps to grantable — drops privileges the actor can't grant", () => {
    const result = applyPersona([], byKey("articles_superuser"), ["articles.write"])
    expect(result).not.toContain("articles.edit_any")
  })
})

describe("personaGrantable", () => {
  it("false when an expanded privilege is outside grantable", () => {
    expect(personaGrantable(byKey("articles_superuser"), ["articles.write"])).toBe(false)
  })
  it("true when the full expanded set is grantable", () => {
    expect(personaGrantable(byKey("articles_superuser"), ALL)).toBe(true)
  })
})
