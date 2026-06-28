# Board: coluna "Requested Tasks" + tag Blocked

**Data:** 2026-06-28
**Repo:** `subfrost.io` (admin único do SUBFROST em `/admin/board`)
**Origem:** demanda do Gabe —
> "Could we add another column for *Requested Tasks* (ideas/fixes que precisam ser
> aprovados pro backlog/assignados)? Probably don't need a Blocked column — we're
> rarely blocked for long and can just note it while it's in progress. Let's change
> the Blocker column to a tag."

## Objetivo

1. Adicionar a coluna **"Requested Tasks"** ao board (triagem de ideias/fixes antes de virarem backlog).
2. Remover a coluna **Blocked** da UI.
3. Transformar "blocked" numa **tag** (chip vermelho) com nota de motivo, aplicável em qualquer coluna — tipicamente numa task que está *In Progress*.

Fix oportunista no mesmo PR (pedido junto):
4. Corrigir o dropdown de **prioridade** no card, cujo popup aparece todo com fundo
   alaranjado no Chrome/Windows.

## Decisões (confirmadas com o Vitor)

- **Blocked = tag dedicada.** Campo booleano `blocked` first-class + chip vermelho
  "Blocked", reaproveitando o `blockerReason` existente como nota. Independe da coluna.
- **"Requested Tasks" substitui a posição da Blocked**, mas o board continua com **4
  colunas**: `Requested Tasks · To do · In Progress · Done`.
- **Criação de task continua default `To do`** (board quick-add e API bearer). A coluna
  "Requested Tasks" é preenchida movendo cards / trocando o status — sem mudança no
  comportamento de criação.
- **Não remover o valor `BLOCKED` do enum.** O deploy aplica o schema com
  `prisma db push --skip-generate` (init-container em `k8s/deployment.yaml`), **sem**
  `--accept-data-loss`. Remover um valor de enum ainda em uso quebraria o boot. Solução:
  mudança 100% **aditiva** + migração de dados das linhas BLOCKED + rede de segurança na
  renderização. `BLOCKED` fica como valor legado morto.

## Arquitetura / mudanças por camada

### 1. Schema Prisma (`prisma/schema.prisma`) — aditivo
- `enum TaskStatus`: adicionar `REQUESTED` (mantém `TODO`, `BLOCKED`, `IN_PROGRESS`, `DONE`).
- `model Task`: adicionar `blocked Boolean @default(false)`. Mantém `blockerReason String @default("")`.

Ambas as mudanças são aditivas → `db push` aplica sem `--accept-data-loss`.

### 2. Tipos & constantes (`lib/tasks/types.ts`)
- `TaskStatus` type: adicionar `"REQUESTED"`.
- `STATUS_ORDER = ["REQUESTED", "TODO", "IN_PROGRESS", "DONE"]` (sem `BLOCKED`).
- `TASK_STATUS`: adicionar entrada `REQUESTED` (`label: "Requested Tasks"`, cor calma e
  distinta — violeta: `text-violet-300` / `bg-violet-400`). **Manter** a entrada `BLOCKED`
  para render seguro de qualquer linha legada.
- `TaskView`: adicionar `blocked: boolean`.

### 3. Board builder (`lib/tasks/board.ts`)
- `buildBoard` itera sobre o novo `STATUS_ORDER` (4 colunas).
- **Rede de segurança:** uma task cujo `status === "BLOCKED"` (legado, caso a migração
  não tenha rodado) é dobrada na coluna `IN_PROGRESS` e marcada como `blocked` na exibição
  — garante que nenhuma task suma do board.

### 4. Store (`lib/tasks/store.ts`)
- `mapTask`: incluir `blocked: r.blocked`.
- `TaskRow` type: incluir `blocked: boolean`.
- `UpdateTaskPatch`: aceitar `blocked?: boolean`.
- `updateTask`: gravar `blocked` quando presente. Manter a gravação de `blockerReason`.

### 5. Server actions (`actions/tasks/board.ts`)
- `StatusEnum`: adicionar `REQUESTED` (manter `BLOCKED` para tolerar valores legados).
- `UpdateTaskSchema`: adicionar `blocked: z.boolean().optional()`.

### 6. API bearer (`app/api/admin/tasks/route.ts`)
- **Sem mudança.** Criação continua default `TODO`; o schema de Ticket não expõe status.

