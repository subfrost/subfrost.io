# IAM granular read/edit por domínio — design

**Data:** 2026-06-21
**Status:** spec aprovada no brainstorm, aguardando revisão
**Branch:** `feat/iam-granular-rw`
**Imagem prod atual:** `ae05633`

## Problema

O enum `Privilege` (`prisma/schema.prisma`) é **grosso**: cada domínio operacional é um único
`MANAGE_*` que significa "edição total". O único privilege só-leitura hoje é `VIEW_AUDIT`. Não há
como dar a alguém **ver sem editar** um domínio (ex.: analista que lê FUEL mas não altera; revisor
de compliance que vê KYC mas não decide). Além disso, todos os operadores importantes (Vitor, flex,
gabe, shang) são **ADMIN total** — e o flex/gabe vão querer destrinchar isso (least-privilege) assim
que a capacidade existir.

Diretiva do flex: *"IAM roles for everything: FUEL read|edit, Referral read|edit, AML view|edit,
Stripe view|edit, everything. They should be able to add totp too."* (TOTP já existe, self-service
em `/admin/profile` — fora de escopo.)

## Meta

Dividir cada domínio operacional em **`X_VIEW`** (ver dados, sem controles de edição) e **`X_EDIT`**
(mutar). Manter o trabalho de destrinchar admins **possível e seguro**, sem mexer nas permissões dos
ADMINs atuais agora (o trim em si é ação humana posterior do flex/gabe).

## Decisões do brainstorm

- **Escopo:** split em **todos** os domínios operacionais grossos (5).
- **Migração:** **M1 — expand + backfill + tombstone** (1 deploy aditivo; valores antigos viram
  inertes; sem recriar enum). Contract (remover os antigos) fica opcional pro fim.
- **Modelo de papel:** **adicionar papel `STAFF`** com bundle vazio, pra habilitar personas
  least-privilege (só-compliance, só-growth) sem vazar capacidade de conteúdo pelo bundle do papel.
- **Não mexer** nas permissões dos ADMINs atuais — o bundle ADMIN recebe os novos privileges
  automaticamente (`ADMIN = [...ALL_PRIVILEGES]`).

## Taxonomia

### Domínios que ganham split `VIEW`/`EDIT` (5)

| Domínio | Hoje (tombstone) | Vira |
|---|---|---|
| FUEL | `MANAGE_FUEL` | `FUEL_VIEW` + `FUEL_EDIT` |
| Referral (codes) | `MANAGE_REFERRAL_CODES` | `REFERRAL_VIEW` + `REFERRAL_EDIT` |
| AML (KYC/FinCEN/MTL) | `MANAGE_AML` | `AML_VIEW` + `AML_EDIT` |
| Billing (Stripe) | `MANAGE_BILLING` | `BILLING_VIEW` + `BILLING_EDIT` |
| Users (IAM) | `MANAGE_USERS` | `USERS_VIEW` + `USERS_EDIT` |

### Privileges inalterados (ativos)

- **Conteúdo** (`WRITE_ARTICLES`, `EDIT_ANY_ARTICLE`, `PUBLISH_ARTICLES`): já é um conjunto
  granular próprio; a lista de artigos é o landing `/admin`, aberto. Não há `MANAGE` grosso a dividir.
- **`EDIT_BIO`**: perfil próprio (self-service), não é domínio.
- **`MANAGE_API_KEYS`**: chaves próprias (mint/revoke own) — view/edit das próprias chaves agrega pouco.
- **`MANAGE_ROLES`**: é edição por natureza (conceder papéis/privilégios); o "ver" dele = ver quem
  tem o quê, coberto por `USERS_VIEW`.
- **`VIEW_AUDIT`**: já é view-only (auditoria não tem edição) — é o modelo que estamos copiando.

### Tombstones (mantidos no enum, fora de `ALL_PRIVILEGES`, label retido)

`MANAGE_FUEL`, `MANAGE_REFERRAL_CODES`, `MANAGE_AML`, `MANAGE_BILLING`, `MANAGE_USERS`.

Continuam valores válidos do enum Postgres (não removidos), mas saem de `ALL_PRIVILEGES` e dos
bundles, então **não aparecem na UI de grants** nem são concedidos por padrão. `PRIVILEGE_LABELS`
mantém entrada para eles (TS exige `Record<Privilege,…>` exaustivo) marcada como legada.

