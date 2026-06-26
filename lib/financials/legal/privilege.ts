import type { CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"

/** Three-tier legal ladder (registry: superuser ⊃ edit ⊃ view, all RESTRICTED). */
export const LEGAL_VIEW: Privilege = "legal.view"
export const LEGAL_EDIT: Privilege = "legal.edit"
export const LEGAL_SUPERUSER: Privilege = "legal.superuser"

/** Three-tier financials ladder. financials.view remains the section gate; edit
 *  /superuser imply it, so existing `financials.view` checks keep working. */
export const FINANCIALS_VIEW: Privilege = "financials.view"
export const FINANCIALS_EDIT: Privilege = "financials.edit"
export const FINANCIALS_SUPERUSER: Privilege = "financials.superuser"

/** Holds at least the view tier of the legal ladder. Because edit/superuser
 *  imply view, a single `legal.view` membership check covers all three tiers. */
export function hasLegal(user: Pick<CmsUser, "privileges">): boolean {
  return user.privileges.includes(LEGAL_VIEW)
}
export function canEditLegal(user: Pick<CmsUser, "privileges">): boolean {
  return user.privileges.includes(LEGAL_EDIT)
}
export function isLegalSuperuser(user: Pick<CmsUser, "privileges">): boolean {
  return user.privileges.includes(LEGAL_SUPERUSER)
}
export function hasFinancials(user: Pick<CmsUser, "privileges">): boolean {
  return user.privileges.includes(FINANCIALS_VIEW)
}

/** The reconciliation surface (invoices ↔ on-chain DIESEL payments) is the one
 *  view flex gated on holding a legal tier AND a financials tier — not either
 *  alone. Both ladders collapse to their `.view` member via `implies`. */
export function hasLegalAndFinancials(user: Pick<CmsUser, "privileges">): boolean {
  return hasLegal(user) && hasFinancials(user)
}
