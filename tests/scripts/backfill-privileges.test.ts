import { describe, it, expect } from "vitest"
import { expandGrants } from "@/scripts/backfill-granular-privileges"

describe("expandGrants (legacy enum → dotted codes)", () => {
  it("mapeia o grant grosso MANAGE_FUEL → fuel.read + fuel.edit", () => {
    expect(new Set(expandGrants(["MANAGE_FUEL"]))).toEqual(new Set(["fuel.read", "fuel.edit"]))
  })
  it("mapeia MANAGE_USERS → o conjunto granular de iam", () => {
    expect(new Set(expandGrants(["MANAGE_USERS"]))).toEqual(
      new Set(["iam.list_users", "iam.create_user", "iam.modify_user", "iam.delete_user"]),
    )
  })
  it("mapeia um código de enum simples (FUEL_VIEW → fuel.read)", () => {
    expect(expandGrants(["FUEL_VIEW"])).toEqual(["fuel.read"])
  })
  it("preserva códigos já pontilhados e de-dupa", () => {
    expect(new Set(expandGrants(["fuel.read", "fuel.edit", "fuel.read"]))).toEqual(
      new Set(["fuel.read", "fuel.edit"]),
    )
  })
  it("descarta códigos desconhecidos", () => {
    expect(expandGrants(["audit.view", "NONSENSE"])).toEqual(["audit.view"])
  })
})
