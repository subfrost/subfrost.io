import { describe, it, expect } from "vitest"
import { expandGrants } from "@/scripts/backfill-granular-privileges"

describe("expandGrants", () => {
  it("mapeia MANAGE_FUEL → FUEL_VIEW+FUEL_EDIT e remove o legado", () => {
    expect(new Set(expandGrants(["MANAGE_FUEL"]))).toEqual(new Set(["FUEL_VIEW", "FUEL_EDIT"]))
  })
  it("preserva grants já granulares e de-dupa", () => {
    expect(new Set(expandGrants(["FUEL_VIEW", "MANAGE_FUEL"]))).toEqual(new Set(["FUEL_VIEW", "FUEL_EDIT"]))
  })
  it("não toca grants sem mapeamento", () => {
    expect(expandGrants(["VIEW_AUDIT"])).toEqual(["VIEW_AUDIT"])
  })
})
