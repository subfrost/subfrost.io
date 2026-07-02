# Design — Qualidade de imagem no /articles

**Data:** 2026-07-01
**Repo:** `subfrost.io` (Next.js 16, deploy GKE/Flux)
**Branch:** `feat/articles-image-quality`

## 1. Contexto e objetivo

O próximo artigo do /articles é **data-heavy**, com muitos **gráficos** derivados do OP_RETURN
decoder. É um artigo importante (demanda do flex) e precisa de **qualidade de imagem impecável** —
gráficos têm texto fino, linhas e eixos, onde borrão e artefato de compressão são cruéis. **Nós
(Claude + design) geramos os gráficos**, então controlamos o formato de origem.

Objetivo: subir a qualidade das imagens do /articles (nitidez + peso) **e** garantir que a capa
social sempre enquadre certo no X — sem trabalho manual por artigo.

## 2. Estado atual (confirmado por recon)

Todo o pipeline de imagem de artigo é **`<img>` cru**, sem otimização:

| Etapa | Hoje |
|---|---|
| `next.config.mjs:16` | `images: { unoptimized: true }` — mas **nenhum componente de artigo usa `next/image`**, então o flag é irrelevante pro caminho atual. |
| Upload (`app/api/admin/upload/route.ts` → `lib/cms/gcs.ts uploadImage`) | Grava o buffer **BRUTO** no GCS `subfrost-cms` (prefixos `avatars/`,`covers/`,`inline/`). Valida tipo (png/jpeg/webp/gif/avif — **SVG rejeitado**) + 8MB. Zero processamento. |
| Cover CMS (`components/articles/CmsCoverImage.tsx`) | `<img src>` cru, sem `srcset`/`sizes`. `object-fit:contain` num frame `aspect-[24/11]` (`globals.css:1065`). |
| Cards (`ArticleCard`, `BlogCardCover`) | `<img>` cru. |
| **Inline do corpo** `![](url)` (`lib/cms/markdown.tsx`) | **Sem componente `img` custom** no react-markdown → `<img>` HTML puro via rehype, sem `loading`/`decoding`/`srcset`. |
| Fallback sem cover (`CoverArt.tsx`) | Já usa `<picture>` webp srcset 480/960/1536 (assets estáticos) — único caminho "bom". |
| OG social (`app/articles/[slug]/page.tsx:46-49`) | `og:image`/`twitter:image` = a própria `coverImage` (24:11). O X usa **1.91:1** → center-crop corta ~6,2% de cada lado → come texto/logo próximos das bordas. |

`sharp` **não está** nas dependências.

## 3. Requisitos

- **R1** — Gráficos vetoriais (SVG) que geramos renderizam com nitidez infinita e são servidos com segurança.
- **R2** — Imagens raster (fotos, capas, charts densos) servidas em formato moderno (AVIF/WebP), nítidas em retina, sem upscale, sem peso desnecessário.
- **R3** — Capa social sempre enquadrada corretamente no X (1.91:1), automaticamente, para qualquer artigo (atual e futuro), sem trabalho manual.
- **R4** — **Sem regressão** para imagens já publicadas e para URLs externas (não-GCS).
- **R5** — **Sem mudança de schema** Prisma (o init `prisma db push` sem `--accept-data-loss` quebra o boot se o banco divergir).
- **R6** — Entregue via PR, com `tsc --noEmit` limpo e `vitest` verde.

## 4. Design

Quatro componentes independentes.

### 4.1. Trilha SVG-first (R1)

O caminho nobre para os gráficos que geramos. SVG vetorial = nitidez infinita, texto/eixos
perfeitos, arquivo leve.

- **Upload aceita SVG:** adicionar `image/svg+xml` ao `ALLOWED`/`EXT` de `gcs.ts`.
- **Sanitização obrigatória no servidor** antes de gravar no GCS: remover `<script>`, atributos
  `on*`, `<foreignObject>`, e referências externas. Lib: **`DOMPurify` + `jsdom`** (server-side).
  Motivo: SVG é vetor de XSS; mesmo servido via `<img>` (que não executa script), sanitizamos o que
  fica hospedado no nosso domínio/bucket.
