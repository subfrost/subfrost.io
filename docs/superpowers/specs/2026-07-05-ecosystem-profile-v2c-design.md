# Spec-lite — Ecosystem Profile v2C: gráfico de preço + Translate EN→ZH do profile

**Data:** 2026-07-05 · **GO:** Vitor (brainstorm da v2 já cobriu; decisões residuais tomadas nesta spec) · **Repo:** `C:\Alkanes Geral Dev\subfrost.io` · **Base:** v2B LIVE (PR #189, stat hero on-chain)

## Bloco 1 — Gráfico de preço no profile

Linha de close diário (~90d) pra projetos de token com pool no espo. Fonte **provada ao vivo 2026-07-05**: `ammdata.get_candles` (POST JSON-RPC `https://api.alkanode.com/rpc`, params `{pool, timeframe:"1d", side:"base", limit:90, page:1}`), USD = `Number(close)/1e16` (mesmo scale de `lib/espo-price.ts`). Candles vêm **newest-first** → ordenar cronológico antes de plotar.

### Decisões
- **Posição: seção própria logo abaixo do stat hero** (não aba). Razões: (a) DefiLlama-style = preço visível de cara, sem clique; (b) as abas são derivadas do markdown (H2) + contracts — misturar componente de dados ali complica o `ProfileBody`; (c) `EcosystemProfile` já tem o padrão de slot `statHero?: ReactNode` — o chart entra igual (`priceChart?: ReactNode`), zero acoplamento.
- **Resolução de pool automática** (gramática provada): tenta `<alkaneId>-usd`; `candles` vazio → tenta `<alkaneId>-derived_2:0-usd`; vazio de novo → sem gráfico. Pool inexistente responde `candles: []` com ok — o fallback é silencioso por design. Qualquer erro (rede/HTTP/parse) → sem gráfico (nunca lança até a página; **sem esqueleto/placeholder**).
- **Fetch server-side com cache**: `unstable_cache` (primeiro uso no repo) em volta SÓ do fetch espo, key `["ecosystem-candles", alkaneId]`, `revalidate: 900` (15min — candles são UX-grade). A página segue `force-dynamic`; lookup slug→alkaneId no Prisma fica FORA do cache (barato, sempre fresco). Busca em paralelo com profile+stats via helper por slug (mesmo padrão do `getLatestEcosystemStats`).
- **Render: recharts** (dep existente) em client component novo, tema dual via tokens: stroke/fill = `var(--ed-ice)` (#5b9cff, **idêntico em dark e light**), grid = `var(--ed-hair)`, ticks = `var(--ed-muted)`, tooltip com `contentStyle` `--ed-surface`/`--ed-hair`/`--ed-ink`. (recharts aceita `var()` em stroke/fill — presentation attributes parseiam CSS nos browsers modernos; manter fallback hex `var(--ed-ice, #5b9cff)`.)
- **Micro-decisões v1**: AreaChart com fill sutil (fillOpacity ~0.12), sem dots, sem animação; eixo Y USD adaptativo (≥1 → `$X.XX`; <1 → 4 significativos, ex. `$0.001234`); eixo X datas curtas (`Jul 5`, locale-aware EN/ZH); tooltip = data completa + USD; **sem volume**; **sem seletor de janela** (90d fixo). Mínimo **2 pontos** pra renderizar. Título da seção: copy `Price (90d)` / `价格（90 天）` em `ProfileCopy`.

### Arquivos
- `lib/ecosystem/candles.ts` (novo): `fetchDailyCandles(pool, fetchImpl?)` (parse+scale+sort+filtro de close inválido) · `resolveDailyCandles(alkaneId, fetchImpl?)` (fallback direto→derived, erro→null) · `getEcosystemPriceSeries(slug)` (prisma slug→alkaneId → resolve cacheado). NÃO mexer em `lib/espo-price.ts` (home stats usa; timeframe/limit diferentes).
- `components/ecosystem/PriceChart.tsx` (novo, client): recharts AreaChart, props `{ points: { t: number; usd: number }[]; copy; locale }`.
- `components/ecosystem/EcosystemProfile.tsx`: prop `priceChart?: ReactNode` renderizado após `{statHero}`.
- `app/ecosystem/[slug]/page.tsx`: 3º item no `Promise.all` + copy EN/ZH.

## Bloco 2 — Translate EN→ZH do profile no admin

Hoje o admin só traduz a descrição curta (`translateEcosystemDescription`). O corpo `profileEn/profileZh` não tem botão.

### Decisões
- Nova action `translateEcosystemProfile(profileEn)` em `actions/ecosystem/projects.ts`, **padrão exato** da `translateEcosystemDescription`: `requireEdit()` → trim/vazio → `translationUnavailable()` → `translate({ body: profileEn }, "en", "zh")` body-only → `{ ok, zh }`. (O system prompt do tradutor já preserva Markdown/GFM — é o mesmo caminho dos artigos.)
- Botão **"Translate EN→ZH"** no header do textarea Profile (ZH) do `ProjectForm` (`components/cms/ecosystem/EcosystemAdmin.tsx`), ao lado do toggle "Preview ZH"; estado `translatingProfile` **separado** do da descrição (os dois botões não se travam mutuamente); disabled se `profileEn` vazio ou traduzindo; sucesso → `setProfileZh(res.zh)`; erro → `onError`.
- **Cortado (YAGNI):** traduzir notas ZH dos contratos em um clique — notas são curtinhas, infla o PR.

## Testes (padrões prontos em `tests/ecosystem/`: mock prisma local, RTL, fixtures)
- `candles.test.ts` (novo): scale 1e16; ordenação cronológica a partir de fixture newest-first; fallback direto→derived; ambos vazios → null; erro de rede → null; close não-numérico filtrado.
- `price-chart.test.tsx` (novo): renderiza título+chart com ≥2 pontos; null com <2.
- `profile-page.test.tsx`: page monta `priceChart` quando série existe; sem alkaneId/série → ausente.
- `actions.test.ts`: casos da `translateEcosystemProfile` (não autenticado, vazio, unavailable, ok) — espelhar os da description.
- `admin-form.test.tsx`: botão presente/disabled/preenche `profileZh` (action mockada).

## Constraints (herdadas)
PR sempre; worktree novo (`wt-eco-v2c`) com **install real** (`pnpm install --prefer-offline` + `prisma generate`; Turbopack rejeita junction); `git add` nominal; path `'app/ecosystem/[slug]/page.tsx'` entre aspas; soft-launch intacto; sem deps novas; **lint é gate real** (0 errors novos); jsdom <27; sem schema change (nada de Prisma migration neste PR). Gates: `npx vitest run tests/ecosystem/` verde · `tsc --noEmit` · `pnpm lint` · `pnpm build`.

## Verificação prod
/ecosystem/diesel e /fire com gráfico (pool direto) · /arbuzino com gráfico (pool derivado) · projeto sem pool (ex. clockin) sem gráfico e sem buraco no layout · admin traduz o profile EN→ZH do arbuzino e `?lang=zh` mostra o corpo em chinês (bônus: popular o `profileZh` real).

## Fora de escopo
Sparklines de jackpot/holders (esperar histórico do cron, ~2026-07-12) · banner (campo pronto, despriorizado) · seletor de janela/volume no chart · tradução das notas de contratos.