### 7. UI
**`components/cms/board/BoardClient.tsx`**
- Colunas vêm do `STATUS_ORDER` → `Requested Tasks · To do · In Progress · Done`.
  Grid continua `md:grid-cols-4`. Nenhuma mudança estrutural além da fonte de colunas.

**`components/cms/board/TaskCard.tsx`**
- Substituir o bloco condicionado a `status === "BLOCKED"` (linhas ~181–194) por UI
  baseada em `task.blocked`:
  - `blocked === true`: chip vermelho **"Blocked"** (rose) + input de motivo
    (`blockerReason`) quando editor / texto do motivo quando view.
  - toggle (editor): botão discreto pra ligar/desligar `blocked`
    (`updateTaskAction(id, { blocked })`).
- Dropdown de status usa o novo `STATUS_ORDER` (sem opção Blocked).
- **Fix do dropdown de prioridade:** cada `<option>` recebe
  `style={{ color: TASK_PRIORITY[p].color, backgroundColor: "#18181b" }}` (tom do site),
  e remover o `<optgroup label="Priority">` redundante. Mantém `colorScheme: "dark"` e o
  tint do pill fechado (color-coding por prioridade).

**`components/cms/board/TaskDetail.tsx`**
- Status select com "Requested Tasks" (via `STATUS_ORDER`).
- Seção "Blocker" (linhas ~166–176) vira um **toggle `blocked`** + campo de motivo,
  disponível em qualquer status (não mais condicionado a `status === "BLOCKED"`).

**`components/cms/board/TaskRow.tsx`** (view lista)
- Indicador discreto de `blocked` (chip/dot vermelho) opcional. Sem mudança de status.

### 8. Migração de dados
- Script único `scripts/migrate-blocked-tasks.ts`:
  `UPDATE Task SET status='IN_PROGRESS', blocked=true WHERE status='BLOCKED'`.
- Rodado uma vez em prod (in-pod via io-sa, padrão dos outros `scripts/migrate-*.ts`).
- A rede de segurança no `buildBoard` cobre o intervalo entre deploy e execução do script.

## Tailwind
- As classes novas (chip rose do Blocked, cor violeta do Requested) vivem em
  `lib/tasks/types.ts` e nos componentes. As classes de status atuais já moram em `lib/` e
  renderizam hoje → `content` do Tailwind já cobre `lib/`. **Verificar no build** que nada
  é purgado (gotcha conhecido: classe só em `lib/` é purgada se `lib/` não estiver no
  `content`).

## Testes
- **`lib/tasks/board`** (puro, fácil): novo teste cobrindo
  (a) `buildBoard` produz a coluna `REQUESTED` na ordem certa;
  (b) rede de segurança: task `BLOCKED` cai na coluna `IN_PROGRESS`.
- Garantir que `tests/api/admin-tasks.test.ts` continua verde (sem mudança de criação).
- Gates: `prisma generate` → `tsc` 0 erros → `vitest` (os ~8 fails de RPC-offline são
  esperados/OK) → `next build`.

## Deploy
- Branch → PR → review → merge na `main`.
- Bump do `newTag` **com aspas** no kustomization (gotcha: SHA tipo `\d+e\d+` vira float
  YAML → `Init:InvalidImageName`).
- Flux reconcilia (anotar GitRepository/source antes do Kustomization). Esperar Cloud
  Build (~3–5 min).
- Rodar `scripts/migrate-blocked-tasks.ts` em prod (in-pod) e verificar o board ao vivo.

## Fora de escopo
- Nenhuma IAM nova (reusa `tasks.view` / `tasks.edit`).
- Sem mudança no fluxo de criação/aprovação automatizada (Requested é manual por enquanto).
- Sem mexer no board de Initiatives.

## Critérios de aceite
1. Board mostra 4 colunas: **Requested Tasks · To do · In Progress · Done**.
2. Não existe mais coluna Blocked.
3. Dá pra marcar/desmarcar uma task como **Blocked** (chip vermelho) com nota de motivo,
   em qualquer coluna; o motivo persiste.
4. Tasks que estavam em Blocked aparecem em **In Progress** com o chip Blocked (após
   migração e/ou via rede de segurança).
5. Dropdown de prioridade no card abre com fundo no tom do site (sem fundo alaranjado),
   cada nível com sua cor de texto.
6. `tsc` 0 erros, `vitest` verde (fora os RPC-offline), `next build` ok.