### Papéis (Role)

Enum `Role`: adicionar **`STAFF`** (abaixo de AUTHOR).

| Papel | Rank | Bundle padrão |
|---|---|---|
| `STAFF` | 1 | `[]` (vazio — só grants granulares extras) |
| `AUTHOR` | 2 | `WRITE_ARTICLES` |
| `EDITOR` | 3 | `WRITE_ARTICLES, EDIT_ANY_ARTICLE, PUBLISH_ARTICLES, EDIT_BIO, MANAGE_API_KEYS` |
| `ADMIN` | 4 | `[...ALL_PRIVILEGES]` (tudo, incl. os novos VIEW/EDIT) |

Ranks deslocados +1 do atual (hoje AUTHOR=1/EDITOR=2/ADMIN=3) pra STAFF ser estritamente o menor e
manter ranks positivos. `roleRank` de papel desconhecido continua 0.

## Compat shim + migração (M1)

### Shim de retrocompatibilidade

`effectivePrivileges` expande grants legados antes do dedup, via um mapa único reutilizado pelo
backfill:

```ts
const LEGACY_PRIVILEGE_MAP: Partial<Record<Privilege, Privilege[]>> = {
  MANAGE_FUEL: ["FUEL_VIEW", "FUEL_EDIT"],
  MANAGE_REFERRAL_CODES: ["REFERRAL_VIEW", "REFERRAL_EDIT"],
  MANAGE_AML: ["AML_VIEW", "AML_EDIT"],
  MANAGE_BILLING: ["BILLING_VIEW", "BILLING_EDIT"],
  MANAGE_USERS: ["USERS_VIEW", "USERS_EDIT"],
}
```

Qualquer grant `MANAGE_X` num `User.privileges` é tratado como `{X_VIEW, X_EDIT}`. Isso torna
**deploy e backfill independentes de ordem** — ninguém perde acesso na janela entre o deploy e o
backfill. Sob M1 o shim pode ficar permanente (custo zero) ou sair no contract opcional.

### Passos de migração

1. **Deploy** (schema aditivo, seguro com `db push`): adiciona os 10 valores novos de `Privilege`
   + o valor `STAFF` de `Role`. Mais o código (taxonomia nova, shim, refactor de gating, papel
   STAFF, UI de grants, guarda anti-lockout).
2. **Backfill** (script via proxy io, igual ao FUEL import): reescreve `User.privileges` —
   `MANAGE_X` → `{X_VIEW, X_EDIT}` usando `LEGACY_PRIVILEGE_MAP`. Idempotente. Provavelmente
   quase-vazio (quase todos os operadores são ADMIN, que pega os novos pelo bundle).
3. **Tombstones ficam.** Contract (remover os `MANAGE_*` antigos do enum) é passo **opcional**
   posterior, quando flex/gabe finalizarem quem-pega-o-quê.

## Refatoração do gating (padrão uniforme)

Mecanismo atual: páginas fazem `redirect("/admin")` salvo `me.privileges.includes("MANAGE_X")`;
actions têm um gate `actor()`/`requirePrivilege("MANAGE_X")` que cobre **leitura e mutação juntas**;
nav (`lib/cms/admin-nav.ts`) gateia folhas por privilege.

Para cada domínio:

- **Página** (`app/admin/<dom>/page.tsx`): `redirect` salvo `X_VIEW`.
- **Action de leitura** (`list*Action`): exige `X_VIEW`.
- **Actions mutadoras** (upsert/delete/create/decisões/money ops): exigem `X_EDIT`.
- **Nav**: folha repointada de `MANAGE_X` → `X_VIEW`.

### Blast radius por domínio

- **FUEL** — `app/admin/fuel/page.tsx` (→VIEW); `actions/cms/fuel.ts`: `listAllocationsAction`→VIEW,
  `upsertAllocationsAction`/`deleteAllocationAction`→EDIT. `components/cms/FuelManager` recebe prop `canEdit`.
- **Referral** — `app/admin/codes/page.tsx` (→VIEW); `actions/cms/codes.ts`: leitura→VIEW, mutações→EDIT.
- **AML** — `app/admin/{kyc,fincen,mtl}/page.tsx` (→VIEW); `actions/cms/{kyc,fincen,mtl}.ts`:
  leituras→VIEW, mutações (decisões KYC, filings FinCEN, edições MTL, rescreen OFAC)→EDIT.
