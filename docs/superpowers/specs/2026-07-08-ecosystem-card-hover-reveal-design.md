# Ecosystem directory cards — logo-forward + hover-reveal

**Date:** 2026-07-08
**Author:** Claude (com Vitor)
**Status:** design (aguardando aprovação do spec)
**Component:** `components/ecosystem/EcosystemDirectory.tsx` (só os cards do **grid**)

## Goal

Reduzir o texto no grid do `/ecosystem` e deixar a **marca/logo em primeiro plano**. O card
default vira minimalista (logo em destaque + nome + categoria + sociais + status); a **descrição**
só aparece no **hover** (desktop). Referência de padrão: eclipse.xyz/ecosystem — mas sem o bloco
colorido; só o texto entrando com fade, coerente com o visual monocromático do subfrost.

## Non-goals (fora de escopo)

- **Featured band intocada** — os cards em destaque continuam mostrando a descrição sempre. Só o
  grid muda. (Além disso a banda featured está desligada hoje.)
- **Sem mudança de cor no hover** — nada de fundo colorido tipo Eclipse. O único feedback de hover
  continua a bordinha `--ed-ice` + o `-translate-y` que os cards já têm.
- **Sem campo `discordUrl`** — o schema tem só `url`/`xUrl`/`docsUrl`. Cards mostram 𝕏 + Docs
  (Discord não entra; fica no profile via markdown, como já está na UniSat).
- **Sem tocar no profile, no admin, nem no data model.** Zero migração.

## Decisões (confirmadas com o Vitor)

1. **Layout logo-forward** (não o "mínimo esforço"): logo maior e centralizado, card estilo galeria.
2. **Mobile (touch): não mostra a descrição** — o card fica **compacto de verdade** (sem espaço
   reservado/"buraco") e o toque no card leva pro **profile**, onde está a descrição completa.
3. **Desktop (mouse): descrição faz fade-in no hover** num espaço reservado (altura fixa do card →
   sem reflow do grid).

## Anatomia do card do grid (novo)

Altura fixa (desktop) pra evitar reflow quando a descrição entra. Ordem vertical:

```
┌─────────────────────────────┐
│ Nome                Categoria│  ← topo (nome à esq, categoria mono-uppercase à dir)
│                              │
│           [ LOGO ]           │  ← centro, logo em destaque (~56px), flex-1
│                              │
│ 𝕏  Docs              ● Live  │  ← rodapé: sociais (esq) + status (dir)
│ Descrição curta… (2 linhas)  │  ← só desktop-hover; escondida no mobile
└─────────────────────────────┘
```

