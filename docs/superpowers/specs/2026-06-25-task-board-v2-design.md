# Task board v2 (demandas do Gabe) — design

**Data:** 2026-06-25
**Repo:** `subfrost.io` (Next.js + Prisma + Postgres; `subfrost.io/admin/board`)
**Status:** aprovado no brainstorm, pronto pra plano

## Objetivo

Implementar os 8 pedidos do Gabe pro task board ao vivo (`/admin/board` + `/admin/board/initiatives`).
Tudo **aditivo e não-destrutivo** (board já está em produção); **sem nova categoria IAM** (reusa
`tasks.view`/`tasks.edit`, ADMIN herda). Migração via init container `prisma db push` no boot.

## Pedidos do Gabe (cobertura 1:1)

**Tasks:**
1. Coluna "Doing" → label **"In Progress"**; adicionar coluna **"Blocked"** (2ª coluna).
2. Ao mover pra Blocked, campo inline pro **motivo do bloqueio** (rápido).
3. Chip de prioridade clicável → dropdown **Low / Med / High / Fire**; header do dropdown e o
   hover dizem **"Priority"**.
4. **Remover** o botão verde "Done" à direita do status box (o status dropdown ainda leva a Done).
5. "Assign to me" → **"Self-assign"**; adicionar botão **"Assign"** à direita = dropdown que
   atribui a task a **outro usuário**.
6. Atribuir **initiative** no card, **alinhado à esquerda do título**; dropdown com initiatives cujo
   status é **To Do ou In Progress**.
7. **"Bulk Add"** no topo do Tasks board: cria várias tasks atribuídas a uma initiative.

**Initiatives:**
8. **View de board** nas Initiatives com as mesmas colunas das Tasks, trocando "Blocked" por
   **"On Hold"**: **To Do · On Hold · In Progress · Done**. **Sem** view de "List".

## Decisões de escopo (confirmadas)

- **Ordem das colunas de Tasks:** **To Do · Blocked · In Progress · Done** (Blocked como 2ª).
- **Ordem das colunas de Initiatives:** **To Do · On Hold · In Progress · Done** (espelha, On Hold na 2ª).
- **Assign:** sempre disponível (canEdit) — atribui / reatribui / limpa o dono. "Self-assign"
  continua como atalho rápido quando a task está sem dono.
- **Motivo do bloqueio:** **opcional**, inline no card, só aparece quando status = Blocked; persiste.
- **Bulk Add:** a initiative é **obrigatória** (escolhida entre as To Do / In Progress).
- O dropdown de initiative no card lista as selecionáveis (To Do/In Progress, não-arquivadas) +
  **"— None —"**; se a task já estiver numa initiative On Hold/Done, ela aparece como valor atual.

## Abordagem

Estender o que já existe — enums, `lib/tasks/{types,store,board}.ts`, `actions/tasks/board.ts`,
`components/cms/board/*`. A única decisão de fundo: as **Initiatives ganham um status explícito**
(`InitiativeStatus`), porque o pedido #8 exige movê-las entre colunas (To Do/On Hold/In Progress/Done)
— "On Hold" não dá pra derivar do progresso das tasks. Sem drag-and-drop (move via dropdown, como hoje).

## Schema (aditivo)

- `enum TaskStatus` += `BLOCKED` → `{ TODO, BLOCKED, IN_PROGRESS, DONE }`.
- `enum TaskPriority` += `FIRE` → `{ LOW, MEDIUM, HIGH, FIRE }`.
- `Task.blockerReason String @default("")`.
- novo `enum InitiativeStatus { TODO, IN_PROGRESS, ON_HOLD, DONE }`.
- `Initiative.status InitiativeStatus @default(TODO)`.

Existentes: tasks mantêm status; `blockerReason=""`; initiatives → `TODO`. Zero quebra. `prisma db push`
no boot cria a coluna/enum.

## Camada de tipos (`lib/tasks/types.ts`)

