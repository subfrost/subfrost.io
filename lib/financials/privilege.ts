import type { Privilege } from "@/lib/cms/privileges"

/** The privilege that unlocks the Financials section (Treasury holdings + the
 *  DIESEL accounting ledger). `financials.view` is a RESTRICTED privilege
 *  (lib/cms/iam/registry.ts): it is NOT in the ADMIN role bundle, so it is
 *  granted explicitly per-user — mirroring the treasury restriction flex
 *  established in #65. The nav leaves, the actions, and the pages all read this
 *  one constant. Rollout: grant `financials.view` to the intended auditors at
 *  deploy, else nobody (incl. ADMINs) sees Financials. */
export const FINANCIALS_PRIVILEGE: Privilege = "financials.view"
