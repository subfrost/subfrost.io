# Spec — subfrost.io/data: página pública de dados do protocolo ("Glassnode de Alkanes" v1)

**Data:** 2026-07-03 · **Autor:** brainstorm Vitor (CMO) + Claude Fable 5
**Destino:** commitar como `docs/superpowers/specs/2026-07-03-public-data-page-design.md` no branch da feature quando o build começar.
**Contexto estratégico:** Aposta 2 do mapa de crescimento (`C:\Alkanes Geral Dev\brainstorms\growth-map-2026-07-03.md`) — transformar o dado on-chain da SUBFROST em destino público citável por criadores de conteúdo (Ocidente). Decisões travadas com o Vitor nesta sessão.

## Objetivo

Página pública `subfrost.io/data` — sem login, bilíngue EN/ZH — mostrando as métricas do protocolo com histórico, na estética do banner-kit, onde **cada métrica tem um card compartilhável branded** (1 clique → imagem 1200×675 + tweet intent). Citação de criador vira tráfego no site.

## Decisões travadas (não reabrir)

1. **v1 = só dados de snapshot** (holders, preços, BTC locked, frBTC supply, ratios). **NENHUM dado do OP decoder/comparativo em público até o Vitor oficializar o decoder** (motor exato + metodologia). Os 187 dias de `OpReturnDaily` ingeridos pelo #138 são amostrais e de uso interno (/admin) por ora.
2. **Share v1 = página + cards por métrica + OG rico.** Iframe embeds e API documentada = fora do v1.
3. Vive no site oficial (não em dashboard neutro).
4. Hero em destaque = **BTC locked** (número de confiança).

## Escopo v1

### Página `/data` (`app/data/page.tsx`, SSR)
- **Hero:** BTC locked grande + frBTC supply; sub-heroes: DIESEL holders, DIESEL price.
- **Grid de métricas** (cada uma com valor atual + gráfico de histórico + botão share): DIESEL holders · DIESEL price · DIESEL market cap · FIRE price · frBTC supply · BTC/DIESEL · BTC/FIRE.
- Gráficos: recharts (mesmo stack do `/admin/marketing/protocol`), série DAILY.
- Estética: banner-kit (dark glacial `#071224`/`#0b1220`, acentos `#5dcaa5`, Geist, floco oficial `logomark-glyph`), responsivo, dark-first.
- i18n EN/ZH pelo mecanismo existente do site (cookie `subfrost_locale` + middleware); strings novas nos dois locales.
- Estado vazio gracioso: com <7 pontos de histórico, mostrar valores atuais + "history building since {data}" em vez de gráfico quebrado.

### API pública `/api/data` (read-only, cacheada)
- Agrega `MarketingSnapshot` (context DAILY) numa série limpa por métrica + valores "agora" (mesma fonte do `/api/stats`/HomeStat já público na home). **Só dados já públicos; nada sensível.**
- Cache: `revalidate`/CDN ≥ 5 min. Sem auth, sem rate-limit próprio (cache absorve).
- Sem mudança de schema Prisma.

### Cards de share `/data/card/[metric]` (next/og, público)
- Imagem 1200×675 branded por métrica (valor atual + spark/delta + logomark), reusando o motor de render do stat-card studio (#138) — **refactor: extrair o renderer comum pra `lib/` compartilhada** entre a rota admin e a pública.
- Botão share na página: copia link do card + abre tweet intent pré-preenchido (texto EN com o número + link `subfrost.io/data`).
- OG da página `/data` = card do hero (BTC locked) → colar o link no X já rende visual branded. Respeitar zona segura ~1.91:1 do X (elementos a ≥10% das bordas).

### SEO
Metadata bilíngue, título/descrição próprios, entrada no sitemap, canonical.

## Dependências
- **Fix do snapshot diário** (sessão paralela `fix/marketing-daily-snapshot-cronjob`, em andamento): sem ele a série DAILY tem 1 ponto. A página degrada graciosamente (estado vazio acima), mas o lançamento público deve esperar ≥7 dias de série.
- Stat-card studio #138 **já LIVE** (motor next/og disponível pra reuso).

## v2 (explicitamente fora do v1)
- **Comparativo Alkanes vs Runes vs Ordinals** — entra SOMENTE após a oficialização do decoder, definida como o pacote: motor exato full-chain pronto (frente de outro chat) + **página de metodologia pública nos docs** (citável como fonte, ideia do Vitor) + lançamento/anúncio próprio. A arquitetura do grid deve aceitar novas seções sem refactor.
- **Pipeline de dados OP_RETURN (decisão 2026-07-03): manter o padrão PULL.** O decoder/motor (outro chat) continua publicando CSV público → o CronJob `opreturn-sync` (LIVE desde o #138, diário 06:30 UTC, upsert idempotente por data) ingere pro Postgres → o /data lê SÓ do Postgres. **Não** fazer push direto do decoder pro site (acoplaria tooling externo à API, exigiria secret e error-handling novos, sem ganho — freshness necessária é diária, e o admin já tem "Sync now" pra forçar). Na oficialização, upgrades no publicador: migrar de `vdto88.github.io` pessoal pra **repo da org subfrost** (fonte citável oficial), versionar o schema do CSV (motor exato = v2 do contrato, sync só troca a URL), e a página de metodologia linka o dado bruto público ("raw data aberto e auditável" = ativo de credibilidade).
- Iframe embeds; API pública documentada; gatilhos de milestone.

## Tratamento de erros
- `/api/data` com banco indisponível → 503 + página serve último cache/`fallback` estático dos heroes (mesmo padrão de resiliência da home).
- Card de métrica desconhecida → 404. Dado ausente no card → render "—" (nunca 500; card quebrado no X queima a citação).

## Testes
- Unit: agregação da série (janelas, gaps de dias, 1 ponto, vazio); mapeamento métrica→card.
- Rota card renderiza 200 + content-type imagem pra cada métrica válida; 404 pra inválida.
- Smoke SSR da página nos dois locales; estado vazio.
- Gates padrão: tsc 0, vitest verde (4 falhas pré-existentes do pager não contam), next build ok.

## Rollout
Branch `feat/public-data-page` → PR (nunca push direto) → build subagent-driven (Sonnet 5) no padrão SDD das frentes io → gates → merge → deploy Flux (bump `newTag` full-SHA COM ASPAS + annotate source→kustomization) → verificar `/data` 200 nos dois locales + OG no validator do X. Anunciar só depois da série ter ≥7 dias.
