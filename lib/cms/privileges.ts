// Capability model for the CMS. Roles are convenient bundles; the real
// authorization unit is the Privilege. A user's *effective* privileges are the
// union of their role's default bundle and any extra grants on User.privileges.
// API-key scopes are a subset of the owner's effective privileges.
//
// This mirrors sprimage's role + privileges layer so "editor privilege" and
// "IAM privilege" are real, grantable, checkable capabilities.

import type { Privilege, Role } from "@prisma/client"

export type { Privilege, Role }

// All privileges, ordered roughly low → high power. Used for UI rendering.
export const ALL_PRIVILEGES: Privilege[] = [
  "WRITE_ARTICLES",
  "EDIT_ANY_ARTICLE",
  "PUBLISH_ARTICLES",
  "EDIT_BIO",
  "MANAGE_API_KEYS",
  "VIEW_AUDIT",
  "MANAGE_USERS",
  "MANAGE_ROLES",
  "MANAGE_REFERRAL_CODES",
  "MANAGE_FUEL",
]

// Human labels for the admin UI.
export const PRIVILEGE_LABELS: Record<Privilege, string> = {
  WRITE_ARTICLES: "Write articles",
  EDIT_ANY_ARTICLE: "Edit any article",
  PUBLISH_ARTICLES: "Publish & feature",
  EDIT_BIO: "Edit public profile (bio)",
  MANAGE_API_KEYS: "Manage API keys",
  VIEW_AUDIT: "View audit log",
  MANAGE_USERS: "Manage users (IAM)",
  MANAGE_ROLES: "Assign roles & privileges",
  MANAGE_REFERRAL_CODES: "Manage referral codes",
  MANAGE_FUEL: "Manage FUEL allocations",
}

// Default privilege bundle per role.
const ROLE_PRIVILEGES: Record<Role, Privilege[]> = {
  AUTHOR: ["WRITE_ARTICLES"],
  EDITOR: [
    "WRITE_ARTICLES",
    "EDIT_ANY_ARTICLE",
    "PUBLISH_ARTICLES",
    "EDIT_BIO",
    "MANAGE_API_KEYS",
  ],
  ADMIN: [...ALL_PRIVILEGES],
}

export function rolePrivileges(role: Role): Privilege[] {
  return ROLE_PRIVILEGES[role] ?? []
}

/** Effective privileges = role bundle ∪ extra grants, de-duplicated. */
export function effectivePrivileges(role: Role, extra: Privilege[] = []): Privilege[] {
  return [...new Set([...rolePrivileges(role), ...extra])]
}

export function hasPrivilege(
  role: Role,
  extra: Privilege[],
  required: Privilege,
): boolean {
  return effectivePrivileges(role, extra).includes(required)
}

// Role hierarchy for "can this actor manage that target" decisions.
const RANK: Record<Role, number> = { AUTHOR: 1, EDITOR: 2, ADMIN: 3 }

export function roleRank(role: Role): number {
  return RANK[role] ?? 0
}

/** An actor may manage a target only if they strictly outrank them. Equal-rank
 *  (incl. self) returns false — self-service paths are handled explicitly. */
export function canManageRole(actor: Role, target: Role): boolean {
  return roleRank(actor) > roleRank(target)
}

/** Roles an actor is allowed to assign — strictly below their own rank. */
export function assignableRoles(actor: Role): Role[] {
  return (Object.keys(RANK) as Role[]).filter((r) => roleRank(actor) > roleRank(r))
}
