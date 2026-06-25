# Co-authors em artigos — design

**Data:** 2026-06-25
**Repo:** `subfrost.io` (Next.js + Prisma + Postgres; `subfrost.io/admin`)
**Status:** aprovado no brainstorm, pronto pra plano

## Objetivo

No editor de artigo, um campo pra adicionar **membro(s) que ajudaram** no artigo. Esses
co-autores aparecem no **byline** ("por X e Y") no leitor, na home e no preview admin. Hoje cada
`Article` tem **um** autor só (`author`/`authorId`). Esta feature é **aditiva e não-destrutiva**:
artigos existentes continuam válidos com lista de co-autores vazia.

## Decisões de escopo (confirmadas)

1. **Vários co-autores** — relação M:N (não um único campo).
2. **Onde aparece:** leitor do artigo **+** cards/home. (Na prática só o widget da home
   `LatestArticles` mostra autor em card; o `ArticleCard` do `/articles` mostra só tag+data e
   **não** é tocado.)
3. **Fora do follow/notify** — v1 é puramente visual no byline; co-autor **não** entra em
   `AuthorSubscription` nem dispara notify-on-publish.
4. **Bio cards:** "todos com bio" — a seção "Written by" no fim do artigo renderiza **um card de
   bio por autor/co-autor que tenha bio cadastrada** (autor principal primeiro, co-autores por nome).

## Abordagem escolhida

**M:N implícita `coAuthors User[]`**, espelhando o padrão já testado das tags
(`Tag[] @relation("ArticleTags")`). Prisma cria a join table `_CoAuthoredArticles`; o
`prisma db push` no boot (init container) a cria de forma aditiva.

Alternativas descartadas:
- **Modelo de join explícito** (`ArticleCoAuthor` com `order`/role): preserva ordem manual e abre
  espaço pra rótulos, mas é mais schema+código. YAGNI — "por X e Y" em ordem alfabética resolve a v1.
- **`String[]` de userIds:** sem integridade referencial nem join pro perfil (avatar/bio), quebra
  se um user é removido.

**Trade-off aceito:** M:N implícita não guarda ordem de inserção → os co-autores são exibidos
**ordenados por nome** (determinístico). O autor principal vem sempre primeiro.

## Componentes

### 1. Schema (`prisma/schema.prisma`) — aditivo

