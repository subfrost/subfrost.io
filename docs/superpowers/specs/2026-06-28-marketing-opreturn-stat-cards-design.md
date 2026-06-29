# Marketing: ingestão de dados OP_RETURN + Stat-card studio (#1)

**Data:** 2026-06-28
**Repo:** `subfrost.io` (admin único do SUBFROST, seção Marketing em `/admin/marketing`)
**Origem:** brainstorm de produtos de marketing — primeira ferramenta escolhida = **Stat-card
studio** (gerar cards branded compartilháveis a partir dos números on-chain únicos do SUBFROST),
apoiada numa **camada de dados** que ingere o decode de OP_RETURN.

## Objetivo

1. **Ingerir** o dataset diário do decoder de OP_RETURN (hoje só no dashboard externo) no Postgres
   do subfrost.io, mantido fresco "junto com o decoder".
2. **Stat-card studio**: ferramenta no admin (seção Marketing) que transforma uma métrica on-chain
   + janela + template num **PNG branded** pronto pro X (download; "postar no X" fica manual por ora).

Fora de escopo (decidido): integração com a **API do X** (analytics da conta / agendamento) — exige
conta dev + app keys + OAuth + tier pago; adiada. O lado X fica manual (compor → baixar → postar).

## Fonte de dados (verificada)

O dashboard `vdto88.github.io/alkanes-opreturn-stats` é estático: o repo `Vdto88/alkanes-opreturn-stats`
tem só `index.html` + **`history.csv`**, e a página lê esse CSV. Fonte = **um CSV público**:
`https://vdto88.github.io/alkanes-opreturn-stats/history.csv` (fallback raw.githubusercontent). Hoje:
183 linhas (1/dia desde 2025-12-29), header conhecido, sem vírgulas embutidas. Colunas (15):

```
date, fromHeight, toHeight, blocksScanned, totalTx, txWithOpReturn, txAlkanes,
opReturnBytes, runestoneBytes, alkanesBytes, dieselMints,
feeTotalSats, feeAlkanesSats, feeOpReturnSats, btcUsd
```

O decoder (scanner v2 TS) acrescenta 1 linha/dia e dá push no repo → Pages serve o CSV atualizado.

## Decisões

- **Gating:** reusar **`marketing.view`** (única priv de marketing hoje; snapshots já gateiam mutação
  com ela). Sem IAM nova.
- **Render do card:** **`next/og` (`ImageResponse`/Satori)** — já usado em `app/articles/opengraph-image.tsx`.
  Espelhar aquele padrão (fonte Geist Medium de `node_modules/geist`, logomark de
  `public/brand/subfrost/Logos/svg/logomark/logomark.svg`, cores `#071224`/`#51647f`/`#ffffff`).
- **Auto-sync:** botão **"Sync agora"** (server action, gated `marketing.view`) + **CronJob diário**
  reusando a **imagem do app** (`command: ["node","scripts/sync-opreturn.mjs"]` + `DATABASE_URL`),
  igual ao init-container `migrate`. Sem imagem/infra nova.
- **Templates v1:** **hero stat** + **comparação Alkanes vs Runes** (2).
- **Tamanho do card:** **1200×675** (16:9, bom pro X).

## Arquitetura por camada

### 1. Schema Prisma (`prisma/schema.prisma`) — aditivo
```prisma
model OpReturnDaily {
  date           String  @id          // YYYY-MM-DD
  fromHeight     Int
  toHeight       Int
  blocksScanned  Int
  totalTx        Int
  txWithOpReturn Int
  txAlkanes      Int
  opReturnBytes  Int
  runestoneBytes Int
  alkanesBytes   Int
  dieselMints    Int
  feeTotalSats   Int
  feeAlkanesSats Int
  feeOpReturnSats Int
  btcUsd         Float
  updatedAt      DateTime @updatedAt
}
```
Valores diários: campos de contagem cabem em Int; **`fee*Sats` são `Float`** (não `Int`) porque um único bloco de alta taxa pode ultrapassar o limite Int4 de ~2.1B; sats inteiros permanecem exatos dentro do Float's 2^53. Aditivo → `db push` ok.

### 2. Sync (`lib/marketing/opreturn-sync.ts`)
- `fetchHistoryCsv(): Promise<string>` — GET do CSV (Pages; fallback raw), timeout, throw em erro.
- `parseHistoryCsv(text): OpReturnRow[]` — split por linha; mapeia header→colunas; coage números;
  descarta linhas malformadas. Puro/testável.
- `syncOpReturn(): Promise<{ fetched: number; upserted: number; latestDate: string | null }>` —
  fetch+parse → `prisma.opReturnDaily.upsert` por `date` (idempotente).

