// Capability model do CMS. Papéis são bundles convenientes; a unidade real de
// autorização é o Privilege. Privileges efetivos = bundle do papel ∪ grants extras
// (com grants legados MANAGE_* expandidos via LEGACY_PRIVILEGE_MAP).

import type { Privilege, Role } from "@prisma/client"

export type { Privilege, Role }

// Privileges ATIVOS, low → high power. Os MANAGE_* legados são tombstones:
// continuam no enum Postgres (back-compat) mas ficam fora daqui e da UI.
export const ALL_PRIVILEGES: Privilege[] = [
  "WRITE_ARTICLES",
  "EDIT_ANY_ARTICLE",
  "PUBLISH_ARTICLES",
  "EDIT_BIO",
  "MANAGE_API_KEYS",
  "VIEW_AUDIT",
  "USERS_VIEW",
  "USERS_EDIT",
  "MANAGE_ROLES",
  "REFERRAL_VIEW",
  "REFERRAL_EDIT",
  "FUEL_VIEW",
  "FUEL_EDIT",
  "AML_VIEW",
  "AML_EDIT",
  "BILLING_VIEW",
  "BILLING_EDIT",
]

// Grant grosso legado → conjunto granular. Usado pelo shim de effectivePrivileges
// e pelo script de backfill. Fica até a (opcional) fase de contract remover os tombstones.
export const LEGACY_PRIVILEGE_MAP: Partial<Record<Privilege, Privilege[]>> = {
  MANAGE_USERS: ["USERS_VIEW", "USERS_EDIT"],
  MANAGE_REFERRAL_CODES: ["REFERRAL_VIEW", "REFERRAL_EDIT"],
  MANAGE_FUEL: ["FUEL_VIEW", "FUEL_EDIT"],
  MANAGE_AML: ["AML_VIEW", "AML_EDIT"],
  MANAGE_BILLING: ["BILLING_VIEW", "BILLING_EDIT"],
}

// Labels p/ a UI. Precisa ser exaustivo sobre Privilege (Record do TS). Tombstones
// ganham label "(legacy)" mas nunca aparecem (fora de ALL_PRIVILEGES).
export const PRIVILEGE_LABELS: Record<Privilege, string> = {
  WRITE_ARTICLES: "Write articles",
  EDIT_ANY_ARTICLE: "Edit any article",
  PUBLISH_ARTICLES: "Publish & feature",
  EDIT_BIO: "Edit public profile (bio)",
  MANAGE_API_KEYS: "Manage API keys",
  VIEW_AUDIT: "View audit log",
  USERS_VIEW: "Users (IAM) — view",
  USERS_EDIT: "Users (IAM) — edit",
  MANAGE_ROLES: "Assign roles & privileges",
  REFERRAL_VIEW: "Referral codes — view",
  REFERRAL_EDIT: "Referral codes — edit",
  FUEL_VIEW: "FUEL allocations — view",
  FUEL_EDIT: "FUEL allocations — edit",
  AML_VIEW: "AML / compliance — view",
  AML_EDIT: "AML / compliance — edit",
  BILLING_VIEW: "Billing (Stripe) — view",
  BILLING_EDIT: "Billing (Stripe) — edit",
  // Tombstones legados (não aparecem na UI):
  MANAGE_USERS: "Manage users (legacy)",
  MANAGE_REFERRAL_CODES: "Manage referral codes (legacy)",
  MANAGE_FUEL: "Manage FUEL (legacy)",
  MANAGE_AML: "Manage AML (legacy)",
  MANAGE_BILLING: "Manage billing (legacy)",
}

// Bundle padrão por papel.
const ROLE_PRIVILEGES: Record<Role, Privilege[]> = {
  STAFF: [],
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

/** Expande grants legados grossos no equivalente granular; mantém o resto intacto. */
function expandLegacy(privs: Privilege[]): Privilege[] {
  const out: Privilege[] = []
  for (const p of privs) {
    const mapped = LEGACY_PRIVILEGE_MAP[p]
    if (mapped) out.push(...mapped)
    else out.push(p)
  }
  return out
}

/** Privilegios efetivos = bundle do papel ∪ grants extras (legados expandidos), de-dup. */
export function effectivePrivileges(role: Role, extra: Privilege[] = []): Privilege[] {
  return [...new Set([...rolePrivileges(role), ...expandLegacy(extra)])]
}

export function hasPrivilege(
  role: Role,
  extra: Privilege[],
  required: Privilege,
): boolean {
  return effectivePrivileges(role, extra).includes(required)
}

// Hierarquia de papéis p/ "este ator pode gerenciar aquele alvo".
const RANK: Record<Role, number> = { STAFF: 1, AUTHOR: 2, EDITOR: 3, ADMIN: 4 }

export function roleRank(role: Role): number {
  return RANK[role] ?? 0
}

/** Ator gerencia alvo só se o supera estritamente. Igual-rank (incl. self) = false —
 *  exceções (ADMIN gerencia par ADMIN p/ trim) são tratadas explicitamente nas actions. */
export function canManageRole(actor: Role, target: Role): boolean {
  return roleRank(actor) > roleRank(target)
}

/** Papéis que o ator pode atribuir — estritamente abaixo do próprio rank. */
export function assignableRoles(actor: Role): Role[] {
  return (Object.keys(RANK) as Role[]).filter((r) => roleRank(actor) > roleRank(r))
}
