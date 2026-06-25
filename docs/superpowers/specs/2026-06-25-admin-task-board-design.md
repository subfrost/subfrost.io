# Task Board (initiatives) — subfrost.io/admin — design

**Data:** 2026-06-25
**Autor:** Vitor + Claude (brainstorm)
**Demanda:** Gabe (via Vitor) — board de tarefas / user stories no `/admin` pro time
organizar e visualizar trabalho e prioridades.

## 1. Objetivo

Um board colaborativo dentro do `/admin` onde o time cria tasks e se auto-atribui com
**baixíssimo atrito** (requisito nº1 do Gabe), agrupa o trabalho em **initiatives**
(grupos rumo a um objetivo, ex. "frUSD deployment"), e filtra/visualiza por status,
initiative, label e owner.

Requisitos verbatim do Gabe:
- Facilidade de uso = nº1: auto-atribuir + criar tasks com baixo atrito.
- Task mínima: **título, descrição, owner, label filtrável** (repos deles + "marketing").
- **Tags evoluem → initiatives**: ao criar uma initiative, **a maioria das tasks dela é
  criada junto** (de uma vez), e dá pra **filtrar o board pela initiative**.

## 2. Decisões (brainstorm + mockup aprovado)

- **Modelo:** `Initiative` (model próprio: nome + objetivo + cor + seeding) **+ labels
  livres** (`String[]`) na Task. Duas dimensões filtráveis. Não toca no `Tag` de artigos.
- **Views:** **Board (kanban) ⇄ List (tabela densa)** com toggle.
- **Seeding:** ao criar uma initiative, **textarea multi-linha** → cada linha vira uma
  Task `TODO` já na initiative.
- **Mover/concluir:** mover card entre status via **controle no card** (dropdown de
  status) + **botão "mark done"** de 1 clique. (HTML5 drag-and-drop = fast-follow.)
- **Gating:** categoria IAM nova `tasks` com `tasks.view` / `tasks.edit`. ADMIN herda
  (não-restrito). Concede ao time via grant/persona.
- **Rota/nav:** grupo **Board** → `/admin/board` (Tasks) + `/admin/board/initiatives`.
- **Status v1:** `TODO / IN_PROGRESS / DONE`. **Prioridade:** `LOW / MEDIUM / HIGH`.
- **Visual:** casar com o tema dark real do `/admin` (zinc-950/900, borders zinc-800,
  texto zinc-100/400, acentos sky-400/300/500), padrão dos managers existentes.

## 3. Não-objetivos (v1, YAGNI)

HTML5 drag-and-drop; due dates; comentários/anexos; múltiplos owners; sub-tasks; colunas
BLOCKED/REVIEW; reordenação manual drag (o campo `position` existe, mas v1 ordena por
prioridade). Todos são fast-follow triviais sobre este schema.

## 4. Modelo de dados (Prisma — aditivo)

Adicionar ao `prisma/schema.prisma`:

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

