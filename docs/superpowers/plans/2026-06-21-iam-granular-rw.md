# IAM granular read/edit por domínio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dividir cada domínio operacional grosso (`MANAGE_*`) em privileges `X_VIEW`/`X_EDIT`, adicionar o papel `STAFF` (bundle vazio) e habilitar o trim seguro de admins.

**Architecture:** Enum `Privilege` flat ganha 10 valores novos (VIEW/EDIT × 5 domínios); os 5 `MANAGE_*` antigos viram tombstones (mantidos no enum, fora da UI). Um shim em `effectivePrivileges` expande grants legados (`MANAGE_X`→`{X_VIEW,X_EDIT}`), então deploy e backfill são independentes de ordem. O gating por domínio passa a separar leitura (página + `list*`) de mutação; telas renderizam dados com `X_VIEW` e escondem controles sem `X_EDIT`. Papel `STAFF` permite personas least-privilege.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma/Postgres (`db push`), Vitest, TypeScript, Tailwind, Flux/GKE.

## Global Constraints

- Idioma de UI: inglês (copy existente em EN); comentários novos podem ser pt-BR como no resto do repo.
- Toda página `/admin/*` faz `if (!user) redirect("/admin/login")` antes de qualquer coisa.
- `currentUser()` vem de `lib/cms/authz.ts`; privileges nele já são os **efetivos** (bundle ∪ grants expandidos).
- Migração só **aditiva** ao enum (M1): NUNCA remover valores `MANAGE_*` neste plano (tombstones ficam).
- Defesa em profundidade: esconder controle no front nunca é a única barreira — a action mutadora rejeita sem `X_EDIT`.
- Windows: usar Bash p/ heredoc; `npx tsx` ok; `CI=true` antes do vitest; pnpm. NUNCA `git add .npmrc`/`.claude/`.
- Branch atual: `feat/iam-granular-rw`. Commits frequentes (1 por task no mínimo).
- Gate por task: `npx tsc --noEmit` = 0 erros + `CI=true npx vitest run` verde.

---

### Task 1: Fundação — enum, papel STAFF, taxonomia e shim

**Files:**
- Modify: `prisma/schema.prisma` (enum `Role` ~221-225, enum `Privilege` ~230-243)
- Modify: `lib/cms/privileges.ts` (reescrita do módulo)
- Test: `tests/cms/privileges.test.ts` (criar)

**Interfaces:**
- Produces: `ALL_PRIVILEGES: Privilege[]`, `LEGACY_PRIVILEGE_MAP: Partial<Record<Privilege,Privilege[]>>`, `PRIVILEGE_LABELS: Record<Privilege,string>`, `rolePrivileges(role)`, `effectivePrivileges(role, extra)`, `hasPrivilege(role, extra, required)`, `roleRank(role)`, `canManageRole(actor, target)`, `assignableRoles(actor)`. Novos valores de `Privilege`: `USERS_VIEW USERS_EDIT REFERRAL_VIEW REFERRAL_EDIT FUEL_VIEW FUEL_EDIT AML_VIEW AML_EDIT BILLING_VIEW BILLING_EDIT`. Novo `Role`: `STAFF`.

- [ ] **Step 1: Adicionar os valores ao schema Prisma**

Em `prisma/schema.prisma`, adicionar `STAFF` ao enum `Role` e os 10 valores novos ao enum `Privilege` (mantendo os `MANAGE_*` existentes):

```prisma
enum Role {
  ADMIN // full control: manage users + all articles + API keys
  EDITOR // publish/unpublish + edit any article
  AUTHOR // create + edit own drafts, submit for review
  STAFF // bundle vazio: só grants granulares extras (personas least-privilege)
}

enum Privilege {
  WRITE_ARTICLES
  EDIT_ANY_ARTICLE
  PUBLISH_ARTICLES
  EDIT_BIO
  MANAGE_API_KEYS
  MANAGE_USERS // tombstone legado → USERS_VIEW + USERS_EDIT
  MANAGE_ROLES
  VIEW_AUDIT
  MANAGE_REFERRAL_CODES // tombstone legado → REFERRAL_VIEW + REFERRAL_EDIT
  MANAGE_FUEL // tombstone legado → FUEL_VIEW + FUEL_EDIT
  MANAGE_AML // tombstone legado → AML_VIEW + AML_EDIT
  MANAGE_BILLING // tombstone legado → BILLING_VIEW + BILLING_EDIT
  USERS_VIEW
  USERS_EDIT
  REFERRAL_VIEW
  REFERRAL_EDIT
  FUEL_VIEW
  FUEL_EDIT
  AML_VIEW
  AML_EDIT
  BILLING_VIEW
  BILLING_EDIT
}
```

- [ ] **Step 2: Regenerar o client Prisma**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" sem erro (os novos valores de enum passam a existir no tipo `Privilege`/`Role`).

- [ ] **Step 3: Escrever os testes da fundação (falhando)**

