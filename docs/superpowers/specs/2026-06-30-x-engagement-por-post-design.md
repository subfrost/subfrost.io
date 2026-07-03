# Design — X (Twitter) engagement por post (Marketing · Peça 2)

**Data:** 2026-06-30
**Frente:** Marketing analytics — Peça 2 ("engagement do X por post")
**Repo:** `C:\Alkanes Geral Dev\subfrost.io` (Next.js 16 App Router + Prisma + Postgres; admin em `/admin`; live no GKE via Flux a partir de `main`)
**Branch:** `feat/x-engagement-analytics`
**Status:** design aprovado (brainstorming) — aguardando review do spec antes do plano de implementação

---

## 1. Contexto e objetivo

A **Peça 1** (aba **Protocol analytics**, `/admin/marketing/protocol`) já está LIVE: captura uma série **diária** de snapshots do protocolo (holders DIESEL, BTC locked, preços) via Cloud Scheduler → `/api/marketing/snapshot-cron` → `captureSnapshot()`/`createSnapshot()`, gravando em `MarketingSnapshot` (`context="DAILY"`).

A **Peça 2** é a **análise por post do X**: para cada post da conta **@subfrost_news**, acompanhar as métricas públicas no tempo e oferecer duas leituras, **alternáveis por um seletor** na UI:

1. **Performance de conteúdo** — "qual post funciona": impressões, likes, reposts, replies, quotes, bookmarks por post, ranqueável, com a curva de crescimento.
2. **Atribuição ao protocolo** — "esse post moveu a agulha?": cruza a data de cada post com a série DAILY do protocolo (Peça 1).

A Peça 2 **reaproveita quase toda a infra da Peça 1** (modelo de snapshot genérico, cron Bearer-gated, helpers de série).

---

## 2. Decisões fechadas (brainstorming)

| # | Decisão | Valor |
|---|---------|-------|
| ① | Visões | **Ambas**, com **seletor** na UI (Performance · Atribuição) sobre a mesma base de dados |
| ② | Escopo de posts | **Todos** os posts da timeline da conta, **marcando** os que casam com um push do schedule |
| ③ | Granularidade temporal | **Série diária** (curva de crescimento), não só o valor atual |
| ④ | Janela de acompanhamento | **7 dias** de captura diária por post; depois o post congela no último valor. **Backfill 1x** do histórico inteiro na ativação |
| ⑤ | Modelo de dados | **Abordagem A**: reusar `MarketingSnapshot` com `context="X_POST"`, **zero migration** (payload JSON) |
| ⑥ | Janela de atribuição | Δ do protocolo em **1d / 3d / 7d** após o post, **calculado on-the-fly** sobre a série DAILY (sem captura extra) |
| ⑦ | Handle da conta | **@subfrost_news** (com underscore) |

---

## 3. Campos da API X (confirmados na doc oficial — fonte canônica, não o painel)

Endpoint base: `https://api.x.com/2/...`. Os campos abaixo vêm com **`tweet.fields=public_metrics`** em `GET /2/users/:id/tweets` ou `GET /2/tweets`.

| Categoria | Auth | Janela | Campos usados |
|---|---|---|---|
| **`public_metrics`** | **Bearer app-only** | sem limite | `impression_count`, `like_count`, `retweet_count`, `reply_count`, `quote_count`, `bookmark_count` |
| `non_public_metrics` / `organic_metrics` | OAuth user-context (dono) | últimos 30 dias | `url_link_clicks`, `user_profile_clicks`, `engagements` — **FORA DE ESCOPO** (ver §11) |

**Conclusões que guiam o design:**
- As **6 métricas** que queremos estão **todas em `public_metrics`** → basta **`X_BEARER_TOKEN`** (app-only), sem OAuth do dono, **sem limite de 30 dias** (histórico inteiro disponível → o backfill ④ é viável e barato).
- **`profile visits`, `new follows`, `engagement rate`** do painel do X são métricas de **conta**, **não saem por post**. O "engagement rate" por post é **derivado por nós** (§8).
- A conta @subfrost_news é gerida por **delegate**, mas isso **não bloqueia** ler `public_metrics` (são públicos) — qualquer Bearer serve. O delegate só impede **assinar** a dev API (ver §13).

