/**
 * IAM registry — the single source of truth for the admin platform's privileges.
 *
 * Privileges are namespaced `domain.action` codes (e.g. `iam.modify_user`,
 * `fuel.edit`). Each has an English description, a category, and a static
 * dependency graph (`implies`): granting a privilege auto-grants everything it
 * implies (transitively). Every navigable admin view maps to a privilege here
 * via VIEW_GATES, so gating is defined in one place.
 *
 * This module is pure data + pure functions (no React/icon imports) so it can be
 * used by server gating, the data migration, and the client picker alike. Icons
 * live in ./icons (client-only).
 */

export type PrivilegeCode = string

export interface PrivilegeDef {
  code: PrivilegeCode
  label: string
  description: string
  category: CategoryKey
  /** Direct dependencies — granting this implies these (closure via expand()). */
  implies: PrivilegeCode[]
}

export type CategoryKey =
  | "articles"
  | "iam"
  | "apikeys"
  | "audit"
  | "community"
  | "compliance"
  | "billing"
  | "financials"
  | "legal"
  | "files"
  | "marketing"
  | "tasks"
  | "ecosystem"
  | "system"

export interface CategoryDef {
  key: CategoryKey
  label: string
}

export const CATEGORIES: CategoryDef[] = [
  { key: "iam", label: "Identity & Access" },
  { key: "articles", label: "Articles" },
  { key: "tasks", label: "Board" },
  { key: "community", label: "Community" },
  { key: "compliance", label: "Compliance" },
  { key: "billing", label: "Billing" },
  { key: "financials", label: "Financials" },
  { key: "legal", label: "Legal" },
  { key: "files", label: "Documents" },
  { key: "marketing", label: "Marketing" },
  { key: "ecosystem", label: "Ecosystem" },
  { key: "system", label: "System" },
  { key: "apikeys", label: "API keys" },
  { key: "audit", label: "Audit" },
]

