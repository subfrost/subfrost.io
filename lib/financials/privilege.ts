import type { Privilege } from "@/lib/cms/privileges"

/** The privilege that unlocks the Financials section.
 *  PLACEHOLDER: gates on "audit.view" (admin-tier; in the ADMIN bundle) until
 *  flex's IAM lands a dedicated, auditor-grantable financials privilege — then
 *  swap this one constant (the nav leaf, the action, and the page all read it). */
export const FINANCIALS_PRIVILEGE: Privilege = "audit.view"