### 3. Métricas derivadas (`lib/marketing/opreturn-metrics.ts`, puro/testável)
A partir de `OpReturnRow[]` ordenado por data, expõe séries + agregados por janela. Métricas:
- `alkanesTxShare` = txAlkanes/totalTx
- `opReturnTxShare` = txWithOpReturn/totalTx
- `alkanesOfOpReturnShare` = txAlkanes/txWithOpReturn
- `alkanesBytesShare` = alkanesBytes/opReturnBytes
- `runesBytesShare` = runestoneBytes/opReturnBytes
- `dieselShareOfAlkanes` = dieselMints/txAlkanes
- `alkanesFeeShare` = feeAlkanesSats/feeTotalSats
- `alkanesFeeUsdDaily` = feeAlkanesSats/1e8 × btcUsd
- `alkanesFeeUsdCumulative` = soma de alkanesFeeUsdDaily na janela
Janelas: **último dia**, **média móvel 7d** (default), **média 30d**, **média 60d**, **média 120d**,
**período completo** (primeiro/último/média). Cada janela usa os últimos N dias disponíveis (clampa se
houver menos dados). Divisões guardam `den===0 → null`. Mesma métrica + janela diferente = números bem
diferentes (ex.: Alkanes % tx ≈ 75% em 7d vs ≈ 54% em 60d) — é exatamente a variedade de conteúdo que
queremos.

### 4. Stat-card studio — UI (`app/admin/marketing/cards/page.tsx` + client)
- Server page gated `marketing.view`; carrega rows de `OpReturnDaily` (ou um resumo) + passa pro client.
- Client `StatCardStudio`: selects de **métrica / template / janela / tema (dark|light)**; **preview
  ao vivo** via `<img src="/admin/marketing/cards/render?...">`; botão **"Baixar PNG"** (link pra rota);
  botão **"Sync agora"** (server action) com timestamp do último sync; aviso se a tabela estiver vazia
  (instruir sync).
- Entra no nav de Marketing (`lib/cms/admin-nav.ts`) e no mapa de rota→priv.

### 5. Render route (`app/admin/marketing/cards/render/route.tsx`)
- `runtime = "nodejs"`; gated `marketing.view` (sessão; o `<img>` same-origin manda o cookie).
- Query params: `metric`, `template` (`hero|compare`), `window` (`latest|avg7|avg30|avg60|avg120|full`), `theme`.
- Busca `OpReturnDaily` → calcula via `opreturn-metrics` → monta JSX → `new ImageResponse(jsx, {width:1200,height:675,fonts:[Geist]})`.
- Templates:
  - **hero**: logomark + wordmark, número grande (ex.: "71%"), label, sparkline da série, rodapé
    "subfrost.io · decodificado do OP_RETURN, diário" + janela.
  - **compare**: duas barras Alkanes vs Runes (bytes ou tx) com %, mesma marca.
- Sempre arredondar números exibidos. Faltando dado → render de "dados indisponíveis — rode o sync".

### 6. Sync script (`scripts/sync-opreturn.mjs`)
- `node` puro + `@prisma/client`: chama a mesma lógica de `syncOpReturn` (ou reimplementa fetch+upsert
  enxuto), guard de `DATABASE_URL`. Usado pelo CronJob.

### 7. CronJob (`k8s/opreturn-sync-cronjob.yaml`)
- `kind: CronJob`, schedule diário, **reusa a imagem do app**, `command: ["node","scripts/sync-opreturn.mjs"]`,
  env `DATABASE_URL` do mesmo secret (external-secrets) do deployment. Adicionar ao `k8s/kustomization.yaml`.

## Testes / gates
- `opreturn-metrics` (puro) → vitest: shares, médias 7d/60d, período completo, guards de divisão por zero,
  com fixture de ~poucos dias.
- `opreturn-sync` → vitest: `parseHistoryCsv` (header→linhas, coerção, descarte de malformado);
  `syncOpReturn` com prisma mockado (upsert por data).
- Render route: sem unit test (imagem) — smoke via `next build` + preview manual.
- Gates: `prisma generate` → `tsc --noEmit` 0 → `vitest` (os ~8 RPC-offline pré-existentes OK) → `next build`.

## Deploy
- Schema aditivo (`db push`). PR → review → merge → bump `newTag` **com aspas** → Flux (source antes do
  Kustomization). Rodar **1 sync** (botão "Sync agora" ou o script) pra backfill dos 183 dias.
- O CronJob entra junto (kustomization) e passa a atualizar diário.

## Critérios de aceite
1. `OpReturnDaily` populada (≥183 linhas) após o primeiro sync; "Sync agora" é idempotente e atualiza
   `latestDate`.
2. Studio em `/admin/marketing/cards` (gated `marketing.view`), no nav de Marketing.
3. Preview ao vivo muda com métrica/template/janela/tema; "Baixar PNG" entrega um PNG 1200×675 branded.
4. Template **hero** mostra a métrica certa pra janela escolhida (ex.: Alkanes % tx, média 7d ≈ valor do
   artigo); template **compare** mostra Alkanes vs Runes.
5. Métricas derivadas corretas (conferidas por teste) e robustas a dado faltante (null, sem crash).
6. CronJob diário aplicado; `tsc` 0, vitest verde (fora RPC-offline), `next build` ok.

## Fora de escopo
- API do X (analytics da conta / agendamento) — adiada (credencial + custo).
- Outras ferramentas de marketing (milestone radar #2, comparação dedicada #3, funil #7) — a camada de
  dados e as métricas derivadas aqui já as habilitam depois.
- Sem IAM nova; sem mexer em snapshots/analytics existentes.