- `TaskStatus` union += `"BLOCKED"`; `TaskPriority` union += `"FIRE"`.
- `STATUS_ORDER = ["TODO", "BLOCKED", "IN_PROGRESS", "DONE"]`.
- `TASK_STATUS`: `IN_PROGRESS.label` vira **"In Progress"**; `BLOCKED = { label: "Blocked", cls:
  text-rose-300, dot: bg-rose-400 }`.
- `TASK_PRIORITY` += `FIRE = { label: "Fire", rank: 3, cls: "bg-orange-500/15 text-orange-300" }`
  (ranks: LOW 0, MEDIUM 1, HIGH 2, FIRE 3). Novo `PRIORITY_ORDER = ["LOW","MEDIUM","HIGH","FIRE"]`.
- `TaskView` += `blockerReason: string`.
- Novo `InitiativeStatus = "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE"`;
  `INITIATIVE_STATUS_ORDER = ["TODO", "ON_HOLD", "IN_PROGRESS", "DONE"]`; `INITIATIVE_STATUS` record
  (labels "To do" / "On hold" / "In Progress" / "Done" + cls).
- `InitiativeView` += `status: InitiativeStatus`.
- `MemberView` (pro Assign) reusa o shape `{ id: string; name: string | null; email: string }`
  (= `OwnerView`).

## Store (`lib/tasks/store.ts`)

- `TaskRow`/`mapTask` += `blockerReason`. `UpdateTaskPatch` += `blockerReason?`; `updateTask` grava
  `data.blockerReason` (trim, default "").
- `assignTask(id, ownerId: string | null)` — seta/limpa o `ownerId`. (`claimTask` continua = self.)
- `listAssignableUsers(): Promise<MemberView[]>` — `prisma.user.findMany({ where:{active:true},
  select:{id,name,email}, orderBy:{name} })`.
- `bulkCreateTasks({ initiativeId, titles, createdById })` — cria N tasks (titles trim/filter,
  `initiativeId` setado) numa transação; retorna a contagem criada.
- `InitiativeRow`/`mapInitiative` += `status`. `moveInitiative(id, status: InitiativeStatus)`.

## Lógica de board (`lib/tasks/board.ts`)

- `STATUS_ORDER` (4) → `buildBoard` produz 4 colunas (ordenação por prioridade já cobre FIRE via rank).
- `buildInitiativeBoard(initiatives): { columns: { status, title, initiatives, count }[] }` agrupando
  por `INITIATIVE_STATUS_ORDER`.
- `selectableInitiatives(initiatives)` = filtra `status ∈ {TODO, IN_PROGRESS}` e `!archived`
  (alimenta o dropdown do card e o Bulk Add).

## Actions (`actions/tasks/board.ts`)

- `StatusEnum` += `"BLOCKED"`; `PriorityEnum` += `"FIRE"`; novo `InitiativeStatusEnum`.
- `UpdateTaskSchema` += `blockerReason: z.string().optional()`.
- `assignTaskAction(id, ownerId: string | null)` — gate `tasks.edit`; se `ownerId` ≠ null, **valida**
  que é um user ativo real; `store.assignTask`; `audit("task_assign")`.
- `bulkCreateTasksAction({ initiativeId, titles })` — gate; `initiativeId` obrigatório + ≥1 title;
  `store.bulkCreateTasks`; `audit("task_bulk_create")`.
- `moveInitiativeAction(id, status)` — gate; `store.moveInitiative`; `audit("initiative_move")`.
- `audit.ts`: adicionar os literais `task_assign`, `task_bulk_create`, `initiative_move` à união.
- Todas seguem o padrão: gate → zod safeParse → store → audit → `revalidatePath` → `{ok}|{error}`.

## UI

### TaskCard (`components/cms/board/TaskCard.tsx`)
- **Eyebrow** (acima do título, alinhado à esquerda): dropdown de initiative — opções =
  `selectableInitiatives` + "— None —"; mostra a initiative atual mesmo se não-selecionável; muda via
  `updateTaskAction({ initiativeId })`. Dot na cor da initiative.
