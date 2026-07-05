# Spec — Ecosystem Profile v2: banner + abas + stats on-chain (DefiLlama de verdade)

**Data:** 2026-07-05 · **Aprovado por:** Vitor · **Repo:** `C:\Alkanes Geral Dev\subfrost.io` · **Base:** profile v1 LIVE (PR #185)

## Problema (feedback do Vitor na v1)

1. O profile "parece um artigo" — muito texto corrido, nenhuma imagem.
2. Nenhum dado on-chain na página (a tabela relacional de contratos era só o pré-requisito).
3. Referência de forma: DefiLlama — número grande no topo, seções clicáveis, visual.

## Decisões (brainstorm 2026-07-05, 4/4 aprovadas)

1. **Stats hero + abas**: topo com banner + stat cards; conteúdo fatiado em abas clicáveis. O markdown é fatiado **automaticamente por `##` (H2)** — zero mudança no modelo de conteúdo/admin.
2. **Dados = cron + snapshot no Postgres** via RPCs da subfrost (página nunca consulta RPC no pageview; histórico acumula de graça pra sparklines na v3).
3. **Métricas genéricas pra todo contrato** (holders/supply/preço/mcap via `get-alkane-details`) **+ adapter por projeto em código** (estilo DefiLlama; showcase = Arbuzino via `alkanes_simulate`).
4. **Imagens: banner por projeto** (upload no admin, mesmo fluxo do logo) **+ imagens inline no markdown** (já renderizam pelo pipeline de artigos — pedir screenshots aos projetos).

## Fontes de dados (PROVADAS ao vivo 2026-07-05)

- **`https://oyl.alkanode.com/get-alkane-details`** (POST `{alkaneId:{block,tx}}`) — client já existe: `lib/marketing/alkane-details.ts` (`getAlkaneDetails`, guarded, nunca lança). Campos: name, symbol, holders, priceUsd, supply, marketcap, volume. ✅ testado (ARBUZ 2:25349).
- **`https://mainnet.subfrost.io/v4/subfrost`** (JSON-RPC) — `alkanes_simulate` com o template do misha responde: op 103 em `4:257` → `execution.data` hex = 4×u128 **little-endian** (pool_3, pool_4, pool_5=jackpot, fee_acc), base units 1e8 DIESEL. ✅ testado (jackpot t5 = 15.0497 DIESEL em 2026-07-05). Fixture real do teste:
  `data = 0x3028f2000000000000000000000000008046fc3101000000000000000000000070f5b35900000000000000000000000010055301000000000000000000000000` → `[15870000n, 5133731456n, 1504945520n, 22217999n]` (conferir decode no teste com estes bytes; valores em DIESEL: 0.1587 / 51.3358(≈) / 15.0497(≈) / 0.2222 — a verdade é o decode, não os arredondados).
- espo (`api.alkanode.com/rpc`): NÃO expõe `alkanes_simulate` (-32601); segue usado só p/ candles (lib/espo-price.ts). v2.2.1-rc.2 do flex: sem impacto conhecido; se o RPC mudar, é só env.

## Entrega em 2 PRs sequenciais

---

## PR A — Layout (banner + abas)

### A1. Schema (aditivo)
`EcosystemProject.bannerUrl String?` — só isso.

### A2. Splitter de seções — `lib/ecosystem/profile-sections.ts`
`splitProfileSections(md: string): { intro: string; sections: { title: string; body: string }[] }`
- Fatia por linhas que começam com `## ` (H2), **fora de code fences** (rastrear ``` ao varrer linhas; linhas dentro de fence nunca abrem seção).
- `intro` = tudo antes do primeiro H2 (trim). `title` = texto após `## ` (raw, trim). `body` = conteúdo até o próximo H2/fim.
- Sem H2 → `{ intro: md, sections: [] }`.

### A3. Abas — `components/ecosystem/ProfileTabs.tsx` (client)
- Props: `tabs: { key: string; label: string }[]`, `panels: ReactNode[]` (mesma ordem; server passa `<Markdown>` já renderizado — o pipeline sanitize continua server-side).
- Visual = mesmo idioma das abas Apps|Contracts do diretório (role=tablist/tab, `aria-selected`, `-mb-px border-b-2`, font-mono 12.5px, tokens `--ed-*`); tablist com `overflow-x-auto` (mobile).
- Estado local (useState, primeira aba ativa).

### A4. EcosystemProfile v2 — `components/ecosystem/EcosystemProfile.tsx`
De cima pra baixo: **banner** → header (como hoje) → *(slot do stats hero, PR B)* → **abas**.
- Banner: `bannerUrl` → `<img>` full-width `object-cover` (banda `h-[clamp(120px,22vw,240px)]`, rounded, `alt=""`); sem bannerUrl → banda menor com `gradFor(slug)` (visuals) — a página nunca fica sem faixa.
- Abas montadas: `Overview` (intro; copy EN "Overview"/ZH "概览") + uma por seção H2 (label = title do markdown) + `Contracts` (a tabela atual vira painel; label = copy.contractsTitle). Regras: aba só entra se tiver conteúdo (intro vazio → sem Overview; contracts=[] → sem Contracts). **Total ≤1 painel → renderiza direto sem tablist** (comportamento v1; perfil magro continua ok).

### A5. Admin
- Upload de **banner** ao lado do logo (mesmo `uploadInlineImage(file, fetch, "ecosystem")`, preview `<img>` retangular, botão remover → null). `AdminProject.bannerUrl` + `toInput()` + payload do save.
- Action: `bannerUrl` no input/validação (`isValidOptionalHttpUrl`) e no `data`.

### A6. Testes (PR A)
- Splitter: sem H2; múltiplos H2; `##` dentro de code fence NÃO abre seção; intro vazio.
- ProfileTabs: renderiza tablist, troca painel no clique, aria-selected.
- EcosystemProfile: banner img quando bannerUrl; banda gradiente quando null; abas Overview/seções/Contracts com conteúdo do arbuzino-like; perfil magro (≤1 painel) sem tablist.
- Admin/action: bannerUrl persiste; upload usa kind "ecosystem".

---

## PR B — Dados on-chain (cron + snapshot + hero)

### B1. Schema (aditivo)
```prisma
model EcosystemStatSnapshot {
  id        String           @id @default(cuid())
  projectId String
  project   EcosystemProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  takenAt   DateTime         @default(now())
  stats     Json
  @@index([projectId, takenAt])
}
```
`stats` (shape versionado em `lib/ecosystem/stats-types.ts`):
```ts
interface ProjectStats {
  generic: Record<string, { name: string|null; symbol: string|null; holders: number|null; supply: string|null; priceUsd: number|null; marketcapUsd: number|null; volume24hUsd: number|null }> // key = alkaneId
  custom: { key: string; label: string; labelZh?: string; value: string; unit?: string }[]  // ordem = ordem de exibição
}
```

### B2. Simulate client — `lib/ecosystem/simulate.ts`
`simulateView(target: {block: string; tx: string}, inputs: string[], fetchImpl?): Promise<bigint[] | null>`
- POST `process.env.SUBFROST_RPC_URL || "https://mainnet.subfrost.io/v4/subfrost"`, body = template do misha (`height: "20000"`, demais campos fixos), timeout 15s.
- Sucesso = `result.execution.error == null` e `data` hex → fatia em words de 32 hex chars → cada uma revertida byte a byte (LE) → BigInt. Qualquer falha/formato inesperado → `null` (nunca lança).

### B3. Adapters — `lib/ecosystem/adapters/`
- `types.ts`: `type EcosystemAdapter = (deps: { simulate: typeof simulateView }) => Promise<ProjectStats["custom"] | null>`
- `arbuzino.ts`: op103 em 4:257 → card `jackpot` ("Tier-5 jackpot" / 「五中头奖池」, pool_5/1e8, unit "DIESEL"); op108 em 4:257 → `tickets` ("Tickets (round / all-time)" / 「本轮/累计彩票」, "X / Y"); op101 em 4:777 → `feeVault` ("Fee vault" / 「手续费金库」, fee_pool/1e8, "DIESEL"). Falha parcial = omite o card; tudo null → null.
- `index.ts`: `ADAPTERS: Record<string, EcosystemAdapter>` (só `arbuzino` por ora).

### B4. Coletor + rota cron — `lib/ecosystem/stats-sync.ts` + `app/api/ecosystem/stats-cron/route.ts`
- Coletor: para cada projeto `published` com alkaneId (principal e/ou contratos): genéricas via `getAlkaneDetails` (ids dedupados, concorrência ≤3), custom via adapter do slug (se houver); grava 1 `EcosystemStatSnapshot`; prune `takenAt < now-90d` do projeto. Nunca lança por projeto (um projeto falhar não derruba o batch).
- Rota GET: Bearer **`PREFETCH_SECRET`** — mesma convenção de `/api/marketing/snapshot-cron` (enforça só se a env existir). Resposta `{ ok, projects, snapshots, ms }`. `export const dynamic = "force-dynamic"`.

### B5. CronJob k8s — `k8s/ecosystem-stats-cronjob.yaml`
Cópia do padrão `marketing-snapshot-cronjob.yaml` (curl in-cluster `http://subfrost-io.subfrost.svc.cluster.local/api/ecosystem/stats-cron`, Bearer se PREFETCH_SECRET, spot nodeSelector+toleration, `concurrencyPolicy: Forbid`, backoffLimit 2, activeDeadlineSeconds 600), **schedule `17 * * * *`** (hourly). + entry em `k8s/kustomization.yaml` resources.

### B6. Stat hero na página
- Mapper: `getLatestEcosystemStats(slug)` em `lib/ecosystem/public.ts` (projeto→snapshot mais recente→`ProjectStats`|null). Página busca em paralelo com o profile.
- `components/ecosystem/StatHero.tsx` (server): até **4 cards** — `custom` primeiro (ordem do adapter), completa com genéricas do alkaneId principal (Holders → Supply → Price USD; labels EN/ZH via copy). Card: valor grande (formatador compacto: 1.2k / 3.4M; DIESEL com 2-4 casas), label mono pequeno em cima. Grid 2 cols mobile / 4 desktop, tokens `--ed-*`. `stats=null` ou 0 cards → não renderiza nada (sem esqueleto).
- Posição: entre header e abas.

### B7. Ativação pós-deploy
`curl` na rota 1x (com Bearer se enforced) pra materializar o primeiro snapshot; verificar hero no /ecosystem/arbuzino com jackpot real.

### B8. Testes (PR B)
- simulate: decode da fixture REAL do op103 (hex acima → 4 bigints); error no execution → null; resposta malformada → null.
- adapter arbuzino: com mocks de simulate → 3 cards ordenados; simulate null → cards omitidos.
- coletor: mock prisma+fetch → grava snapshot com generic+custom; projeto sem alkaneId pulado; falha de um projeto não derruba os outros; prune chamado.
- rota: 401 com PREFETCH_SECRET setada e Bearer errado; 200 sem env (convenção prefetch).
- StatHero: 4 cards máx, custom primeiro, formatador, null → nada.
- mapper getLatestEcosystemStats: pega o mais recente; sem snapshot → null.

---

## Constraints (herdadas da v1 + novas)

- PR sempre; worktree novo por PR; `git add` nominal; schema aditivo; soft-launch intacto (nav/sitemap/integration.test); tokens `--ed-*`; espo.sh nas linhas de contrato; jsdom <27; sem deps novas.
- Gates: `npx vitest run tests/ecosystem/` (+ suites tocadas) verde · `tsc --noEmit` limpo · `pnpm build` verde (⚠️ **Turbopack rejeita junction de node_modules** → worktree usa `pnpm install --prefer-offline` real + `prisma generate`) · lint informativo (base tem 86 findings pré-existentes; não introduzir NOVOS nos arquivos tocados) · CI paridade (4 allow-listed).
- Deploy: merge → esperar "Deploy to GCP" → bump newTag QUOTED full-SHA `deploy(io):` → Flux → rollout → (PR B) curl da rota + verificação prod.
- Página continua `force-dynamic`; stats vêm do banco (nunca RPC no request).

## Fora de escopo (v3+)

Sparklines/charts (histórico já acumula), galeria de screenshots, ranking/tabela na listagem, tradução ZH do profile do Arbuzino, form público de submissão.