---

## 4. Arquitetura (3 camadas, espelhando a Peça 1)

```
Cloud Scheduler (diário) ──Bearer (PREFETCH_SECRET)──▶ GET /api/marketing/x-cron
                                                           │
                  1. resolve id da conta (@subfrost_news)
                  2. lê timeline (public_metrics) dos posts da janela de 7 dias
                  3. p/ cada post → grava 1 MarketingSnapshot (context="X_POST"), idempotente por (tweetId, dia UTC)
                  4. casa por tweetId com MarketingPush.refUrl → atualiza .metrics do push casado
                                                           │
        /admin/marketing/x  ◀── lê snapshots X_POST + DAILY da MESMA tabela ──┘
            (server component: auth gate marketing.view + fetch)
            (client component: seletor Performance · Atribuição)
```

Backfill: a mesma rota com `?backfill=1` ignora a janela de 7 dias e lê o histórico inteiro (1x, manual, Bearer-gated).

---

## 5. Modelo de dados

**Reusa `MarketingSnapshot`** (`prisma/schema.prisma`), `context="X_POST"` (enum já existente). **Sem migration.** Cada linha = uma leitura de um post num dia.

- `context = "X_POST"`
- `refUrl = <url do tweet>` (display)
- `label = "X @subfrost_news <tweetId> <YYYY-MM-DD>"` (legível)
- `createdAt` (indexado) = momento da captura
- `payload` (JSON):

```ts
interface XPostSnapshotPayload {
  capturedAt: string          // ISO — quando lemos
  tweetId: string             // id do post — CHAVE CANÔNICA de agrupamento
  url: string                 // https://x.com/subfrost_news/status/<id>
  postedAt: string            // created_at do tweet (ISO)
  text: string                // texto truncado (~280 chars) p/ exibir
  metrics: {
    impressions: number | null  // impression_count
    likes:       number | null  // like_count
    reposts:     number | null  // retweet_count
    replies:     number | null  // reply_count
    quotes:      number | null  // quote_count
    bookmarks:   number | null  // bookmark_count
  }
  partial: boolean            // true se a API falhou em algum campo
}
```

**Identidade & matching:**
- Chave canônica do post = **`tweetId`** (robusto a `x.com`/`twitter.com`/query strings).
- Listar posts = `distinct` por `payload.tweetId` (pegando o snapshot mais recente de cada).
- Série de um post = filtra `context="X_POST"` + `tweetId`, ordena por `createdAt`.
- "Marcar os do schedule" = extrair `tweetId` de `MarketingPush.refUrl` (regex `/status/(\d+)`) e casar com `payload.tweetId`.

**Reuso de `MarketingPush.metrics`** (`PushMetrics = { impressions?, likes?, reposts?, clicks? }`): a ingestão preenche `impressions/likes/reposts` (clicks fica `null` — métrica privada) nos pushes casados → o editor de push que hoje pede métricas **na mão** passa a preencher sozinho.

> **Nota de performance:** a query de série por post filtra dentro do JSON por `tweetId`. No volume real (≈ dezenas de linhas/dia; `createdAt` já indexado) é tranquilo. Se um dia pesar, adicionar índice (ex.: GIN em `payload->>'tweetId'`) — **fora do MVP**.

---

## 6. Ingestão

### 6.1 Cron diário `/api/marketing/x-cron`
Espelha `app/api/marketing/snapshot-cron/route.ts`:
1. Resolve o id da conta: `GET /2/users/by/username/subfrost_news` (1x por run) — ou usa `X_ACCOUNT_ID` se setado (evita a chamada).
2. `GET /2/users/:id/tweets?max_results=100&exclude=retweets,replies&tweet.fields=public_metrics,created_at,text` (pagina se preciso). Inclui posts originais + quotes; ignora retweets e replies.
3. Filtra os **postados nos últimos 7 dias** (janela ④). Para cada um, grava 1 `MarketingSnapshot` X_POST — **idempotente por (tweetId, dia UTC)** via `xPostSnapshotExistsOn(tweetId, day)`.
4. Casa por `tweetId` com `MarketingPush.refUrl` → atualiza `.metrics` do push casado com o valor mais recente.
5. Responde `200` com resumo `{ ok, captured, skipped, failed }`.

