// Capability model do CMS, agora ancorado no registro IAM (lib/cms/iam/registry).
// Privileges são códigos `domain.action`; papéis são bundles convenientes. Os
// privilégios efetivos = bundle do papel ∪ grants extras, expandidos pelo grafo
// de dependências (e com códigos legados resolvidos), de modo que dados/checagens
// antigas e novas coexistem durante a migração.

import type { Role } from "@prisma/client"
import {
  ALL_CODES,
  PRIVILEGES,
  expand,
  type PrivilegeCode,
} from "@/lib/cms/iam/registry"

export type Privilege = PrivilegeCode
export type { Role }

export const ALL_PRIVILEGES: Privilege[] = ALL_CODES

export const PRIVILEGE_LABELS: Record<string, string> = Object.fromEntries(
  PRIVILEGES.map((p) => [p.code, p.label]),
)

// Bundle padrão por papel (em códigos novos).
const ROLE_PRIVILEGES: Record<Role, PrivilegeCode[]> = {
  STAFF: [],
  AUTHOR: ["articles.write"],
  EDITOR: ["articles.write", "articles.edit_any", "articles.publish", "articles.edit_bio", "apikeys.manage"],
  ADMIN: [...ALL_CODES],
}

export function rolePrivileges(role: Role): Privilege[] {
  return ROLE_PRIVILEGES[role] ?? []
}

/** Privilégios efetivos = (bundle do papel ∪ grants extras), resolvidos via o
 *  registro (códigos legados → novos) e fechados sobre o grafo `implies`. */
export function effectivePrivileges(role: Role, extra: string[] = []): Privilege[] {
  return expand([...rolePrivileges(role), ...extra])
}

export function hasPrivilege(role: Role, extra: string[], required: Privilege): boolean {
  return effectivePrivileges(role, extra).includes(required)
}

// Hierarquia de papéis p/ "este ator pode gerenciar aquele alvo".
const RANK: Record<Role, number> = { STAFF: 1, AUTHOR: 2, EDITOR: 3, ADMIN: 4 }

export function roleRank(role: Role): number {
  return RANK[role] ?? 0
}

/** Ator gerencia alvo só se o supera estritamente. */
export function canManageRole(actor: Role, target: Role): boolean {
  return roleRank(actor) > roleRank(target)
}

/** Papéis que o ator pode atribuir — estritamente abaixo do próprio rank. */
export function assignableRoles(actor: Role): Role[] {
  return (Object.keys(RANK) as Role[]).filter((r) => roleRank(actor) > roleRank(r))
}
