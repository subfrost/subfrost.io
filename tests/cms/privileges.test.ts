import { describe, it, expect } from "vitest"
import {
  ALL_PRIVILEGES, PRIVILEGE_LABELS,
  rolePrivileges, effectivePrivileges, roleRank, canManageRole, assignableRoles,
} from "@/lib/cms/privileges"
import { RESTRICTED_PRIVILEGES } from "@/lib/cms/iam/registry"

describe("ALL_PRIVILEGES", () => {
  it("are namespaced domain.action codes with labels", () => {
    for (const p of ["fuel.read", "fuel.edit", "referral.read", "iam.list_users", "iam.modify_user"]) {
      expect(ALL_PRIVILEGES).toContain(p)
    }
    for (const p of ALL_PRIVILEGES) {
      expect(p).toMatch(/^[a-z]+\.[a-z_]+$/)
      expect(PRIVILEGE_LABELS[p]).toBeTruthy()
    }
  })
})

describe("effectivePrivileges (dependency graph + legacy resolution)", () => {
  it("closes over implies: fuel.edit pulls in fuel.read", () => {
    const eff = effectivePrivileges("STAFF", ["fuel.edit"])
    expect(eff).toContain("fuel.edit")
    expect(eff).toContain("fuel.read")
  })
  it("iam.modify_user implies iam.list_users", () => {
    expect(effectivePrivileges("STAFF", ["iam.modify_user"])).toContain("iam.list_users")
  })
  it("resolves legacy enum codes: FUEL_EDIT → fuel.read + fuel.edit", () => {
    const eff = effectivePrivileges("STAFF", ["FUEL_EDIT"])
    expect(eff).toContain("fuel.read")
    expect(eff).toContain("fuel.edit")
  })
  it("resolves a coarse legacy grant: MANAGE_USERS → the iam set", () => {
    const eff = effectivePrivileges("STAFF", ["MANAGE_USERS"])
    for (const c of ["iam.list_users", "iam.create_user", "iam.modify_user", "iam.delete_user"]) {
      expect(eff).toContain(c)
    }
  })
  it("de-duplicates", () => {
    const eff = effectivePrivileges("STAFF", ["fuel.read", "fuel.read"])
    expect(eff.filter((p) => p === "fuel.read")).toHaveLength(1)
  })
})

describe("role bundles", () => {
  it("STAFF is empty", () => {
    expect(rolePrivileges("STAFF")).toEqual([])
  })
  it("ADMIN gets every privilege EXCEPT restricted ones", () => {
    const adminEff = new Set(effectivePrivileges("ADMIN"))
    const expected = new Set(ALL_PRIVILEGES.filter((p) => !RESTRICTED_PRIVILEGES.includes(p)))
    expect(adminEff).toEqual(expected)
    // treasury is restricted → not auto-granted to ADMIN
    expect(adminEff.has("billing.treasury_view")).toBe(false)
  })
  it("restricted privileges apply only via explicit grant", () => {
    expect(effectivePrivileges("ADMIN", ["billing.treasury_view"])).toContain("billing.treasury_view")
    expect(RESTRICTED_PRIVILEGES).toContain("billing.treasury_view")
  })
  it("EDITOR/AUTHOR are content-only (no operational domains)", () => {
    const editor = effectivePrivileges("EDITOR")
    expect(editor).toContain("articles.publish")
    expect(editor).toContain("articles.write")
    expect(editor).not.toContain("fuel.read")
    expect(effectivePrivileges("AUTHOR")).toEqual(["articles.write"])
  })
})

describe("ranks", () => {
  it("STAFF < AUTHOR < EDITOR < ADMIN", () => {
    expect(roleRank("STAFF")).toBeLessThan(roleRank("AUTHOR"))
    expect(roleRank("AUTHOR")).toBeLessThan(roleRank("EDITOR"))
    expect(roleRank("EDITOR")).toBeLessThan(roleRank("ADMIN"))
  })
  it("assignableRoles(ADMIN) excludes ADMIN", () => {
    expect(new Set(assignableRoles("ADMIN"))).toEqual(new Set(["STAFF", "AUTHOR", "EDITOR"]))
  })
  it("canManageRole is strict by rank", () => {
    expect(canManageRole("ADMIN", "EDITOR")).toBe(true)
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false)
    expect(canManageRole("EDITOR", "ADMIN")).toBe(false)
  })
})
