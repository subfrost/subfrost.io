# Spec — Páginas de PROFILE por projeto no subfrost.io/ecosystem

**Data:** 2026-07-04 · **Aprovado por:** Vitor · **Repo:** `C:\Alkanes Geral Dev\subfrost.io` (Next 16 + Prisma + pnpm, prod GKE via Flux)

## Objetivo

Passo DefiLlama no diretório /ecosystem: card → página de profile **interna** `/ecosystem/<slug>` → links externos dentro do profile. Conteúdo rico em markdown EN/ZH, múltiplos contratos por projeto, edição no /admin. Showcase inicial: Arbuzino (PROFILE.md do misha).

## Decisões (brainstorm 2026-07-04)

1. **Conteúdo = markdown único EN/ZH** (`profileEn`/`profileZh` no `EcosystemProject`), renderizado com o pipeline de artigos (react-markdown + gfm + rehype-sanitize + highlight). Header da página vem dos campos estruturados existentes.
2. **Contratos = tabela relacional** `EcosystemProjectContract` (não markdown), renderizada como seção "Contracts". Abre caminho pra TVL/métricas via view opcodes depois.
3. **Card → interno sempre** (`/ecosystem/<slug>` pra todos os cards, mesmo profile magro); **LinksRow permanece no card** como atalho externo.
4. **Admin = textarea + preview** (markdown cru, preview com o pipeline do site). Nada de editor rico.

## Modelo de dados (aditivo — `prisma db push` sem `--accept-data-loss`)

```prisma
model EcosystemProject {
  // ... campos existentes ...
  profileEn String @default("")
  profileZh String @default("")
  contracts EcosystemProjectContract[]
}

model EcosystemProjectContract {
  id        String @id @default(cuid())
  projectId String
  project   EcosystemProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  label     String
  alkaneId  String            // "block:tx"
  noteEn    String @default("")
  noteZh    String @default("")
  sortOrder Int    @default(0)

  @@index([projectId, sortOrder])
}
```

O `alkaneId` "principal" do projeto (badge do card) continua existindo e independente.

## Rota pública — `app/ecosystem/[slug]/page.tsx`

- Server component, chrome **EditorialShell** (igual /ecosystem). Locale via cookie `subfrost_locale` (padrão do site, SSR).
- Busca `slug` + `published: true`; senão `notFound()`.
- Layout, de cima pra baixo:
  1. Breadcrumb "← Ecosystem" (link interno pra `/ecosystem`).
  2. Header: logo (Mark com fallback de gradiente/iniciais), nome, categoria, StatusBadge, badge alkaneId principal (→ ordiscan, como no card), botões **Website ↗ / 𝕏 / Docs** (externos).
  3. Corpo: markdown `profileEn|profileZh` (fallback EN se ZH vazio) pelo pipeline de artigos.
  4. Seção **Contracts** (se houver linhas): tabela label · `block:tx` (link → `https://espo.sh/alkane/<block:tx>`) · nota curta (EN/ZH). Ordenada por `sortOrder`.
- Explorer das linhas de contrato = **espo.sh** (URL funciona só com o id; ordiscan exige nome vanity que o label nem sempre é). Badge principal do card segue ordiscan.
- SEO: `generateMetadata` (title = nome do projeto, description = descriptionEn/Zh). **Fora do sitemap e do nav** — soft-launch continua; `tests/integration.test.ts` que trava isso não muda.
- Tema duplo `--ed-*`: fundo/texto sempre via tokens.

## Card — `components/ecosystem/EcosystemDirectory.tsx`

- Stretched-link overlay (`absolute inset-0 z-0`) deixa de ser `<a href={p.url} external>` e vira `<Link href={"/ecosystem/" + p.slug}>` nos DOIS grids (featured + normal).
- LinksRow (Website/X/Docs) e AlkaneBadge permanecem no card, `relative z-10` (anchors nunca aninham — overlay é sibling).

## Mapper — `lib/ecosystem/public.ts`

- Novo `getEcosystemProfile(slug, locale)`: projeto publicado + `profile` (markdown já resolvido por locale) + `contracts[]` (label, alkaneId, note por locale, ordenados). Retorna `null` se não existir/não publicado.
- `PublicEcosystemProject` não muda (o grid não precisa do corpo longo).

## Admin — `components/cms/ecosystem/EcosystemAdmin.tsx` + API CMS

- Form do projeto ganha:
  - Textareas **Profile (EN)** e **Profile (ZH)** com toggle de **preview** renderizado (mesmo pipeline do site).
  - Repeater de **contratos**: linhas label / alkaneId / nota EN / nota ZH / ordem; adicionar/remover linha. Persistência via API CMS existente (estender payload + rota).
- Gating IAM `ecosystem.edit` como já é. Sem editor rico (4 demandas do editor seguem ADIADAS).

## Copy EN/ZH

Novas strings (breadcrumb, "Contracts", títulos/aria) seguem o padrão de copy de `app/ecosystem/page.tsx` — EN e 中文.

## Conteúdo showcase (pós-deploy)

- Popular o profile do **Arbuzino** com o PROFILE.md do misha adaptado: tabela de 6 contratos vai pro repeater; corpo (overview, produtos, "Reading on-chain data" com view opcodes) fica no markdown. Via admin ou in-pod — **NUNCA re-rodar `scripts/data/ecosystem-seed.json`** (re-criaria os 10 apps que o Vitor deletou).
- Refinar via admin a descrição do wunsch vault `4:777` (é o fee vault do lottery Fireball do Arbuzino).

## Testes / verificação

- `tests/ecosystem/`: estender — mapper por slug (locale/fallback/404), página (EN+ZH, notFound, seção contracts, links), card com Link interno, admin (payload contratos). Os 57 existentes continuam verdes.
- Gates: `npx vitest run tests/ecosystem/` verde · tsc limpo · CI paridade = só as 4 falhas allow-listed (admin-nav 3 + admin-landing 1).
- Prod: `/ecosystem/<slug>` renderiza EN+ZH; card navega pra dentro; links externos ok; profile do Arbuzino visível.

## Entrega (fluxo padrão)

Worktree NOVO → SDD (subagents Sonnet 5, review final Opus) → PR (`git add` nominal, nunca -A) → paridade CI → `gh pr merge N --squash` → esperar workflow "Deploy to GCP" buildar → bump `k8s/kustomization.yaml` newTag **QUOTED full-SHA** direto na main (`deploy(io):`) → Flux ~1min → `rollout status` → verificação prod.

Gotchas de execução: push trava → `TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" <branch>` · worktree fresco = junction node_modules + `prisma generate` · in-pod usa `/app/scripts` + `NODE_PATH=/app/node_modules` + `MSYS_NO_PATHCONV=1` · jsdom NÃO bumpar ≥27 · `next build` Windows: "Compiled successfully" = ok (EINVAL standalone é ruído).

## Fora de escopo

- TVL/métricas on-chain via `alkanes_simulate` (fase futura — a tabela relacional de contratos é o pré-requisito).
- OG image dedicada por profile (usa default do site por ora).
- Qualquer mudança de nav/sitemap (soft-launch segue só via link).
- As 4 demandas do editor/admin (ADIADAS).