model Initiative {
  id          String   @id @default(cuid())
  name        String
  goal        String   @default("")        // objetivo/descrição
  color       String   @default("#38bdf8") // sky-400; chip + dot
  archived    Boolean  @default(false)
  createdById String?                       // informativo (sem FK)
  tasks       Task[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([archived])
}

model Task {
  id           String       @id @default(cuid())
  title        String
  description  String       @default("")
  status       TaskStatus   @default(TODO)
  priority     TaskPriority @default(MEDIUM)
  labels       String[]     @default([])    // freeform: repos + "marketing" etc.
  ownerId      String?
  owner        User?        @relation("TaskOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  initiativeId String?
  initiative   Initiative?  @relation(fields: [initiativeId], references: [id], onDelete: SetNull)
  createdById  String?                       // informativo (sem FK)
  position     Float        @default(0)      // ordenação dentro da coluna (fast-follow)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([status])
  @@index([initiativeId])
  @@index([ownerId])
}
```

`User` ganha **uma** back-relation: `tasksOwned Task[] @relation("TaskOwner")`.
`createdById` em ambos é `String?` simples (sem FK) — minimiza churn no `User`; não é
exibido no v1. Initiative→Task usa `SetNull` ao deletar a initiative (tasks viram
"sem initiative", não somem).

## 5. Arquitetura (padrão agregador-puro + store-fino + actions-gated)

Mesmo padrão de Marketing/Financials já no repo.

```
lib/tasks/
  types.ts     # TaskView, InitiativeView, BoardData, BoardFilter,
               # TASK_STATUS / TASK_PRIORITY metadata (label + classes dark = fonte única),
               # SUGGESTED_LABELS (repos + "marketing")
  store.ts     # Prisma fino: listTasks, createTask, updateTask, moveTask, claimTask,
               # deleteTask; listInitiatives, createInitiativeWithSeed, updateInitiative,
               # archiveInitiative; map row→View; class TaskError extends Error
  board.ts     # PURO (sem I/O): buildBoard(tasks, initiatives, filter) → BoardData
               # (3 colunas ordenadas), applyFilter, initiativeProgress, distinctLabels

actions/tasks/
  board.ts     # "use server" — actions gated; zod; audit; revalidatePath

app/admin/board/
  page.tsx               # gated tasks.view; carrega data; <BoardClient/>
  initiatives/page.tsx   # gated tasks.view; <InitiativesClient/>

components/cms/board/
  BoardClient.tsx      # toggle Board⇄List, filtros, quick-add, colunas
  TaskCard.tsx         # card: título, chip prioridade, dot+nome initiative, labels,
                       # owner/assign-to-me, dropdown status, mark-done
  BoardFilters.tsx     # pills initiative + label + "My tasks" + status
  TaskRow.tsx          # linha da List view
  InitiativesClient.tsx# lista + form "New initiative" (nome/goal/cor/textarea seed)
```

### 5.1 `lib/tasks/board.ts` (puro, unit-testável)

- `buildBoard(tasks: TaskView[], initiatives: InitiativeView[], filter: BoardFilter): BoardData`
  - aplica o filtro, agrupa por `status` em 3 colunas na ordem `TODO → IN_PROGRESS → DONE`,
    ordena cada coluna por `priority` desc (`HIGH>MEDIUM>LOW`) → `position` asc → `updatedAt` desc,
    e devolve `columns` (com `count`) + `total`.
- `applyFilter(tasks, filter)` — filtro por `initiativeId`, `label`, `ownerId` (`mine`),
  `status` (cada campo opcional; ausência = não filtra).
- `initiativeProgress(initiativeId, tasks)` → `{ total, done, active, pct }`.
- `distinctLabels(tasks)` → labels presentes, ordenadas, p/ o filtro.

Funções puras: sem Prisma, sem `Date.now()` injetado externamente. Fácil de testar.

### 5.2 `actions/tasks/board.ts` (gated)

Gate igual ao de marketing: `currentUser()` → checa privilege → `{ ok:false, error:"unauthorized" }`.
Leitura usa `tasks.view`; mutação usa `tasks.edit`. Toda action valida input com `zod`,
chama o store, faz `audit(...)` e `revalidatePath("/admin/board")` (+ `/initiatives` quando aplicável).

- `createTaskAction(input)` — title obrigatório; status/priority default; labels/initiativeId/ownerId opcionais. (quick-add manda só title + initiative do filtro.)
- `updateTaskAction(id, patch)` — title/description/priority/labels/initiativeId.
- `moveTaskAction(id, status)` — muda só o status (dropdown / mark-done = `DONE`).
- `claimTaskAction(id)` — seta `ownerId = me.id` ("assign to me").
- `deleteTaskAction(id)`.
- `createInitiativeAction(input)` — name/goal/color + `seedText` (multi-linha): split por `\n`, `trim`, descarta linhas vazias → cria a initiative e N tasks `TODO` nela numa transação.
- `updateInitiativeAction(id, patch)` / `archiveInitiativeAction(id)`.

Retorno discriminado `{ ok:true, value } | { ok:false, error }` (padrão do repo).

## 6. UX (low-friction, req nº1)

- **Quick-add** no topo do board: 1 input (só título, Enter) → cria Task `TODO`/`MEDIUM`,
  sem owner, **já na initiative/label do filtro ativo** (se houver). Atrito mínimo.
- **Assign to me** num clique no card (e filtro "My tasks").
- **Mover**: dropdown de status no card (To do / Doing / Done) + atalho **mark-done**
  (check de 1 clique → `DONE`). Sem drag no v1.
- **Board view**: 3 colunas com contagem; cards com chip de prioridade (cores dark),
  dot+nome da initiative, labels, avatar do owner.
- **List view**: tabela densa (título, status, prioridade, owner, initiative, labels).
- **Filtros** (valem nas 2 views): initiative, label, owner/"My tasks", status.
- **Initiatives page** (`/admin/board/initiatives`): lista com barra de progresso
  (done/total) + "ver no board filtrado"; form **New initiative** = nome + goal + cor +
  **textarea (1 task por linha)** → seeding. Arquivar initiative.

Avatares de owner = iniciais (padrão `AddressAvatar`/iniciais já usado no repo), resolvidos
via `owner.name`/`email` no `TaskView`.

## 7. IAM / gating (wiring)

`lib/cms/iam/registry.ts`:
- `CategoryKey` += `"tasks"`; `CATEGORIES` += `{ key:"tasks", label:"Board" }`.
- `PRIVILEGES` +=
  - `{ code:"tasks.view", label:"Board — view", description:"View the team task board and initiatives.", category:"tasks", implies:[] }`
  - `{ code:"tasks.edit", label:"Board — edit", description:"Create, claim, move, and edit tasks and initiatives.", category:"tasks", implies:["tasks.view"] }`
- `VIEW_GATES` += `"/admin/board": { view:"tasks.view", edit:"tasks.edit" }` e
  `"/admin/board/initiatives": { view:"tasks.view", edit:"tasks.edit" }`.

`lib/cms/iam/icons.tsx`: `CATEGORY_ICON.tasks = KanbanSquare` (lucide `KanbanSquare` — confirmado disponível; `LayoutKanban` NÃO existe).

`lib/cms/admin-nav.ts`: novo `NavGroup` **Board** (icon `KanbanSquare`) com leaves
`{ Tasks → /admin/board, priv tasks.view }` + `{ Initiatives → /admin/board/initiatives, priv tasks.view }`.
Posicionar logo após **Articles** (trabalho do time fica no topo).

ADMIN herda `tasks.*` automaticamente (`ADMIN = ALL_CODES \ RESTRICTED`). Páginas gated com
`currentUser()` + `redirect("/admin")` se faltar `tasks.view` (padrão das outras páginas).

## 8. Tema / estilo

Casar com os managers existentes (ex. `MtlManager`, `SnapshotsClient`): superfícies
`bg-zinc-900/40`, borders `border-zinc-800`, texto `text-zinc-100`/`text-zinc-400`,
acento `sky-400/300/500`, `rounded-md`/`rounded-lg`. Vocabulário de cores de status e
prioridade vive em `TASK_STATUS`/`TASK_PRIORITY` (types.ts) como **fonte única** (label +
classes Tailwind dark), espelhando o padrão `MTL_STATUS_CLS` já promovido no repo:
- Prioridade: HIGH = rose/red, MEDIUM = amber, LOW = zinc.
- Status: TODO = zinc, IN_PROGRESS = sky, DONE = emerald.
A cor da initiative (`color` hex) pinta o dot/coluna-accent.

## 9. Migração / deploy

- Schema **aditivo** → init container `prisma db push` no boot (padrão das frentes
  MarketingSnapshot/analytics). `prisma generate` **antes** dos gates locais.
- Deploy = PR→merge main → bump `newTag` no `k8s/` → Flux (source antes do Kustomization).
  Human-owned (Vitor dá o go).

## 10. Testes (TDD por task)

- `lib/tasks/board.ts` (puro): agrupamento por status; ordenação por prioridade/position;
  filtros (initiative/label/owner/status, isolados e combinados); progresso da initiative;
  lista vazia.
- `lib/tasks/store.ts`: `createInitiativeWithSeed` cria N tasks (split/trim, ignora linhas
  vazias) na initiative; `claimTask` seta owner; `moveTask` muda status; mapeamento row→View.
- actions: gate nega sem privilege; zod rejeita title vazio; happy-path retorna `ok:true`.
- componentes (jsdom): quick-add cria; "assign to me" dispara action; toggle Board⇄List;
  filtro esconde não-correspondentes; mark-done move pra DONE.
- gate de rota: `/admin/board` redireciona (307) sem `tasks.view`.

Rodar a suíte **cheia** ao mexer em arquivo compartilhado (registry/nav/icons/schema).

## 11. Verificação / aceite

- Gates locais: `npx prisma generate` → `npx tsc --noEmit` 0 · `npx vitest run` verde ·
  `npm run build` 0 (em `C:\Alkanes Geral Dev\subfrost.io`).
- Feature: `/admin/board` e `/admin/board/initiatives` gated (307 sem `tasks.view`);
  CRUD de task/initiative; filtro por initiative/label/owner mostra só as tasks certas;
  "assign to me" seta owner; mover/mark-done muda status; criar initiative com textarea
  semeia N tasks; toggle Board⇄List.
- Live só após deploy (bump→Flux), com o go do Vitor.
