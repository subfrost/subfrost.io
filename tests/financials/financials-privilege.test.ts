import { describe, it, expect } from "vitest"
import { effectivePrivileges } from "@/lib/cms/privileges"
import { RESTRICTED_PRIVILEGES, VIEW_GATES } from "@/lib/cms/iam/registry"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"

// Financials (treasury holdings + the DIESEL accounting ledger) is gated on a
// RESTRICTED privilege, mirroring the treasury restriction flex shipped in #65:
// it is granted explicitly per-user and is NOT conferred by the ADMIN role.
describe("FINANCIALS_PRIVILEGE", () => {
  it("is the restricted financials.view code", () => {
    expect(FINANCIALS_PRIVILEGE).toBe("financials.view")
    expect(RESTRICTED_PRIVILEGES).toContain("financials.view")
  })

  it("is NOT auto-granted to the ADMIN role bundle", () => {
    expect(effectivePrivileges("ADMIN")).not.toContain(FINANCIALS_PRIVILEGE)
  })

  it("applies only via an explicit per-user grant", () => {
    expect(effectivePrivileges("ADMIN", [FINANCIALS_PRIVILEGE])).toContain(FINANCIALS_PRIVILEGE)
  })

  it("gates both Financials routes in VIEW_GATES", () => {
    expect(VIEW_GATES["/admin/financials/treasury"].view).toBe(FINANCIALS_PRIVILEGE)
    expect(VIEW_GATES["/admin/financials/accounting"].view).toBe(FINANCIALS_PRIVILEGE)
  })
})
