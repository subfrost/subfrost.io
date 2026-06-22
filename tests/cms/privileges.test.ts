import { describe, it, expect } from "vitest"
import {
  ALL_PRIVILEGES, LEGACY_PRIVILEGE_MAP, PRIVILEGE_LABELS,
  rolePrivileges, effectivePrivileges, roleRank, canManageRole, assignableRoles,
} from "@/lib/cms/privileges"

describe("ALL_PRIVILEGES", () => {
  it("inclui os granulares novos e exclui os tombstones MANAGE_*", () => {
    for (const p of ["FUEL_VIEW","FUEL_EDIT","REFERRAL_VIEW","REFERRAL_EDIT","AML_VIEW","AML_EDIT","BILLING_VIEW","BILLING_EDIT","USERS_VIEW","USERS_EDIT"]) {
      expect(ALL_PRIVILEGES).toContain(p)
    }
    for (const t of ["MANAGE_FUEL","MANAGE_REFERRAL_CODES","MANAGE_AML","MANAGE_BILLING","MANAGE_USERS"]) {
      expect(ALL_PRIVILEGES).not.toContain(t)
    }
  })
  it("tem label legível pra todo privilege ativo", () => {
    for (const p of ALL_PRIVILEGES) expect(PRIVILEGE_LABELS[p]).toBeTruthy()
  })
})

describe("effectivePrivileges (shim legado)", () => {
  it("expande MANAGE_FUEL para FUEL_VIEW + FUEL_EDIT", () => {
    const eff = effectivePrivileges("STAFF", ["MANAGE_FUEL"])
    expect(eff).toContain("FUEL_VIEW")
    expect(eff).toContain("FUEL_EDIT")
    expect(eff).not.toContain("MANAGE_FUEL")
  })
  it("expande todos os tombstones do LEGACY_PRIVILEGE_MAP", () => {
    for (const [legacy, granular] of Object.entries(LEGACY_PRIVILEGE_MAP)) {
      const eff = effectivePrivileges("STAFF", [legacy as never])
      for (const g of granular!) expect(eff).toContain(g)
    }
  })
  it("não duplica quando o grant já é granular", () => {
    const eff = effectivePrivileges("STAFF", ["FUEL_VIEW", "FUEL_VIEW"])
    expect(eff.filter((p) => p === "FUEL_VIEW")).toHaveLength(1)
  })
})

describe("bundles de papel", () => {
  it("STAFF tem bundle vazio", () => {
    expect(rolePrivileges("STAFF")).toEqual([])
  })
  it("ADMIN recebe todos os privileges ativos", () => {
    expect(new Set(effectivePrivileges("ADMIN"))).toEqual(new Set(ALL_PRIVILEGES))
  })
  it("EDITOR e AUTHOR seguem só-conteúdo (sem domínios operacionais)", () => {
    const editor = effectivePrivileges("EDITOR")
    expect(editor).toContain("PUBLISH_ARTICLES")
    expect(editor).not.toContain("FUEL_VIEW")
    expect(effectivePrivileges("AUTHOR")).toEqual(["WRITE_ARTICLES"])
  })
})

describe("ranks", () => {
  it("STAFF < AUTHOR < EDITOR < ADMIN", () => {
    expect(roleRank("STAFF")).toBeLessThan(roleRank("AUTHOR"))
    expect(roleRank("AUTHOR")).toBeLessThan(roleRank("EDITOR"))
    expect(roleRank("EDITOR")).toBeLessThan(roleRank("ADMIN"))
  })
  it("assignableRoles(ADMIN) inclui STAFF, AUTHOR, EDITOR e não ADMIN", () => {
    expect(new Set(assignableRoles("ADMIN"))).toEqual(new Set(["STAFF", "AUTHOR", "EDITOR"]))
  })
  it("canManageRole é estrito por rank", () => {
    expect(canManageRole("ADMIN", "EDITOR")).toBe(true)
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false)
    expect(canManageRole("EDITOR", "ADMIN")).toBe(false)
  })
})
