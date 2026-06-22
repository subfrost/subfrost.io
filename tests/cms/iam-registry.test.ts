import { describe, it, expect } from "vitest"
import {
  PRIVILEGES, ALL_CODES, CATEGORIES, VIEW_GATES,
  expand, resolveCode, impliedExtras, privilegeDef,
} from "@/lib/cms/iam/registry"

describe("IAM registry", () => {
  it("every privilege is a dotted code with a known category and a description", () => {
    const catKeys = new Set(CATEGORIES.map((c) => c.key))
    for (const p of PRIVILEGES) {
      expect(p.code).toMatch(/^[a-z]+\.[a-z_]+$/)
      expect(catKeys.has(p.category)).toBe(true)
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
    }
    expect(new Set(ALL_CODES).size).toBe(ALL_CODES.length) // unique
  })

  it("implies references only resolve to real codes", () => {
    for (const p of PRIVILEGES) {
      for (const dep of p.implies) expect(privilegeDef(dep)).toBeTruthy()
    }
  })

  it("expand() computes the transitive closure", () => {
    expect(new Set(expand(["fuel.edit"]))).toEqual(new Set(["fuel.edit", "fuel.read"]))
    // delete_user → modify_user → list_users
    expect(new Set(expand(["iam.delete_user"]))).toEqual(
      new Set(["iam.delete_user", "iam.modify_user", "iam.list_users"]),
    )
  })

  it("impliedExtras excludes the code itself", () => {
    expect(impliedExtras("fuel.edit")).toEqual(["fuel.read"])
    expect(impliedExtras("audit.view")).toEqual([])
  })

  it("resolveCode maps legacy enum codes and drops unknowns", () => {
    expect(resolveCode("FUEL_EDIT")).toEqual(["fuel.edit"])
    expect(new Set(resolveCode("MANAGE_USERS"))).toEqual(
      new Set(["iam.list_users", "iam.create_user", "iam.modify_user", "iam.delete_user"]),
    )
    expect(resolveCode("fuel.read")).toEqual(["fuel.read"]) // pass-through
    expect(resolveCode("NONSENSE")).toEqual([])
  })

  it("every gated VIEW maps to real privilege codes", () => {
    for (const gate of Object.values(VIEW_GATES)) {
      if (gate.view) expect(privilegeDef(gate.view)).toBeTruthy()
      if (gate.edit) expect(privilegeDef(gate.edit)).toBeTruthy()
    }
    // the IAM-managed views are all present
    expect(VIEW_GATES["/admin/users"].view).toBe("iam.list_users")
    expect(VIEW_GATES["/admin/fuel"].edit).toBe("fuel.edit")
  })
})