### 6.2 Backfill (1x na ativação)
Mesma rota com `?backfill=1`: ignora o filtro de 7 dias e pagina o histórico inteiro da timeline (a API serve ~os 3200 posts mais recentes). Idempotente. Roda manual, Bearer-gated (curl).

### 6.3 UTC e idempotência
Dia = `now.toISOString().slice(0,10)` (UTC), igual à Peça 1. Um snapshot por (tweetId, dia).

---

## 7. Segurança

- **Credencial da API X** → secret **`X_BEARER_TOKEN`** (app-only Bearer; basta pros 6 campos públicos), **somente via ESO** (k8s). **Nunca** no Windows nem no repo.
- O cron é Bearer-gated reusando **`PREFETCH_SECRET`** (consistência com `snapshot-cron`).
- ⚠️ **Fix de um buraco aberto:** hoje `snapshot-cron`/`prefetch` estão **abertos no GKE** (o `PREFETCH_SECRET` só existe no Cloud Run). Esta frente **injeta `PREFETCH_SECRET` via ESO no GKE de uma vez**, fechando os 3 endpoints (snapshot-cron, prefetch, x-cron) — resolve o chip de segurança pendente.
- **Degradação (mergeia inerte):** sem `X_BEARER_TOKEN`, o cron responde `{ ok:true, skipped:"not_configured" }` (não quebra) e a aba mostra banner *"X API não configurada"* (padrão do GA4/Site analytics). Permite mergear e deployar agora; liga quando o Bearer existir.

---

## 8. UI

**Onde:** nova sub-aba **"X analytics"** em `/admin/marketing/x`, registrada em `lib/cms/admin-nav.ts` (grupo Marketing), gated `marketing.view`. Server component faz auth + fetch; client component (`XAnalyticsClient`) tem o **seletor de visão** no topo, no molde do `ProtocolAnalyticsClient` (hero cards + recharts + tabela).

### 8.1 Visão "Performance de conteúdo"
- **Hero cards (7d/30d):** Impressões totais · Top post (por impressões) · Engajamento médio. *(O período de **exibição** 7d/30d é o filtro de quais posts entram no agregado — independente da **janela de captura** de 7d ④. Posts fora da janela usam o último valor conhecido, já estabilizado.)*
- **Engagement rate (derivado por nós):** `(likes + reposts + replies + quotes + bookmarks) / impressions` — porque a "engagement rate" do painel do X é métrica de conta, não vem por post. A fórmula fica documentada na UI (tooltip).
- **Tabela de posts** (a "análise microscópica"): 1 linha/post — texto resumido, data, e as **6 métricas** (valor atual = último snapshot), **ordenável** por qualquer coluna; **badge "do schedule"** nos casados; link pro tweet; toggle "só do schedule".
- **Drill-down** (clicar num post): **curva diária** daquele post (recharts) — impressions/likes/… ao longo dos dias (até ~7 pontos). Mostra a velocidade ("bombou nas 1ªs 48h?").

### 8.2 Visão "Atribuição ao protocolo"
Responde *"esse post moveu a agulha?"* cruzando a data do post com a série **DAILY** do protocolo (mesma tabela).
- **Gráfico principal:** série do protocolo (seletor entre holders DIESEL / BTC locked / preço — reusa `buildProtocolSeries`) com **marcadores verticais nas datas dos posts**; hover mostra o post e seu engajamento.
- **Tabela de atribuição:** por post, **Δ do protocolo em 1d / 3d / 7d** após o post (ex.: Δholders, ΔBTC locked), **calculado on-the-fly** sobre a série DAILY, lado a lado com o engajamento do post.
- ⚠️ **Caveat honesto na própria tela:** isto é **exploratório — sinal, não prova**. Vários posts/dia + ruído de mercado tornam atribuição causal impossível. A UI deixa explícito pra não induzir conclusão errada.