Criar `tests/cms/privileges.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  ALL_PRIVILEGES, LEGACY_PRIVILEGE_MAP, PRIVILEGE_LABELS,
  rolePrivileges, effectivePrivileges, roleRank, canManageRole, assignableRoles,
} from "@/lib/cms/privileges"

describe("ALL_PRIVILEGES", () => {
  it("inclui os granulares novos e exclui os tombstones MANAGE_*", () => {
    for (const p of ["FUEL_VIEW","FUEL_EDIT","REFERRAL_VIEW","REFERRAL_EDIT","AML_VIEW","AML_EDIT","BILLING_VIEW","BILLING_EDIT","USERS_VIEW","USERS_EDIT"]) {
      expect(ALL_PRIVILEGES).toContain(p)
    }
    for (const t of ["MANAGE_FUEL","MANAGE_REFERRAL_CODES","MANAGE_AML","MANAGE_BILLING","MANAGE_USERS"]) {
      expect(ALL_PRIVILEGES).not.toContain(t)
    }
  })
  it("tem label legível pra todo privilege ativo", () => {
    for (const p of ALL_PRIVILEGES) expect(PRIVILEGE_LABELS[p]).toBeTruthy()
  })
})

describe("effectivePrivileges (shim legado)", () => {
  it("expande MANAGE_FUEL para FUEL_VIEW + FUEL_EDIT", () => {
    const eff = effectivePrivileges("STAFF", ["MANAGE_FUEL"])
    expect(eff).toContain("FUEL_VIEW")
    expect(eff).toContain("FUEL_EDIT")
    expect(eff).not.toContain("MANAGE_FUEL")
  })
  it("expande todos os tombstones do LEGACY_PRIVILEGE_MAP", () => {
    for (const [legacy, granular] of Object.entries(LEGACY_PRIVILEGE_MAP)) {
      const eff = effectivePrivileges("STAFF", [legacy as never])
      for (const g of granular!) expect(eff).toContain(g)
    }
  })
  it("não duplica quando o grant já é granular", () => {
    const eff = effectivePrivileges("STAFF", ["FUEL_VIEW", "FUEL_VIEW"])
    expect(eff.filter((p) => p === "FUEL_VIEW")).toHaveLength(1)
  })
})

describe("bundles de papel", () => {
  it("STAFF tem bundle vazio", () => {
    expect(rolePrivileges("STAFF")).toEqual([])
  })
  it("ADMIN recebe todos os privileges ativos", () => {
    expect(new Set(effectivePrivileges("ADMIN"))).toEqual(new Set(ALL_PRIVILEGES))
  })
  it("EDITOR e AUTHOR seguem só-conteúdo (sem domínios operacionais)", () => {
    const editor = effectivePrivileges("EDITOR")
    expect(editor).toContain("PUBLISH_ARTICLES")
    expect(editor).not.toContain("FUEL_VIEW")
    expect(effectivePrivileges("AUTHOR")).toEqual(["WRITE_ARTICLES"])
  })
})

describe("ranks", () => {
  it("STAFF < AUTHOR < EDITOR < ADMIN", () => {
    expect(roleRank("STAFF")).toBeLessThan(roleRank("AUTHOR"))
    expect(roleRank("AUTHOR")).toBeLessThan(roleRank("EDITOR"))
    expect(roleRank("EDITOR")).toBeLessThan(roleRank("ADMIN"))
  })
  it("assignableRoles(ADMIN) inclui STAFF, AUTHOR, EDITOR e não ADMIN", () => {
    expect(new Set(assignableRoles("ADMIN"))).toEqual(new Set(["STAFF", "AUTHOR", "EDITOR"]))
  })
  it("canManageRole é estrito por rank", () => {
    expect(canManageRole("ADMIN", "EDITOR")).toBe(true)
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false)
    expect(canManageRole("EDITOR", "ADMIN")).toBe(false)
  })
})
```

- [ ] **Step 4: Rodar os testes p/ confirmar que falham**

Run: `CI=true npx vitest run tests/cms/privileges.test.ts`
Expected: FAIL (ALL_PRIVILEGES ainda tem os MANAGE_*, STAFF/granulares ainda não existem em privileges.ts).

- [ ] **Step 5: Reescrever `lib/cms/privileges.ts`**

Substituir o conteúdo inteiro de `lib/cms/privileges.ts` por:

```ts
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
```

- [ ] **Step 6: Rodar os testes da fundação**

Run: `CI=true npx vitest run tests/cms/privileges.test.ts`
Expected: PASS (todos verdes).

- [ ] **Step 7: tsc + commit**

Run: `npx tsc --noEmit`
Expected: 0 erros.

```bash
git add prisma/schema.prisma lib/cms/privileges.ts tests/cms/privileges.test.ts
git commit -m "feat(iam): enum granular VIEW/EDIT + papel STAFF + shim legado"
```

---

### Task 2: Nav repointado para X_VIEW

**Files:**
- Modify: `lib/cms/admin-nav.ts:34-42,47,59` (privileges das folhas)
- Test: `tests/cms/admin-nav.test.ts:12-19,30` (atualizar)

**Interfaces:**
- Consumes: novos privileges da Task 1.
- Produces: folhas de nav gateadas por `X_VIEW` (`FUEL_VIEW`, `REFERRAL_VIEW`, `AML_VIEW`, `BILLING_VIEW`, `USERS_VIEW`).

- [ ] **Step 1: Atualizar os testes de nav (falhando)**

Em `tests/cms/admin-nav.test.ts`, trocar as referências aos privileges grossos pelos `*_VIEW`:

```ts
  it("shows Articles + Compliance (3 items) for an AML_VIEW-only user", () => {
    const groups = visibleNav(["AML_VIEW"])
    expect(groups.map((g) => g.key)).toEqual(["articles", "compliance"])
    const compliance = groups.find((g) => g.key === "compliance")!
    expect(compliance.items.map((i) => i.href)).toEqual([
      "/admin/kyc", "/admin/fincen", "/admin/mtl",
    ])
  })
```