export const PRIVILEGES: PrivilegeDef[] = [
  // --- Identity & Access ---
  { code: "iam.list_users", label: "List users", description: "View the user directory and each member's roles and privileges.", category: "iam", implies: [] },
  { code: "iam.create_user", label: "Create users", description: "Invite or create new admin users and issue onboarding credentials.", category: "iam", implies: ["iam.list_users"] },
  { code: "iam.modify_user", label: "Modify users", description: "Edit a user's name, status, role, and privilege grants; reset passwords.", category: "iam", implies: ["iam.list_users"] },
  { code: "iam.delete_user", label: "Delete users", description: "Permanently remove a user from the system.", category: "iam", implies: ["iam.list_users", "iam.modify_user"] },
  { code: "iam.manage_roles", label: "Assign roles & privileges", description: "Change a user's role and grant or revoke any privilege you hold.", category: "iam", implies: ["iam.list_users", "iam.modify_user"] },
  { code: "iam.manage_sessions", label: "Manage sessions & devices", description: "View any user's active sessions and the devices/TLS fingerprints they're signed in from, and revoke them.", category: "iam", implies: ["iam.list_users"] },

  // --- Articles ---
  { code: "articles.write", label: "Articles editor", description: "Create and edit only your own article drafts and submit them for review.", category: "articles", implies: [] },
  { code: "articles.edit_any", label: "Articles superuser", description: "Manage, edit, and delete any author's articles.", category: "articles", implies: ["articles.write"] },
  { code: "articles.publish", label: "Publish & feature", description: "Publish, unpublish, and feature articles on the homepage.", category: "articles", implies: ["articles.write"] },
  { code: "articles.edit_bio", label: "Edit public profile", description: "Maintain your public author byline — bio, avatar, and social handle.", category: "articles", implies: [] },

  // --- Board (tasks) ---
  { code: "tasks.view", label: "Board — view", description: "View the team task board and initiatives.", category: "tasks", implies: [] },
  { code: "tasks.edit", label: "Board — edit", description: "Create, claim, move, and edit tasks and initiatives.", category: "tasks", implies: ["tasks.view"] },

  // --- Community ---
  { code: "referral.read", label: "Referral codes — view", description: "View the referral code hierarchy, owners, and redemptions.", category: "community", implies: [] },
  { code: "referral.edit", label: "Referral codes — edit", description: "Create, bulk-generate, edit, and revoke referral codes.", category: "community", implies: ["referral.read"] },
  { code: "fuel.read", label: "FUEL — view", description: "View FUEL allocations and the community distribution dashboard.", category: "community", implies: [] },
  { code: "fuel.edit", label: "FUEL — edit", description: "Create, edit, and delete FUEL allocations and address notes.", category: "community", implies: ["fuel.read"] },

  // --- Compliance ---
  { code: "aml.read", label: "Compliance — view", description: "View KYC intakes, FinCEN filings, and MTL licensing records.", category: "compliance", implies: [] },
  { code: "aml.edit", label: "Compliance — edit", description: "Disposition KYC, draft/queue FinCEN filings, and manage MTL records.", category: "compliance", implies: ["aml.read"] },
  { code: "documents.read", label: "Documents — view", description: "View the e-sign document inbox: envelopes, recipients, and signing status.", category: "compliance", implies: [] },
  { code: "documents.write", label: "Documents — send", description: "Create and send envelopes for signature, void, resend, and link signed paperwork to payees.", category: "compliance", implies: ["documents.read"] },
  { code: "documents.view_all", label: "Documents — view all", description: "See every e-sign envelope and the org-wide activity timeline, not just ones you created.", category: "compliance", implies: ["documents.read"] },
  { code: "compliance.reviews", label: "Reviewer links — manage", description: "Mint, list, and revoke delegated external-reviewer links to the compliance surfaces.", category: "compliance", implies: [] },

  // --- Billing ---
  { code: "billing.read", label: "Billing — view", description: "View Stripe subscriptions, promo codes, issuing, ramps, customers, and webhook events.", category: "billing", implies: [] },
  { code: "billing.edit", label: "Billing — edit", description: "Manage subscriptions, promo codes, money movement, and card controls.", category: "billing", implies: ["billing.read"] },
  { code: "billing.treasury_view", label: "Treasury — view", description: "View treasury balances, transactions, and the ACH transfer queue. Restricted: granted explicitly per-user, not by the ADMIN role.", category: "billing", implies: [] },
  { code: "pay.view", label: "SUBFROST Pay usage — view", description: "View the SUBFROST Pay usage event stream mirrored from the mobile-api backend (onboarding, cards, buys, offramp — non-PII).", category: "billing", implies: [] },

  // --- Financials (409A) ---
  { code: "financials.view", label: "Financials — view", description: "View the treasury holdings and the DIESEL accounting ledger for the 409A. Restricted: granted explicitly per-user, not by the ADMIN role.", category: "financials", implies: [] },
  { code: "financials.edit", label: "Financials — edit", description: "Record payees, invoices, DIESEL payments, equity instruments, and balance-sheet lines. Restricted.", category: "financials", implies: ["financials.view"] },
  { code: "financials.superuser", label: "Financials — superuser", description: "Full control of the financial record incl. reconciliation, ledger export, and destructive edits. Restricted.", category: "financials", implies: ["financials.edit"] },

  // --- Legal (entities, agreements, OYL/deserter scope) ---
  { code: "legal.view", label: "Legal — view", description: "View the legal-entity register: counterparties we've signed with, agreements, OYL deserters, and the Subfrost equity-swap scope. Restricted: granted explicitly per-user, not by the ADMIN role.", category: "legal", implies: [] },
  { code: "legal.edit", label: "Legal — edit", description: "Create and edit legal entities, agreements, deserter equity/DIESEL conversions, and swap sign-offs. Restricted.", category: "legal", implies: ["legal.view"] },
  { code: "legal.superuser", label: "Legal — superuser", description: "Full control of the legal record incl. deletion and finalizing Arca/Alec swap sign-offs. Restricted.", category: "legal", implies: ["legal.edit"] },

  // --- Documents (file manager) ---
  { code: "files.read", label: "Documents — view", description: "Browse and download files and folders in the document archive.", category: "files", implies: [] },
  { code: "files.edit", label: "Documents — manage", description: "Upload, rename, move, delete files and folders, and edit their metadata.", category: "files", implies: ["files.read"] },

  // --- Marketing ---
  { code: "marketing.view", label: "Marketing — view", description: "View and capture protocol marketing snapshots.", category: "marketing", implies: [] },

  // --- Ecosystem directory ---
  { code: "ecosystem.view", label: "Ecosystem — view", description: "View the Alkanes ecosystem project directory admin.", category: "ecosystem", implies: [] },
  { code: "ecosystem.edit", label: "Ecosystem — edit", description: "Create, edit, publish, and delete ecosystem projects; toggle the featured band.", category: "ecosystem", implies: ["ecosystem.view"] },

  // --- System ---
  { code: "system.view", label: "Site notice — view", description: "View the site notice / announcement control.", category: "system", implies: [] },
  { code: "system.edit", label: "Site notice — edit", description: "Turn the site notice on/off and edit its title/message.", category: "system", implies: ["system.view"] },

  // --- API keys ---
  { code: "apikeys.manage", label: "Manage API keys", description: "Mint and revoke scoped API keys for the article upload API.", category: "apikeys", implies: [] },

  // --- Audit ---
  { code: "audit.view", label: "View audit log", description: "Read the authentication, IAM, and key-management audit trail.", category: "audit", implies: [] },
]