- **Nome / categoria / status**: ficam **abaixo** do stretched-link overlay (sem `z-10`) — assim o
  clique no card navega pro profile (invariante do #202 preservada).
- **Sociais (𝕏 / Docs)**: âncoras externas reais, **elevadas `z-10`**, clicáveis
  independentemente (mesmo padrão do `LinksRow` do featured, mas versão compacta só-ícone).
  Renderiza `𝕏` se `xUrl`, `Docs` se `docsUrl`; se o projeto não tiver nenhum, o rodapé mostra
  só o status.
- **AlkaneBadge** (kind=Contract): continua como está, `z-10`, clicável (Ordiscan).
- **Descrição**: `<p>` **abaixo do overlay** (não-interativa), controlada por CSS (ver mecânica).

### Afordância de navegação
O card inteiro é clicável (já é). Mantemos o hover-lift + borda como sinal. **Sem** seta `↗` ao
lado do nome (a `↗` sugere link externo, mas o card vai pro profile interno — evita ambiguidade).

## Mecânica do reveal (CSS, gated por capacidade de hover)

Classe nova no card (`ec-card`) e na descrição (`ec-card-desc`), com regra no `globals.css`
(mesmo lugar do keyframe do `ec-hero-tile`). O `globals.css` já tem
`@media (hover: hover) and (pointer: fine)` — reusar.

```css
/* default (cobre TOUCH): descrição sem espaço nenhum → card compacto, sem buraco */
.ec-card-desc { display: none; }

@media (hover: hover) and (pointer: fine) {
  /* desktop: reserva o espaço (altura fixa), começa invisível, revela no hover/foco */
  .ec-card-desc {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; opacity: 0; transition: opacity .2s ease;
  }
  .ec-card:hover .ec-card-desc,
  .ec-card:focus-within .ec-card-desc { opacity: 1; }
}
```

Efeito:
- **Touch**: `display:none` → sem reserva de espaço → card compacto (resolve o "parece bugado" do
  Eclipse; o resto do card — logo/nome/categoria/sociais/status — permanece, então lê como
  intencional, não quebrado).
- **Desktop**: espaço reservado (altura fixa via layout do card) + fade no hover; `focus-within`
  cobre navegação por teclado.
- `prefers-reduced-motion`: sem transição (respeitar; o conteúdo ainda aparece no hover).

A altura fixa do card no desktop vem do layout flex (logo em `flex-1` + rodapé + slot da descrição
reservado). No mobile, sem o slot, o card encolhe naturalmente.

## Arquivos tocados

- `components/ecosystem/EcosystemDirectory.tsx` — reescrever **só** o `map` do grid (bloco
  `grid.map`, ~linhas 132-151). Extrair um `GridCard` interno pra clareza. Adicionar a linha de
  sociais compacta (reusar/adaptar a lógica do `LinksRow`, versão ícone). Featured **inalterado**.
- `app/globals.css` — bloco CSS do `.ec-card` / `.ec-card-desc` (default + dentro do
  `@media (hover:hover)`), perto do `ec-hero-tile`.
- `tests/ecosystem/directory.test.tsx` — atualizar/estender (ver Testing).

## Testing

Vitest + Testing Library (jsdom). O teste **não** exercita hover real (CSS/media), então cobrimos
estrutura e presença:

1. **Invariante #202 (manter):** todo elemento com `z-10` dentro de um card é (ou contém) uma
   âncora/botão — o texto/logo NÃO é elevado. Estender pros novos ícones sociais.
2. **Sociais condicionais:** card com `xUrl` renderiza link 𝕏 (`href` externo, `rel=noopener`);
   com `docsUrl` renderiza Docs; sem nenhum, nenhum ícone social; todos com `target="_blank"`.
3. **Descrição presente + classe de reveal:** o `<p>` da descrição existe no DOM com a classe
   `ec-card-desc` (o comportamento visual é do CSS; garantimos que está lá e não-elevada).
4. **Card navega pro profile:** o stretched `Link` aponta pra `/ecosystem/<slug>` (já coberto —
   confirmar que segue).
5. **Featured intacto:** featured card ainda mostra a descrição sem gating (sem `ec-card-desc`).

Gates: `pnpm test` (suíte ecosystem), `tsc`, `eslint .` (0 delta), build (worktree exige
`rmdir node_modules` + `pnpm install` + `prisma generate` — ver [[ecosystem-portal-demand]]).

## Rollout

Mudança de código → **PR** no subfrost.io (branch `feat/ecosystem-card-hover-reveal` de
`origin/main` fresco) → merge → Flux reconcilia → bump `newTag` (full-SHA entre aspas). Sem
migração, sem passo in-pod. Verificação em prod: card default sem descrição, hover revela (desktop),
mobile compacto sem buraco, clique navega (elementFromPoint), #202 não reintroduzido.

## Riscos / gotchas

- **Reflow no grid:** por isso a altura é fixa no desktop (espaço reservado). Testar visual num
  card sem descrição (não deve "pular").
- **#202 (engolir o clique):** só sociais/AlkaneBadge sobem pra `z-10`; texto fica abaixo. Teste
  estrutural trava isso.
- **Turbopack + worktree:** build precisa de `node_modules` real (não junction) — ver nota do
  deploy na memória.
- **Sociais no grid = adição** (hoje só o featured tem). Confirmar com o Vitor no review do spec —
  se ele preferir sem sociais no card, é só remover a linha (o resto do design não depende dela).