---

## 9. Erros e edge cases

- Erro/rate-limit da API X → `partial=true`; `try/catch` **por post** (um post falho não derruba os outros). O cron sempre responde 200 com resumo.
- Post **deletado** some da timeline → snapshots históricos são **mantidos** (não apagamos).
- Campo ausente num tweet → `null` naquela métrica.
- `refUrl` de push vazio/não-X → ignora no matching. Múltiplos pushes com mesmo tweetId → casa todos (raro).
- **UTC** consistente; idempotência por (tweetId, dia UTC).

---

## 10. Testes

Vitest, com **mock do Prisma local** (preferir local a global). **Nada** que bata na API X real (igual aos integration live-RPC, que ficam offline).

- **Unit:** parse de `tweetId` a partir de URL (variações x.com/twitter.com/query); transform resposta-da-API → `XPostSnapshotPayload` (mapeamento, nulls, partial); engagement rate; delta de atribuição 1d/3d/7d sobre séries fixture; matching post↔push; idempotência (`xPostSnapshotExistsOn`).
- **Integration:** `x-cron` com **fixture mockada** da API X → grava snapshots corretos + atualiza push casado; sem `X_BEARER_TOKEN` → `skipped:"not_configured"`.

---

## 11. Fora de escopo (YAGNI)

- **Métricas privadas** (`url_link_clicks`, `user_profile_clicks`, `engagements`) — exigem OAuth user-context da SUBFROST NEWS + só últimos 30 dias. Adiável; o schema (JSON) acomoda no futuro sem migration.
- **Métricas de conta** (profile visits, new follows totais) — não saem por post.
- **Escrita** na API X (publicar/agendar posts pela API) — não é esta frente.
- **Atribuição causal/estatística** — só exploratória.

---

## 12. Deploy (reuso da Peça 1)

- `prisma db push` roda **automático** no merge (CI `deploy.yml`) — mas **não há migration** aqui (payload JSON), então é no-op de schema.
- Novo Cloud Scheduler job pro `x-cron` (ex.: `subfrost-x-engagement`, diário) — adicionar no `deploy.yml` no molde do `subfrost-daily-snapshot`.
- GKE: bump `newTag` (COM ASPAS) em `k8s/kustomization.yaml` → push → Flux annotate `gitrepository` ANTES do `kustomization` (via `kubectl-io.sh`) → `rollout status`.
- ESO: adicionar `X_BEARER_TOKEN` e injetar `PREFETCH_SECRET` no GKE.
- Após deploy: rodar o **backfill 1x** (curl Bearer-gated) quando o `X_BEARER_TOKEN` estiver populado.

---

## 13. Dependência aberta (não bloqueia a implementação)

O `X_BEARER_TOKEN` exige uma dev account da X assinada. A conta @subfrost_news é gerida por **delegate**, que **não permite assinar** a dev API — depende do **dono do login** fazer o signup (Developer Agreement + Project/App + método de pagamento). Enquanto isso não acontece:
- A Peça 2 é construída e deployada **inerte** (degradação §7).
- O "spike ao vivo" (ler 1 post real e validar o JSON) vira **validação na ativação**, não pré-requisito — os campos já estão confirmados pela doc oficial (§3).

---

## 14. Critérios de sucesso

- **Build:** `pnpm exec tsc --noEmit && pnpm test && pnpm build` verdes (menos os ~12 integration live-RPC pré-existentes).
- **Ingestão:** com fixture mockada, `x-cron` grava snapshots X_POST corretos e atualiza o push casado; sem secret, degrada (`skipped:"not_configured"`).
- **UI:** aba `/admin/marketing/x` mostra as duas visões; gated `marketing.view` (307 sem privilégio).
- **Ativação (pós-Bearer):** backfill popula o histórico; o cron diário acumula a série; a tabela por-post e a atribuição renderizam com dados reais.