E no teste "never returns a group with zero items", trocar `["MANAGE_FUEL"]` por `["FUEL_VIEW"]`.

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/cms/admin-nav.test.ts`
Expected: FAIL (nav ainda gateia por `MANAGE_AML`/`MANAGE_FUEL`).

- [ ] **Step 3: Repointar as folhas em `lib/cms/admin-nav.ts`**

Trocar os valores de `privilege` das folhas:
- `/admin/fuel`: `"MANAGE_FUEL"` → `"FUEL_VIEW"`
- `/admin/codes`: `"MANAGE_REFERRAL_CODES"` → `"REFERRAL_VIEW"`
- `/admin/kyc`, `/admin/fincen`, `/admin/mtl`: `"MANAGE_AML"` → `"AML_VIEW"`
- as 8 folhas de billing (`/admin/billing` …): `"MANAGE_BILLING"` → `"BILLING_VIEW"`
- `/admin/users`: `"MANAGE_USERS"` → `"USERS_VIEW"`

(`/admin/api-keys` permanece `MANAGE_API_KEYS`; `/admin/audit` permanece `VIEW_AUDIT`.)

- [ ] **Step 4: Rodar os testes de nav**

Run: `CI=true npx vitest run tests/cms/admin-nav.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add lib/cms/admin-nav.ts tests/cms/admin-nav.test.ts
git commit -m "feat(iam): nav gateada por X_VIEW"
```

---

### Task 3: Gating FUEL (template do padrão)

**Files:**
- Modify: `actions/cms/fuel.ts` (parametrizar `actor`)
- Modify: `app/admin/fuel/page.tsx`
- Modify: `components/cms/FuelManager.tsx` (prop `canEdit`)
- Test: `tests/fuel/actions.test.ts` (atualizar p/ FUEL_VIEW/FUEL_EDIT)

**Interfaces:**
- Consumes: `FUEL_VIEW`, `FUEL_EDIT`.
- Produces: padrão `actor(required: Privilege)` replicado nos domínios seguintes; `FuelManager({ canEdit })`.

- [ ] **Step 1: Atualizar os testes de fuel (falhando)**

Em `tests/fuel/actions.test.ts`: trocar `asUser(['MANAGE_FUEL'])` por `asUser(['FUEL_EDIT'])` nos blocos de write (upsert/delete) e por `asUser(['FUEL_VIEW'])` no read (list); o teste de rejeição de read passa a usar um privilege de outro domínio. Adicionar caso: read funciona com só-VIEW mas write é rejeitada com só-VIEW:

```ts
  it('rejects reads without FUEL_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['REFERRAL_VIEW']));
    const res = await listAllocationsAction();
    expect(res.ok).toBe(false);
    expect(fuel.listAllocations).not.toHaveBeenCalled();
  });

  it('allows read with FUEL_VIEW but rejects write with only FUEL_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser(['FUEL_VIEW']));
    const list = await listAllocationsAction();
    expect(list.ok).toBe(true);
    const write = await upsertAllocationsAction([{ address: 'bc1pa', amount: 1 }]);
    expect(write.ok).toBe(false);
    expect(fuel.upsertAllocations).not.toHaveBeenCalled();
  });