- **Render:** SVG passa como `<img src=…svg loading=lazy decoding=async>` (sem `<picture>`).
- Novo módulo: `lib/cms/svg-sanitize.ts` (`sanitizeSvg(buffer): Buffer`).

### 4.2. Trilha raster de alta qualidade (R2)

- Adicionar **`sharp`**. Processar **no upload** (nodejs runtime), servindo estático do GCS (barato
  em runtime, CDN-friendly — nada roda no pod por request).
- Para cada upload raster (png/jpeg/webp), gerar e gravar:
  - `<base>.opt.avif` — AVIF, qualidade ~55 (altíssima p/ AVIF).
  - `<base>.opt.webp` — WebP, qualidade ~82 (fallback).
  - `<base>.opt.<ext>` — o original reencodado (auto-orient EXIF), fallback universal.
- **Sem upscale:** largura-cap na largura original.
- **Simplificação-chave (larguras):** a coluna do artigo é `max-w-[920px]` **fixa**, então o inline
  **não precisa de srcset multi-largura**: uma largura-cap de **1920px** (retina 2× da coluna) em
  AVIF+WebP já resolve nitidez retina + peso. Para **cover** (que aparece em tamanhos variados) o
  plano pode gerar 2 larguras (ex: 1280 e 1920) — decisão fina fica pro plano de implementação.
- Novo módulo: `lib/cms/image-process.ts` (`processRaster(contentType, buffer) → { fallback, avif, webp }`).

### 4.3. Render com `<picture>` (R2, R4)

- **Detecção à prova de regressão via marcador de path.** Uploads processados carregam o marcador
  **`.opt.`** no nome. O render só monta `<picture>` (com `.opt.avif` + `.opt.webp` + `<img .opt.ext>`)
  quando a URL casa o padrão `.../subfrost-cms/....opt.<raster>`. Todos os três derivativos são
  gravados juntos, então **nunca há 404**. Imagens **sem** o marcador (antigas, externas) caem no
  `<img>` simples — **sem regressão**.
- Novo módulo: `lib/cms/image-srcset.ts` (`pictureSources(src) → { avif, webp, fallback } | null`).
- `lib/cms/markdown.tsx`: adicionar componente `img` custom no react-markdown:
  - `.svg` → `<img loading=lazy decoding=async>`.
  - casa `.opt.` → `<picture>` (AVIF → WebP → `<img>`), `loading=lazy decoding=async`.
  - senão → `<img loading=lazy decoding=async>` (comportamento atual + lazy/async).
- `CmsCoverImage`/`BlogCardCover` passam a usar `pictureSources` quando aplicável.

### 4.4. OG social automática (R3)

- Nova rota **`app/articles/[slug]/opengraph-image.tsx`** (`next/og` `ImageResponse`, mesmo mecanismo
  já usado em `app/articles/opengraph-image.tsx`):
  - Canvas **1200×630** (1.91:1), fundo escuro fixo (ex: `#05070d`).
  - Cover em `object-fit: contain` → laterais 100% preenchidas, faixas finas em cima/baixo (que
    somem em arte escura). Nada de corte lateral no X.
  - Sem cover → branding genérico (reusa o layout do `opengraph-image` global).
- `generateMetadata` em `page.tsx` aponta `og:image`/`twitter:image` para essa rota (não mais a
  cover direta). A **página** continua exibindo a cover original full-bleed 24:11 — inalterada.
- Follow-up (fora do caminho crítico): depois que a OG automática estiver live, reverter a
  `coverImage` do artigo `why-bip110-doesnt-stop-alkanes` para a original full-bleed
  (`covers/cmqlujevl0000tanjvueemeg3-image3png-2512225.png`), já que a OG passa a ser gerada. O X
  re-scrapeia com `?v=N`.