export const ALL_CODES: PrivilegeCode[] = PRIVILEGES.map((p) => p.code)
const BY_CODE = new Map(PRIVILEGES.map((p) => [p.code, p]))

/** Privileges that are NOT auto-granted by the ADMIN role bundle — they must be
 *  granted explicitly per-user (and, per the escalation guard, only by someone
 *  who already holds them). Use for sensitive surfaces like the treasury. */
export const RESTRICTED_PRIVILEGES: PrivilegeCode[] = [
  "billing.treasury_view",
  "financials.view",
  "financials.edit",
  "financials.superuser",
  "legal.view",
  "legal.edit",
  "legal.superuser",
  // Files + E-Sign hold the full legal/financial document corpus (SAFEs, cap
  // table, tax forms, invoices). Restricted → NOT in the ADMIN bundle; granted
  // explicitly per-user so document visibility is tightly controlled.
  "files.read",
  "files.edit",
  "documents.read",
  "documents.write",
  "documents.view_all",
]

export function isRestricted(code: PrivilegeCode): boolean {
  return RESTRICTED_PRIVILEGES.includes(code)
}

export function privilegeDef(code: PrivilegeCode): PrivilegeDef | undefined {
  return BY_CODE.get(code)
}

/** Map a flat enum code (FUEL_EDIT, MANAGE_USERS, …) to the new dotted code(s).
 *  Lets stored data and code literals migrate without a lockout window — both
 *  old and new resolve through effectivePrivileges. */
export const LEGACY_MAP: Record<string, PrivilegeCode[]> = {
  WRITE_ARTICLES: ["articles.write"],
  EDIT_ANY_ARTICLE: ["articles.edit_any"],
  PUBLISH_ARTICLES: ["articles.publish"],
  EDIT_BIO: ["articles.edit_bio"],
  MANAGE_API_KEYS: ["apikeys.manage"],
  VIEW_AUDIT: ["audit.view"],
  USERS_VIEW: ["iam.list_users"],
  USERS_EDIT: ["iam.create_user", "iam.modify_user", "iam.delete_user"],
  MANAGE_ROLES: ["iam.manage_roles"],
  REFERRAL_VIEW: ["referral.read"],
  REFERRAL_EDIT: ["referral.edit"],
  FUEL_VIEW: ["fuel.read"],
  FUEL_EDIT: ["fuel.edit"],
  AML_VIEW: ["aml.read"],
  AML_EDIT: ["aml.edit"],
  BILLING_VIEW: ["billing.read"],
  BILLING_EDIT: ["billing.edit"],
  // Coarse legacy grants:
  MANAGE_USERS: ["iam.list_users", "iam.create_user", "iam.modify_user", "iam.delete_user"],
  MANAGE_REFERRAL_CODES: ["referral.read", "referral.edit"],
  MANAGE_FUEL: ["fuel.read", "fuel.edit"],
  MANAGE_AML: ["aml.read", "aml.edit"],
  MANAGE_BILLING: ["billing.read", "billing.edit"],
}

