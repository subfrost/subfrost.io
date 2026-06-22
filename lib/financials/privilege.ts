import type { Privilege } from "@prisma/client"

/** The privilege that unlocks the Financials section.
 *  PLACEHOLDER: gates on VIEW_AUDIT (admin-tier) until flex's IAM lands a
 *  dedicated, auditor-grantable financials privilege — then swap this one
 *  constant (the nav leaf, the action, and the page all read it). */
export const FINANCIALS_PRIVILEGE: Privilege = "VIEW_AUDIT"