## 5. Decisões técnicas (com rationale)

- **Processar no upload (não ligar o Next optimizer).** Nenhum componente usa `next/image`; ligar
  `unoptimized:false` exigiria migrar todos os `<img>` **e** rodar sharp no pod a cada request.
  Processar no upload entrega a mesma qualidade servindo estático. (Escolha do stakeholder.)
- **Inline sem srcset multi-largura.** Coluna fixa 920px → basta a largura-cap retina. Menos código,
  menos superfície de bug.
- **Marcador `.opt.` no path** para distinguir imagens otimizadas sem estado/schema e sem risco de 404.
- **DOMPurify+jsdom** para sanitizar SVG (robusto, testável) em vez de allowlist manual frágil.
- **OG dinâmica via `next/og`** em vez de campo `ogImage` no schema: automático para toda capa, zero
  trabalho manual, **sem migração de schema**. Se um dia precisarmos de override manual por artigo,
  adicionamos o campo depois (evolui para híbrido) — YAGNI por ora.

## 6. Fora de escopo

- Ligar o Image Optimization do Next / migrar `<img>`→`next/image`.
- Qualquer mudança de schema Prisma.
- Backfill/reprocessamento das imagens já publicadas (elas seguem no caminho `<img>` simples, sem
  regressão; backfill é follow-up opcional).
- Pipeline de vídeo/HLS (`/stream`).

## 7. Testes (R6)

- `lib/cms/svg-sanitize`: payloads com `<script>`, `onload=`, `<foreignObject>`, `href` externo →
  saem limpos; SVG legítimo (paths, texto, gradientes) preservado.
- `lib/cms/image-srcset` (`pictureSources`): deriva as 3 URLs corretas para `.opt.`; retorna `null`
  para `.svg`, para não-`.opt.`, e para URLs externas.
- `lib/cms/image-process`: gera avif/webp/fallback; respeita cap (não faz upscale); auto-orient.
  (Teste com um buffer sintético pequeno.)
- OG route: smoke — responde `200 image/png`, dimensões 1200×630.
- `npx tsc --noEmit` limpo (o CI ignora erros de tipo; rodar à mão) + `npx vitest run tests/cms/`.

## 8. Rollout / deploy

- Via **PR** (branch→PR→merge). Nunca push direto na main.
- Deploy GKE/Flux: bump `newTag` full-SHA (com aspas) no `k8s/kustomization.yaml` + reconcile
  (annotate `gitrepository/subfrost-io` → `kustomization/subfrost-io` via
  `.ioenv-extracted/kubectl-io.sh`). `git push origin main` pode travar → token embutido.
- **Verificar `sharp` no build standalone** (binário nativo linux no Docker) — é o principal risco
  de deploy; validar no build antes do deploy.
- Teste de aceitação: subir um gráfico real (SVG e PNG) do próximo artigo no /admin; conferir
  `<picture>`/AVIF servido (DevTools) e nitidez no /articles; conferir a OG no card do X.

## 9. Riscos / gotchas

- **`sharp` no runtime standalone GKE** — binário nativo; garantir que o Docker build inclui a
  variante linux (`sharp` costuma resolver via `serverExternalPackages`, à la `@alkanes/ts-sdk`).
  Principal ponto a validar.
- **`next/og` no pod** — já usado no `opengraph-image` global, então caminho conhecido; a rota busca
  a cover do GCS (público) via `<img src>` no `ImageResponse`.
- **Convenção da rota `opengraph-image` do Next** — o arquivo `[slug]/opengraph-image.tsx` injeta a
  OG automaticamente no metadata da rota; alinhar com o `images` explícito do `generateMetadata` pra
  não duplicar/conflitar (detalhe do plano).
- Editor de cover é **só-URL** (não passa pelo upload) — por isso a OG é gerada dinamicamente da
  cover, funcionando independente de como a cover foi setada.