- **Linha do título:** título (esquerda) + **dropdown de prioridade** (direita): `<select>` com
  `title="Priority"` + `<optgroup label="Priority">` contendo Low/Med/High/Fire (via `PRIORITY_ORDER`);
  muda via `updateTaskAction({ priority })`. Chip colorido pela cls da prioridade.
- **Owner:** se atribuído → avatar (iniciais); **"Self-assign"** (quando sem dono, `claimTaskAction`)
  + **"Assign ▾"** (sempre, canEdit) = `<select>` de `members` + "Unassign" → `assignTaskAction(id,
  ownerId|null)`.
- **Footer:** dropdown de status (inclui **Blocked**; via `moveTaskAction`); **botão verde "Done"
  REMOVIDO**; lixeira (delete) à direita.
- **Quando status = Blocked:** input de texto inline (opcional) pro `blockerReason`, salvo on-blur via
  `updateTaskAction({ blockerReason })`; estilizado em rose.

### BoardClient (`components/cms/board/BoardClient.tsx`)
- Grid de **4 colunas** (`md:grid-cols-4`).
- Recebe `members` (de `listAssignableUsers`) e repassa pro `TaskCard`.
- **Bulk Add** no topo (ao lado do quick-add): botão que abre um painel = `<select>` de initiative
  (`selectableInitiatives`) + `<textarea>` (um título por linha, contador) → `bulkCreateTasksAction`.
- Mantém o quick-add e os filtros.

### InitiativesBoard (`components/cms/board/InitiativesClient.tsx` → reescrita p/ board)
- **Kanban de 4 colunas** por `INITIATIVE_STATUS_ORDER` (To Do · On Hold · In Progress · Done) via
  `buildInitiativeBoard`. **Sem** toggle List.
- Cada card de initiative: nome + dot + barra de progresso (`initiativeProgress`) + **dropdown de
  status** (move entre colunas, `moveInitiativeAction`) + archive. Mantém o form "New initiative" (com
  seed) no topo.

### TaskRow (list view de Tasks)
- Sem mudança estrutural — renderiza o status (Blocked incluso) via `TASK_STATUS`. (Initiatives não
  têm List.)

### Pages
- `app/admin/board/page.tsx`: carrega `listAssignableUsers()` e passa `members` pro `BoardClient`.
- `app/admin/board/initiatives/page.tsx`: carrega initiatives (com `status`) + tasks → `InitiativesBoard`.

## Gating / segurança

- Páginas gated por `tasks.view` (`currentUser()`→redirect login/`/admin`); mutations por `tasks.edit`.
- `assignTaskAction` valida o `ownerId` (user ativo real) antes de gravar — sem injeção de id arbitrário.
- **Sem nova categoria IAM** (reusa `tasks.*`).

## Fora de escopo

- Drag-and-drop (move continua por dropdown).
- Notificações / comentários em task (eram §1 das upcoming-demands — explicitamente fora; seguimos só
  a demanda do Gabe).
- Novos privilégios.

## Verificação

- **Gates:** `npx prisma generate` → `npx tsc --noEmit` (0) → `npx vitest run` (verde) → `npm run build` (0).
- **Funcional:** Tasks board mostra 4 colunas na ordem certa; mover pra Blocked revela o campo de motivo;
  prioridade cicla Low/Med/High/Fire com header/hover "Priority"; sem botão verde Done; Self-assign +
  Assign (atribui a outro user) funcionam; initiative dropdown no card lista To Do/In Progress; Bulk Add
  cria N tasks numa initiative; Initiatives board mostra 4 colunas (On Hold no lugar de Blocked) sem List
  view; mover initiative entre colunas funciona.
- **Migração aditiva:** tasks/initiatives antigos renderizam (status default, blocker vazio).

## Deploy (human-owned, Vitor dá o go)

PR → merge → bump `newTag` no `k8s/…kustomization.yaml` (⚠️ **com aspas**) → Flux (source antes do
Kustomization). `prisma db push` no init cria as colunas/enums no boot.