- `model Article`: `coAuthors User[] @relation("CoAuthoredArticles")`.
- `model User`: `coAuthoredArticles Article[] @relation("CoAuthoredArticles")`.
- Sem migração SQL versionada — schema novo entra em prod via init container `prisma db push` no
  boot (mesmo mecanismo do campo `sources` do PR#92). Artigos antigos ⇒ join vazia.

### 2. Camada de dados (`lib/cms/articles.ts`)

- `ArticlePreview` (e `ArticleFull` por herança) ganha **`coAuthors: AuthorProfile[]`**.
- `baseSelect`: adiciona `coAuthors` selecionando os mesmos campos do `author`
  (`id, name, email, avatarUrl, bio, twitter`).
- `ArticleRow`: tipo ganha o array `coAuthors`.
- `toPreview`: mapeia `coAuthors` → `AuthorProfile[]` (`name = name ?? email`), **ordenado por
  nome**, **excluindo** o autor principal (defesa contra dado inconsistente).
- `previewFallbackArticles` e o mapeamento de preview ganham `coAuthors: []`.

### 3. Editor (`AdminEditor.tsx` + as 2 server pages)

- `app/admin/articles/[id]/page.tsx` e `app/admin/articles/new/page.tsx` carregam:
  - `members`: `prisma.user.findMany({ where: { active: true }, select: { id, name, email }, orderBy: { name } })` → `{ id, name }[]` (`name = name ?? email`).
  - `coAuthorIds` atuais (no editor de edição; vazio no new).
  - Passam ambos pro `AdminEditor` via props novas (`members`, `coAuthorIds`).
- `AdminEditor`: estado `coAuthorIds: string[]`. Nova seção no sidebar de settings (abaixo de
  Tags): **"Co-authors"** — chips clicáveis de membros (selecionado = preenchido / não-selecionado
  = outline), sem dropdown (time pequeno → low-friction). O **autor principal é excluído** da lista
  de opções (não pode ser co-autor de si mesmo). No `new`, o autor principal = usuário atual.
- `submit()` inclui `coAuthorIds` no payload do `saveArticle`.

### 4. Write action (`lib/cms/article-write.ts`)

- `articleInputSchema`: `coAuthorIds: z.array(z.string()).optional().default([])`.
- Saneamento antes de gravar: **dedupe**, **remove o `authorId`** do array, e **filtra** pros ids
  que existem como `User` (`prisma.user.findMany({ where: { id: { in } }, select: { id } })`) —
  defesa, já que o seletor só oferece membros válidos.
- **Create:** `coAuthors: { connect: ids.map(id => ({ id })) }`.
- **Update:** `coAuthors: { set: ids.map(id => ({ id })) }` (substitui o conjunto inteiro, igual
  `tags: { set: [] }`). Roda dentro da `$transaction` existente.

### 5. Byline + bio cards

- `components/articles/AuthorByline.tsx`: prop nova **opcional** `coAuthors?: AuthorProfile[]`
  (aditiva — não quebra call sites existentes).
  - Linha de nome: "X e Y" (2) / "X, Y e Z" (3+), conjunção localizada (en `and` / zh `和`,
    separador `, ` / `、`). Cada nome linkado pro `/authors/[id]` quando `linkAuthor` (no `compact`
    de card os nomes ficam em texto puro, como hoje, pra não aninhar `<a>`).
  - Avatar: no variant `full`, um **stack** discreto sobreposto (autor + co-autores, cap 3, com
    "+N" se passar); no `compact`, mantém só o avatar do autor principal.
- `components/cms/ArticleView.tsx`: `ArticleViewData` ganha `coAuthors?: AuthorProfile[]`.
  - Header passa `coAuthors` pro `AuthorByline`.
  - **Bio cards:** seção "Written by"/"作者" lista **um card por autor/co-autor com `bio`**
    (autor principal primeiro, co-autores por nome). Com 1 autor, saída idêntica à de hoje.
- **Leitor público** (`app/articles/[slug]/page.tsx`): passa `a.coAuthors` pro `ArticleView`;
  inclui os co-autores no array `authors` do `generateMetadata` (SEO, barato).
- **Preview admin** (`app/admin/articles/[id]/preview/page.tsx`): adiciona `coAuthors` ao
  `include` do prisma e mapeia pro `ArticleView` (mesmo shape do `author`).
- **Home widget** (`components/articles/LatestArticles.tsx`): a interface `Preview` ganha
  `coAuthors`; a linha do autor mostra "X e Y".
- **Busca** (`components/articles/ArticleSearchPrompt.tsx`): adiciona os nomes de co-autores ao
  texto indexado (de brinde).

## Gating / segurança

- **Sem nova categoria IAM.** Editar co-autores passa pelo mesmo caminho
  `saveArticle` → `upsertArticle`, já gateado por ownership ou `articles.edit_any`.
- Validação server-side dos ids (existência) impede injeção de id arbitrário via payload.

## Fora do escopo (v1)

- Follow / notify-on-publish de co-autor.
- Ordem manual dos co-autores (são exibidos por nome).
- Rótulos de papel (editor/revisor/etc.).

## Verificação

- **Gates:** `prisma generate` → `npx tsc --noEmit` (0) → `npx vitest run` (tudo passa) →
  `npm run build` (0).
- **Funcional (local/preview):** criar/editar artigo, adicionar co-autor(es), ver o byline
  "por X e Y" no `ArticleView` (leitor) **e** no preview admin; artigo SEM co-autor continua só com
  o autor; bio card por autor com bio; home widget mostra "X e Y".
- **Round-trip:** salvar → recarregar o editor → co-autores persistem.
- **Migração aditiva:** artigo antigo (sem co-autor) renderiza idêntico ao de antes.

## Deploy (human-owned, Vitor dá o go)

PR → merge → bump `newTag` no `k8s/…kustomization.yaml` (⚠️ **com aspas**) → Flux (anotar
GitRepository/source antes do Kustomization). `prisma db push` no init cria a join table no boot.