/** Normalize a stored/literal code: pass dotted codes through, translate any
 *  legacy enum code to its dotted equivalent(s). Unknown codes are dropped. */
export function resolveCode(code: string): PrivilegeCode[] {
  if (BY_CODE.has(code)) return [code]
  if (LEGACY_MAP[code]) return LEGACY_MAP[code]
  return []
}

/** Transitive closure of a set of codes over the `implies` graph, de-duplicated. */
export function expand(codes: string[]): PrivilegeCode[] {
  const out = new Set<PrivilegeCode>()
  const stack = codes.flatMap(resolveCode)
  while (stack.length) {
    const c = stack.pop()!
    if (out.has(c)) continue
    out.add(c)
    const def = BY_CODE.get(c)
    if (def) for (const dep of def.implies) if (!out.has(dep)) stack.push(dep)
  }
  return [...out]
}

/** What a chosen code pulls in beyond itself (for "also grants …" UI hints). */
export function impliedExtras(code: PrivilegeCode): PrivilegeCode[] {
  return expand([code]).filter((c) => c !== code)
}

// --- View gating: route → required privileges --------------------------------

export interface ViewGate {
  /** Privilege required to open/read the view (null = any signed-in user). */
  view: PrivilegeCode | null
  /** Privilege required to mutate within the view (null = same as view). */
  edit?: PrivilegeCode | null
}

export const VIEW_GATES: Record<string, ViewGate> = {
  "/admin": { view: null }, // Dashboard — universal landing
  "/admin/articles": { view: null, edit: "articles.write" },
  "/admin/communities": { view: "referral.read" },
  "/admin/fuel": { view: "fuel.read", edit: "fuel.edit" },
  "/admin/codes": { view: "referral.read", edit: "referral.edit" },
  "/admin/kyc": { view: "aml.read", edit: "aml.edit" },
  "/admin/fincen": { view: "aml.read", edit: "aml.edit" },
  "/admin/mtl": { view: "aml.read", edit: "aml.edit" },
  "/admin/files": { view: "files.read", edit: "files.edit" },
  "/admin/oyl": { view: "files.read", edit: "files.edit" },
  "/admin/documents": { view: "documents.read", edit: "documents.write" },
  "/admin/compliance/reviews": { view: "compliance.reviews", edit: "compliance.reviews" },
  "/admin/billing": { view: "billing.read", edit: "billing.edit" },
  "/admin/billing/treasury": { view: "billing.treasury_view", edit: "billing.edit" },
  "/admin/financials/treasury": { view: "financials.view" },
  "/admin/financials/accounting": { view: "financials.view", edit: "financials.edit" },
  "/admin/financials/cap-table": { view: "financials.view", edit: "financials.edit" },
  "/admin/financials/safes": { view: "financials.view", edit: "financials.edit" },
  "/admin/financials/balance-sheet": { view: "financials.view", edit: "financials.edit" },
  // Reconciliation requires BOTH a legal tier AND a financials tier; VIEW_GATES
  // models the financials side, the page enforces the legal-AND-financials rule
  // via requireLegalAndFinancials() in lib/financials/legal/privilege.ts.
  "/admin/financials/reconciliation": { view: "financials.view" },
  "/admin/legal": { view: "legal.view", edit: "legal.edit" },
  "/admin/legal/entities": { view: "legal.view", edit: "legal.edit" },
  "/admin/users": { view: "iam.list_users", edit: "iam.modify_user" },
  "/admin/api-keys": { view: "apikeys.manage" },
  "/admin/audit": { view: "audit.view" },
  "/admin/marketing/snapshots": { view: "marketing.view" },
  "/admin/marketing/cards": { view: "marketing.view" },
  "/admin/ecosystem": { view: "ecosystem.view", edit: "ecosystem.edit" },
  "/admin/board": { view: "tasks.view", edit: "tasks.edit" },
  "/admin/board/intake": { view: "tasks.view", edit: "tasks.edit" },
  "/admin/board/initiatives": { view: "tasks.view", edit: "tasks.edit" },
  "/admin/board/products": { view: "tasks.view", edit: "tasks.edit" },
  "/admin/notice": { view: "system.view", edit: "system.edit" },
}