```

Nos blocos `upsertAllocationsAction`/`deleteAllocationAction`/`listAllocationsAction` existentes, trocar `asUser(['MANAGE_FUEL'])` por `asUser(['FUEL_EDIT'])` (writes) e `asUser(['FUEL_VIEW'])` (list).

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/fuel/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Parametrizar o gate em `actions/cms/fuel.ts`**

Remover `const REQUIRED` e trocar `actor()` por `actor(required: Privilege)`; reads passam `"FUEL_VIEW"`, writes `"FUEL_EDIT"`:

```ts
async function actor(
  required: Privilege,
): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(required)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}
```

- `listAllocationsAction`: `const a = await actor("FUEL_VIEW")`
- `upsertAllocationsAction`: `const a = await actor("FUEL_EDIT")`
- `deleteAllocationAction`: `const a = await actor("FUEL_EDIT")`

- [ ] **Step 4: Página `app/admin/fuel/page.tsx` — VIEW + canEdit**

```tsx
export default async function FuelPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("FUEL_VIEW")) redirect("/admin")
  const canEdit = me.privileges.includes("FUEL_EDIT")

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">FUEL allocations</h1>
      <FuelManager canEdit={canEdit} />
    </div>
  )
}
```

- [ ] **Step 5: `components/cms/FuelManager.tsx` — esconder controles sem canEdit**

Adicionar a prop e esconder os controles mutadores:

```tsx
export function FuelManager({ canEdit }: { canEdit: boolean }) {
```

- Esconder o botão "Add allocation" (linha ~196) atrás de `canEdit`: envolver em `{canEdit && (...)}`.
- Esconder a coluna de ações (Edit/Delete, `<td>` ~274-279) atrás de `canEdit`: renderizar `{canEdit && (<div className="flex justify-end gap-2">…</div>)}` (ou um `—` quando `!canEdit`).
- O bloco `{showForm && (...)}` já só aparece quando `showForm` é true, que só pode ser ligado pelo botão escondido — mas por segurança, manter `showForm && canEdit`.

- [ ] **Step 6: Rodar os testes + tsc**

Run: `CI=true npx vitest run tests/fuel/actions.test.ts && npx tsc --noEmit`
Expected: testes PASS, tsc 0 erros.

- [ ] **Step 7: Commit**

```bash
git add actions/cms/fuel.ts app/admin/fuel/page.tsx components/cms/FuelManager.tsx tests/fuel/actions.test.ts
git commit -m "feat(iam): split FUEL_VIEW/FUEL_EDIT"
```

---

### Task 4: Gating Referral (codes)

**Files:**
- Modify: `actions/cms/codes.ts` (parametrizar `actor`)
- Modify: `app/admin/codes/page.tsx`
- Modify: `components/cms/CodesManager.tsx` (prop `canEdit` — LER o componente p/ achar os controles)
- Test: `tests/cms/codes-actions.test.ts` (atualizar)

**Interfaces:**
- Consumes: `REFERRAL_VIEW`, `REFERRAL_EDIT`.

- [ ] **Step 1: Atualizar os testes (falhando)**

Em `tests/cms/codes-actions.test.ts`, trocar os grants usados: reads (`listCodesAction`, `getParentOptionsAction`, `getCodeTreeAction`, `listRedemptionsAction`, `exportRedemptionsCsvAction`) passam a exigir `REFERRAL_VIEW`; writes (`createCodeAction`, `bulkCreateCodesAction`, `updateCodeAction`, `toggleCodeAction`, `deleteCodeAction`) exigem `REFERRAL_EDIT`. Substituir `asUser(['MANAGE_REFERRAL_CODES'])` conforme cada bloco (VIEW p/ reads, EDIT p/ writes) e adicionar o caso "só-VIEW lê mas não escreve" (espelhar Task 3 Step 1).

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/cms/codes-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Parametrizar o gate em `actions/cms/codes.ts`**

Remover `const REQUIRED` e trocar `actor()` por `actor(required: Privilege)` (mesma assinatura da Task 3 Step 3). Atribuir:
- READS → `actor("REFERRAL_VIEW")`: `listCodesAction`, `getParentOptionsAction`, `getCodeTreeAction`, `listRedemptionsAction`, `exportRedemptionsCsvAction`.
- WRITES → `actor("REFERRAL_EDIT")`: `createCodeAction`, `bulkCreateCodesAction`, `updateCodeAction`, `deleteCodeAction`.
- `toggleCodeAction` delega a `updateCodeAction`, então herda EDIT — não tem `actor()` próprio, nada a mudar nele.

- [ ] **Step 4: Página `app/admin/codes/page.tsx` — VIEW + canEdit**

Ler a página; aplicar o padrão da Task 3 Step 4 com `"REFERRAL_VIEW"`/`"REFERRAL_EDIT"`; passar `canEdit` ao `CodesManager`.

- [ ] **Step 5: `components/cms/CodesManager.tsx` — esconder controles sem canEdit**

Ler `components/cms/CodesManager.tsx`. Adicionar prop `canEdit: boolean`. Esconder/disable todo controle que chama um write (criar código, bulk-create, editar/atualizar, toggle ativar/desativar, deletar) atrás de `canEdit`. Tabelas, busca, árvore e export de CSV (read) permanecem visíveis com só-VIEW.

- [ ] **Step 6: Testes + tsc**

Run: `CI=true npx vitest run tests/cms/codes-actions.test.ts && npx tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 7: Commit**

```bash
git add actions/cms/codes.ts app/admin/codes/page.tsx components/cms/CodesManager.tsx tests/cms/codes-actions.test.ts
git commit -m "feat(iam): split REFERRAL_VIEW/REFERRAL_EDIT"
```

---

### Task 5: Gating AML (kyc + fincen + mtl)

**Files:**
- Modify: `actions/cms/kyc.ts`, `actions/cms/fincen.ts`, `actions/cms/mtl.ts`
- Modify: `app/admin/kyc/page.tsx`, `app/admin/fincen/page.tsx`, `app/admin/mtl/page.tsx`
- Modify: `components/cms/KycManager.tsx`, `components/cms/FincenManager.tsx`, `components/cms/MtlManager.tsx` (prop `canEdit` — LER cada um)
- Test: `tests/kyc/actions.test.ts`, `tests/fincen/actions.test.ts`, `tests/mtl/actions.test.ts`

**Interfaces:**
- Consumes: `AML_VIEW`, `AML_EDIT`. Os 3 domínios compartilham o mesmo par.

- [ ] **Step 1: Atualizar os 3 testes (falhando)**

Trocar `asUser(['MANAGE_AML'])` por:
- `tests/kyc/actions.test.ts`: `listIntakesAction` → `AML_VIEW`; `rescreenOfacAction`, `recordDispositionAction`, `syncStripeIdentityAction` → `AML_EDIT`.
- `tests/fincen/actions.test.ts`: `getFincenDataAction` → `AML_VIEW`; `saveForm107Action`, `createSarAction`, `updateSarAction`, `createCtrAction`, `updateCtrAction`, `queueSubmissionAction` → `AML_EDIT`.
- `tests/mtl/actions.test.ts`: `listMtlAction` → `AML_VIEW`; `seedMtlAction`, `updateMtlAction` → `AML_EDIT`.
Adicionar em cada um o caso "só-VIEW lê mas não escreve".

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/kyc tests/fincen tests/mtl`
Expected: FAIL.

- [ ] **Step 3: Parametrizar os 3 action files**

Em cada (`kyc.ts`, `fincen.ts`, `mtl.ts`): remover `const REQUIRED`, trocar `actor()` por `actor(required: Privilege)` (mesma assinatura da Task 3 Step 3 — `fincen.ts` usa o alias `Fail` no retorno, manter). Atribuir:
- **kyc.ts**: `listIntakesAction`→`AML_VIEW`; `rescreenOfacAction`/`recordDispositionAction`/`syncStripeIdentityAction`→`AML_EDIT`.
- **fincen.ts**: `getFincenDataAction`→`AML_VIEW`; `saveForm107Action`/`createSarAction`/`updateSarAction`/`createCtrAction`/`updateCtrAction`/`queueSubmissionAction`→`AML_EDIT` (todas chamam `await actor()` no início — trocar p/ `await actor("AML_EDIT")`).
- **mtl.ts**: `listMtlAction`→`AML_VIEW`; `seedMtlAction`/`updateMtlAction`→`AML_EDIT`.

- [ ] **Step 4: As 3 páginas — VIEW + canEdit**

Em `app/admin/{kyc,fincen,mtl}/page.tsx`: aplicar o padrão da Task 3 Step 4 com `"AML_VIEW"`/`"AML_EDIT"`, passar `canEdit` ao manager correspondente. (Ler cada página antes — o nome da prop do componente pode variar.)

- [ ] **Step 5: Os 3 componentes — esconder controles sem canEdit**

Ler `KycManager.tsx`, `FincenManager.tsx`, `MtlManager.tsx`. Em cada, adicionar prop `canEdit: boolean` e esconder/disable os controles mutadores:
- **KycManager**: botões de decisão (aprovar/rejeitar/disposição), "rescreen OFAC", "sync Stripe Identity".
- **FincenManager**: salvar Form 107, criar/editar SAR e CTR, enfileirar submissão.
- **MtlManager**: seed states, editar/atualizar entrada de estado.
Listas/tabelas/visualizações de leitura permanecem.

- [ ] **Step 6: Testes + tsc**

Run: `CI=true npx vitest run tests/kyc tests/fincen tests/mtl && npx tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 7: Commit**

```bash
git add actions/cms/kyc.ts actions/cms/fincen.ts actions/cms/mtl.ts app/admin/kyc/page.tsx app/admin/fincen/page.tsx app/admin/mtl/page.tsx components/cms/KycManager.tsx components/cms/FincenManager.tsx components/cms/MtlManager.tsx tests/kyc/actions.test.ts tests/fincen/actions.test.ts tests/mtl/actions.test.ts
git commit -m "feat(iam): split AML_VIEW/AML_EDIT (kyc+fincen+mtl)"
```

---

### Task 6: Gating Billing (8 subpáginas)

**Files:**
- Modify: `actions/cms/billing.ts` (parametrizar `actor`)
- Modify: `app/admin/billing/page.tsx` + 7 subpáginas (`subscriptions`, `promo`, `treasury`, `issuing`, `offramp`, `customers`, `applications`)
- Modify: `components/cms/billing/*.tsx` (prop `canEdit` — LER cada um)
- Test: `tests/billing/actions.test.ts`, `tests/billing/actions-revenue.test.ts`, `tests/billing/actions-customers.test.ts`, `tests/billing/actions-money.test.ts`

**Interfaces:**
- Consumes: `BILLING_VIEW`, `BILLING_EDIT`.

- [ ] **Step 1: Atualizar os 4 testes de billing (falhando)**

Trocar `asUser(['MANAGE_BILLING'])`:
- READS → `BILLING_VIEW`: `listApplicationsAction`, `listTiersAction`, `listSubscribersAction`, `listPromoCodesAction`, `listBalancesAction`, `listTransactionsAction`, `listMoneyIntentsAction`, `listCardsAction`, `listDisputesAction`, `listSettlementsAction`, `listCustomersAction`, `getCustomerAction`, `listRefundIntentsAction`.
- WRITES → `BILLING_EDIT`: `upsertApplicationAction`, `changeSubscriptionAction`, `createPromoCodeAction`, `queueAchTransferAction`, `confirmIntentAction`, `cancelIntentAction`, `setCardControlAction`, `submitDisputeEvidenceAction`, `requestRefundAction`.
Adicionar o caso "só-VIEW lê mas não escreve" em pelo menos um arquivo (ex.: `actions-money.test.ts`: `listMoneyIntentsAction` ok com VIEW, `confirmIntentAction` rejeitada com só-VIEW).

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/billing`
Expected: FAIL.

- [ ] **Step 3: Parametrizar o gate em `actions/cms/billing.ts`**

Remover `const REQUIRED`, trocar `actor()` por `actor(required: Privilege)` (assinatura da Task 3 Step 3). Em cada action passar `"BILLING_VIEW"` (reads, lista acima) ou `"BILLING_EDIT"` (writes, lista acima).

- [ ] **Step 4: As 8 páginas — VIEW + canEdit**

Em cada página de `app/admin/billing/**/page.tsx`: aplicar o padrão da Task 3 Step 4 com `"BILLING_VIEW"`/`"BILLING_EDIT"`, passando `canEdit` ao componente. (Ler cada página; `app/admin/billing/page.tsx` (overview) pode não ter controles mutadores — ainda assim repointar o guard p/ `BILLING_VIEW`.)

- [ ] **Step 5: Os componentes de billing — esconder controles sem canEdit**

Ler cada `components/cms/billing/*.tsx` que tem controle mutador e adicionar prop `canEdit: boolean`, escondendo/disable:
- `SubscriptionsManager` → ações de mudar assinatura.
- `PromoManager` → criar promo code.
- `TreasuryManager` + `MoneyIntentQueue` → enfileirar ACH, confirmar/cancelar intent.
- `IssuingManager` → controle de cartão, submeter evidência de disputa.
- `CustomersManager` → solicitar refund.
- `ApplicationsManager` → upsert de application.
- `OfframpManager`, `BillingBanner` → só leitura/aviso (provavelmente sem mudança além de, se aplicável, repassar canEdit).

- [ ] **Step 6: Testes + tsc**

Run: `CI=true npx vitest run tests/billing && npx tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 7: Commit**

```bash
git add actions/cms/billing.ts app/admin/billing components/cms/billing tests/billing
git commit -m "feat(iam): split BILLING_VIEW/BILLING_EDIT"
```

---

### Task 7: Gating Users (IAM) + STAFF na UI

**Files:**
- Modify: `actions/cms/users.ts` (gates USERS_EDIT; ROLES inclui STAFF)
- Modify: `app/admin/users/page.tsx` (USERS_VIEW + canEdit)
- Modify: `components/cms/UsersManager.tsx` (prop `canEdit`)
- Test: criar/atualizar `tests/cms/users-actions.test.ts`

**Interfaces:**
- Consumes: `USERS_VIEW`, `USERS_EDIT`, `MANAGE_ROLES` (inalterado), papel `STAFF`.
- Produces: `UsersManager({ …, canEdit })`.

- [ ] **Step 1: Escrever testes de users (falhando)**

Criar/estender `tests/cms/users-actions.test.ts` espelhando o estilo de `tests/fuel/actions.test.ts` (mock de `@/lib/prisma`, `currentUser`, `audit`, `revokeAllUserSessions`). Casos:
- `createUser`/`updateUser`/`resetPassword`/`deleteUser` rejeitam sem `USERS_EDIT`.
- `updateUser` com só `USERS_EDIT` (sem `MANAGE_ROLES`) consegue mudar `name`/`active` mas é rejeitada ao mudar `role`/`privileges` ("requires MANAGE_ROLES").
- (lockout vem na Task 8.)

```ts
// exemplo de um caso:
it('updateUser sem MANAGE_ROLES não muda role', async () => {
  vi.mocked(currentUser).mockResolvedValue(asUser('ADMIN', ['USERS_EDIT']))
  // mock prisma.user.findUnique → target EDITOR manageable
  const res = await updateUser('t1', { role: 'AUTHOR' })
  expect(res).toEqual({ ok: false, error: expect.stringContaining('MANAGE_ROLES') })
})
```
(`asUser(role, privileges, id = 'me')` define `{ id, role, privileges, email:'me@b.io' }`; o `id` default permite os casos da Task 8 que precisam de `me.id ≠ target.id`.)

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/cms/users-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: `actions/cms/users.ts` — gates USERS_EDIT + STAFF**

- Trocar `const ROLES = ["ADMIN", "EDITOR", "AUTHOR"] as const` por `const ROLES = ["ADMIN", "EDITOR", "AUTHOR", "STAFF"] as const`.
- Trocar `actor("MANAGE_USERS")` por `actor("USERS_EDIT")` em `createUser`, `updateUser`, `resetPassword`, `deleteUser`.
- Em `updateProfile`, trocar `!me.privileges.includes("MANAGE_USERS")` (branch `!isSelf`) por `!me.privileges.includes("USERS_EDIT")`; e o `canByline` que usa `MANAGE_USERS` por `USERS_EDIT`.
- O check de role/privilege (`changesRolePriv && !me.privileges.includes("MANAGE_ROLES")`) permanece inalterado.

- [ ] **Step 4: `app/admin/users/page.tsx` — USERS_VIEW + canEdit**

```tsx
  if (!me.privileges.includes("USERS_VIEW")) redirect("/admin")
  // …
      <UsersManager
        users={rows}
        meId={me.id}
        myRole={me.role}
        myPrivileges={me.privileges}
        assignableRoles={assignableRoles(me.role)}
        canEdit={me.privileges.includes("USERS_EDIT")}
        canManageRoles={me.privileges.includes("MANAGE_ROLES")}
      />
```

- [ ] **Step 5: `components/cms/UsersManager.tsx` — prop canEdit**

- Adicionar `canEdit: boolean` ao tipo de props e à desestruturação.
- Esconder o form "Add user" inteiro (`<form onSubmit={onCreate}>`) atrás de `{canEdit && (...)}`.
- Os botões por linha **Disable/Enable**, **Reset password**, **Delete**: adicionar `|| !canEdit` ao `disabled` (ex.: `disabled={!manageable || !canEdit || pending}`).
- O seletor de role e o botão "Privileges"/`PrivilegeEditor` continuam gateados por `canManageRoles` (não tocar — mudar role/priv é MANAGE_ROLES).
- O `<select>` de role no form de criação inclui STAFF automaticamente (via `assignableRoles`).

- [ ] **Step 6: Testes + tsc**

Run: `CI=true npx vitest run tests/cms/users-actions.test.ts && npx tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 7: Commit**

```bash
git add actions/cms/users.ts app/admin/users/page.tsx components/cms/UsersManager.tsx tests/cms/users-actions.test.ts
git commit -m "feat(iam): split USERS_VIEW/USERS_EDIT + STAFF na UI de users"
```

---

### Task 8: Guarda anti-lockout + ADMIN gerencia par ADMIN (trim)

**Files:**
- Modify: `actions/cms/users.ts` (`manageable`, `updateUser`, `deleteUser`)
- Test: `tests/cms/users-actions.test.ts` (estender)

**Interfaces:**
- Consumes: `prisma.user.count`, `canManageRole`.
- Produces: `manageable()` permite ADMIN→par-ADMIN (exceto self); `protectLastAdmin` bloqueia rebaixar/desativar/deletar o último ADMIN ativo.

**Contexto:** hoje `manageable()` exige `canManageRole(me.role, target.role)` (estrito), então `canManageRole(ADMIN, ADMIN)=false` impede qualquer trim de admin pela UI. Esta task habilita o trim com salvaguarda.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `tests/cms/users-actions.test.ts` adicionar:
- ADMIN consegue rebaixar OUTRO ADMIN (target ADMIN, role→STAFF) quando há ≥2 admins ativos.
- ADMIN NÃO consegue se auto-gerenciar (`userId === me.id` → "Use your own profile").
- Rebaixar/desativar/deletar o ÚLTIMO ADMIN ativo é bloqueado ("last active admin").

```ts
it('bloqueia rebaixar o último admin ativo', async () => {
  vi.mocked(currentUser).mockResolvedValue(asUser('ADMIN', ['USERS_EDIT', 'MANAGE_ROLES'], 'me'))
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 't1', role: 'ADMIN', email: 'a@b.io' } as never)
  vi.mocked(prisma.user.count).mockResolvedValue(1) // único admin ativo
  const res = await updateUser('t1', { role: 'STAFF' })
  expect(res).toEqual({ ok: false, error: expect.stringContaining('last active admin') })
})
```

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/cms/users-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Relaxar `manageable` p/ ADMIN-par + helper de último-admin**

Em `actions/cms/users.ts`, ajustar `manageable()` (mantém bloqueio de self) p/ permitir ADMIN gerenciar qualquer alvo:

```ts
async function manageable(
  me: CmsUser,
  userId: string,
): Promise<{ ok: true; target: NonNullable<ManageableTarget> } | { ok: false; error: string }> {
  if (userId === me.id) return { ok: false, error: "Use your own profile for self-service changes" }
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) return { ok: false, error: "User not found" }
  // ADMIN (papel topo) pode gerenciar pares ADMIN p/ o trim; os demais seguem rank estrito.
  const allowed = me.role === "ADMIN" || canManageRole(me.role, target.role as Role)
  if (!allowed) {
    return { ok: false, error: "You cannot manage a user at or above your role" }
  }
  return { ok: true, target }
}

/** Verdadeiro se o alvo é ADMIN e é o único ADMIN ativo restante. */
async function isLastActiveAdmin(target: { id: string; role: string; active?: boolean }): Promise<boolean> {
  if (target.role !== "ADMIN") return false
  const count = await prisma.user.count({ where: { role: "ADMIN", active: true } })
  return count <= 1
}
```

- [ ] **Step 4: Aplicar a guarda em `updateUser` e `deleteUser`**

Em `updateUser`, após carregar `m` (manageable) e parsear, antes do `prisma.user.update`:

```ts
  const demoting = role !== undefined && role !== "ADMIN" && (m.target.role as Role) === "ADMIN"
  const deactivating = active === false && (m.target.role as Role) === "ADMIN"
  if ((demoting || deactivating) && (await isLastActiveAdmin(m.target))) {
    return { ok: false, error: "Cannot remove the last active admin" }
  }
```

Em `deleteUser`, após `m` (manageable), antes do `$transaction`:

```ts
  if (await isLastActiveAdmin(m.target)) {
    return { ok: false, error: "Cannot delete the last active admin" }
  }
```

- [ ] **Step 5: Testes + tsc**

Run: `CI=true npx vitest run tests/cms/users-actions.test.ts && npx tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 6: Commit**

```bash
git add actions/cms/users.ts tests/cms/users-actions.test.ts
git commit -m "feat(iam): guarda último-admin + ADMIN gerencia par ADMIN p/ trim"
```

---

### Task 9: Landing do STAFF → primeira tela visível

**Files:**
- Modify: `app/admin/page.tsx`
- Test: `tests/cms/admin-landing.test.ts` (criar — testar o helper puro)

**Interfaces:**
- Consumes: `visibleNav` de `lib/cms/admin-nav.ts`.
- Produces: `firstNonArticleLeaf(privileges): string | null` exportado de `lib/cms/admin-nav.ts`.

- [ ] **Step 1: Teste do helper (falhando)**

Criar `tests/cms/admin-landing.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { firstNonArticleLeaf } from "@/lib/cms/admin-nav"

describe("firstNonArticleLeaf", () => {
  it("retorna a 1ª folha não-Articles visível", () => {
    expect(firstNonArticleLeaf(["AML_VIEW"])).toBe("/admin/kyc")
    expect(firstNonArticleLeaf(["FUEL_VIEW"])).toBe("/admin/fuel")
  })
  it("retorna null quando só há Articles", () => {
    expect(firstNonArticleLeaf([])).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/cms/admin-landing.test.ts`
Expected: FAIL ("firstNonArticleLeaf is not a function").

- [ ] **Step 3: Adicionar o helper em `lib/cms/admin-nav.ts`**

```ts
/** Primeira folha visível fora do grupo Articles (p/ landing de quem não vê artigos). */
export function firstNonArticleLeaf(privileges: string[]): string | null {
  for (const g of visibleNav(privileges)) {
    if (g.key === "articles") continue
    if (g.items[0]) return g.items[0].href
  }
  return null
}
```

- [ ] **Step 4: Redirect no `app/admin/page.tsx`**

Após `if (!user) redirect("/admin/login")`, antes da query de artigos:

```tsx
  const hasArticles =
    user.privileges.includes("WRITE_ARTICLES") || user.privileges.includes("EDIT_ANY_ARTICLE")
  if (!hasArticles) {
    const dest = firstNonArticleLeaf(user.privileges)
    if (dest) redirect(dest)
  }
```

(import: `import { firstNonArticleLeaf } from "@/lib/cms/admin-nav"`.)

- [ ] **Step 5: Testes + tsc**

Run: `CI=true npx vitest run tests/cms/admin-landing.test.ts && npx tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 6: Commit**

```bash
git add lib/cms/admin-nav.ts app/admin/page.tsx tests/cms/admin-landing.test.ts
git commit -m "feat(iam): landing do STAFF cai na 1ª tela visível"
```

---

### Task 10: Script de backfill de grants legados

**Files:**
- Create: `scripts/backfill-granular-privileges.ts`
- Test: `tests/scripts/backfill-privileges.test.ts` (testar a função pura de transformação)

**Interfaces:**
- Consumes: `LEGACY_PRIVILEGE_MAP` da Task 1.
- Produces: `expandGrants(privileges: string[]): string[]` (pura) + um runner que reescreve `User.privileges`.

- [ ] **Step 1: Teste da transformação pura (falhando)**

Criar `tests/scripts/backfill-privileges.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar p/ confirmar falha**

Run: `CI=true npx vitest run tests/scripts/backfill-privileges.test.ts`
Expected: FAIL.

- [ ] **Step 3: Escrever `scripts/backfill-granular-privileges.ts`**

```ts
import prisma from "@/lib/prisma"
import { LEGACY_PRIVILEGE_MAP, type Privilege } from "@/lib/cms/privileges"

/** Expande grants legados grossos no granular e remove o legado; idempotente. */
export function expandGrants(privileges: string[]): string[] {
  const out: string[] = []
  for (const p of privileges) {
    const mapped = LEGACY_PRIVILEGE_MAP[p as Privilege]
    if (mapped) out.push(...mapped)
    else out.push(p)
  }
  return [...new Set(out)]
}

async function main() {
  const dry = process.argv.includes("--dry")
  const legacyKeys = Object.keys(LEGACY_PRIVILEGE_MAP)
  const users = await prisma.user.findMany({ where: { privileges: { hasSome: legacyKeys as Privilege[] } } })
  console.log(`${users.length} user(s) com grants legados${dry ? " (dry-run)" : ""}`)
  for (const u of users) {
    const next = expandGrants(u.privileges)
    console.log(`  ${u.email}: [${u.privileges.join(", ")}] → [${next.join(", ")}]`)
    if (!dry) {
      await prisma.user.update({ where: { id: u.id }, data: { privileges: next as Privilege[] } })
    }
  }
  console.log(dry ? "dry-run completo (nada gravado)" : "backfill aplicado")
}

// Só roda quando invocado direto (não em import de teste).
if (process.argv[1]?.includes("backfill-granular-privileges")) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
```

- [ ] **Step 4: Testes + tsc**

Run: `CI=true npx vitest run tests/scripts/backfill-privileges.test.ts && npx tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-granular-privileges.ts tests/scripts/backfill-privileges.test.ts
git commit -m "feat(iam): script de backfill de grants legados (idempotente)"
```

- [ ] **Step 6: Dry-run contra o DB de prod (via proxy io)**

Seguir o runbook `docs/superpowers/runbooks/legacy-data-import.md` §DATABASE_URL (secret `subfrost-io-secrets`, Cloud SQL proxy). Com o proxy ligado:

Run: `npx tsx scripts/backfill-granular-privileges.ts --dry`
Expected: lista os users com grants legados (provavelmente 0 ou pouquíssimos, já que os operadores são ADMIN). NÃO aplicar ainda — aplicação real só pós-deploy (ver Task 11).

---

### Task 11: Verificação final, PR, deploy e backfill em prod

**Files:** nenhum código novo — orquestração.

- [ ] **Step 1: Suite completa + build**

Run: `npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0, vitest verde (todos os domínios), build 0.

- [ ] **Step 2: Diff de schema é puramente aditivo**

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (ou inspeção manual)
Expected: apenas `ALTER TYPE … ADD VALUE` p/ os 10 privileges + STAFF. NENHUM `DROP`/rename. Se aparecer drop, PARAR (violou a regra M1).

- [ ] **Step 3: Abrir PR**

```bash
git push -u origin feat/iam-granular-rw
gh pr create --title "IAM granular read/edit por domínio + papel STAFF" --body "Split VIEW/EDIT em FUEL/Referral/AML/Billing/Users, papel STAFF (bundle vazio), shim legado + backfill, guarda anti-lockout. Spec: docs/superpowers/specs/2026-06-21-iam-granular-design.md"
```

- [ ] **Step 4: Merge + deploy (após aprovação)**

```bash
gh pr merge <n> --merge --delete-branch
```
O migrate job (`db push`) aplica os valores novos (aditivo). Build regional gera a imagem. Bump `newTag` no `k8s/kustomization.yaml` p/ a nova tag e commit na `main` (Flux reconcilia).

- [ ] **Step 5: Backfill real em prod**

Com o proxy io ligado (Task 10 Step 6), rodar SEM `--dry`:

Run: `npx tsx scripts/backfill-granular-privileges.ts`
Expected: reescreve os grants legados (se houver). Idempotente — re-rodar não muda nada.

- [ ] **Step 6: Verificação ao vivo**

- `/admin/*` sem sessão → 307 p/ login.
- ADMIN (você/flex/gabe/shang) vê tudo e edita (bundle pegou os novos via ALL_PRIVILEGES).
- Criar um usuário STAFF de teste com só `FUEL_VIEW` → loga, cai em `/admin/fuel`, vê a tabela, NÃO vê "Add allocation"/Edit/Delete; tentar a action de write retorna erro. Depois desativar/deletar o usuário de teste.

---

## Notas de execução

- **Ordem:** Task 1 → 2 são fundação; 3-7 (domínios) são independentes entre si e podem ir em paralelo por subagents distintos depois da 1/2; 8 depende da 7; 9 depende da 1/2; 10 depende da 1; 11 é a última.
- **Componentes não lidos no plano** (CodesManager, KycManager, FincenManager, MtlManager, billing/*, ): o implementador DEVE ler o arquivo antes de editar e gatear exatamente os controles que disparam as actions de write listadas na task. Dados de leitura sempre permanecem.
- **Decisão a confirmar com o flex** (Task 8): habilitar ADMIN-gerencia-par-ADMIN pela UI. Alternativa é manter só-script; o plano assume a opção UI por ser o objetivo do trim.