- **Billing** — `app/admin/billing/page.tsx` + 7 subpáginas (subscriptions/promo/treasury/issuing/
  offramp/customers/applications) todas→VIEW; `actions/cms/billing.ts`: leituras→VIEW,
  money ops/promo/applications→EDIT.
- **Users (IAM)** — `app/admin/users/page.tsx` (→`USERS_VIEW`); `actions/cms/users.ts`:
  listar/ler→`USERS_VIEW`; criar/editar/desativar/deletar usuário→`USERS_EDIT`; **atribuir
  papéis/privilégios continua `MANAGE_ROLES`** (inalterado). `actions/cms/account.ts` (self-service)
  inalterado.

## Telas read-only (semântica de "view")

Com `X_VIEW` a página renderiza os **dados** (tabelas, métricas). Sem `X_EDIT`, os **controles de
edição somem** (botões salvar/criar/deletar, forms de mutação). A página (server component) calcula
`canEdit = me.privileges.includes("X_EDIT")` e passa como prop pro componente client, que esconde os
controles. **Defesa em profundidade:** a action mutadora também rejeita sem `X_EDIT` — esconder no
front nunca é a única barreira.

## UI de grants + papéis

- O editor de privileges em `/admin/users` já itera `ALL_PRIVILEGES` → mostra os novos
  automaticamente. `PRIVILEGE_LABELS` ganha rótulos legíveis ("FUEL — ver" / "FUEL — editar", etc.).
- O seletor de papel passa a incluir **STAFF** (via `assignableRoles`).
- Tombstones não aparecem (fora de `ALL_PRIVILEGES`).

## Guarda anti-lockout

Quando começarem a rebaixar ADMINs (incl. shang), tem que ser impossível travar todo mundo pra fora:

- Bloquear remover/rebaixar/desativar/deletar o **último ADMIN**.
- Verificar/reforçar `canManageRole` (não dá pra mexer em quem tem rank ≥ o seu) já existente.
- Auto-rebaixamento que deixaria o IAM órfão é bloqueado pela guarda de último-admin.

## UX: landing do STAFF

O landing `/admin` hoje é a lista de artigos (aberta). Um STAFF só-compliance deve cair na **primeira
tela visível do nav dele** (primeira folha de `visibleNav`), não na de artigos. Ajuste no
layout/landing: se o usuário não tem nenhum privilege de conteúdo, redirecionar pra primeira folha
visível.

## Testes & verificação

Espelhar `tests/cms/admin-nav.test.ts`:

- **Shim** — `MANAGE_FUEL` (etc.) em grants → `{X_VIEW, X_EDIT}` em `effectivePrivileges`.
- **Bundles** — STAFF vazio; ADMIN contém todos os novos; EDITOR/AUTHOR inalterados.
- **`visibleNav`** — folhas gateadas por `X_VIEW`.
- **Gating por domínio** — list exige VIEW, mutate exige EDIT (testar cada action de leitura vs mutação).
- **Guarda último-admin** — não dá pra remover/rebaixar o último ADMIN.

Gate por task: `tsc --noEmit` 0 + `CI=true vitest run` verde.
Migração: diff de schema puramente aditivo (novos valores de enum + STAFF), backfill validado no DB
via proxy (script idempotente sob `.git/sdd/`).
Ao vivo pós-deploy: user STAFF só-VIEW vê dados mas não edita; ADMIN vê tudo; `/admin/*`→307 sem sessão.

## Deploy

branch→PR→merge (`gh pr merge <n> --merge --delete-branch`). Mudança de schema → migrate job
(`db push`) + build regional + bump `newTag` no `k8s/kustomization.yaml` (Flux reconcilia da `main`).

## Fora de escopo

- O **trim em si** (rebaixar os ADMINs atuais) — ação humana posterior do flex/gabe.
- Contract phase (remover tombstones do enum) — passo opcional pro fim.
- Split de `MANAGE_API_KEYS`, `MANAGE_ROLES`, conteúdo (Articles) — fora do recorte (ver "inalterados").
- TOTP — já existe, self-service.
