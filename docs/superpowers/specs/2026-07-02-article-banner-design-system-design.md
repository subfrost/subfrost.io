# Design — Design system de banners de artigo (banner-kit)

**Data:** 2026-07-02
**Repo:** `subfrost.io` (Next.js 16, deploy GKE/Flux)
**Branch:** `feat/article-banner-kit`
**Tipo:** docs-only — zero mudança de código, schema ou build do site.

## 1. Contexto e objetivo

O Vitor (CMO) produz as capas 24:11 dos artigos do /articles uma a uma, artesanalmente. O brand
SUBFROST já está maduro e **codificado no repo** (`app/brand/page.tsx` + `public/brand/subfrost/`),
mas não existe um caminho repetível de "título de artigo → banner on-brand".

Objetivo: um **design system de banners** que permita a **qualquer sessão futura do Claude** gerar
uma capa consistente em minutos — sem depender do contexto desta conversa, sem deriva visual entre
banners, e com tipografia fiel em todos os contextos onde a capa é consumida (site, OG, X).

## 2. Decisões travadas (com o Vitor, 2026-07-02)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Formato de entrega | **Híbrido A+B**: brand sheet + kit de prompt pro Claude, ancorado em templates SVG canônicos |
| 2 | Cobertura de layouts | **Os 4**: tipográfico padrão, data-driven/stat hero, ilustração conceitual, quote/manifesto |
| 3 | Estética de fundo | **100% vetorial** (rachaduras/facetas de gelo em paths; evolui o look fotográfico das capas 1..9) |
| 4 | Estrutura | **Kit documental puro** (sem script gerador mantido, sem página no site, sem Figma) |
| 5 | Formato de publicação | **SVG é o formato-fonte, PNG 1852×849 é o publicado** (ver §5.4 — gotcha das fontes) |

## 3. Estado atual (confirmado por recon)

**Brand (fonte da verdade in-repo):**

- Paleta: Carbon `#212121` · Frost `#E9F0F7` · Glacial `#A7C6DC` (cor do logomark/floco) · Flare
  `#EC4521` (só alerta/ênfase pontual).
- Tipografia: **Geist** + **Geist Mono** (pacote npm `geist@^1.3.1` já nas deps — os arquivos de
  fonte vivem em `node_modules/geist/dist/fonts/`).
- Personalidade: "cold, precise, liquid, trustworthy — never generic crypto". Proibições: neon,
  blobs, bokeh, gradientes (de cor). Cantos 6px, muito white space.
- Assets: `public/brand/subfrost/Logos/svg/logotype/logotype_{black,light}.svg`,
  `Logos/svg/logomark/logomark.svg`, `Graphics/{jpeg,png}/{banner,graphic,ice_bg}.*`,
  `SUBFROST-brand-guidelines.pdf`.

**Capas atuais:** `public/articles/subfrost-cover-1..9.png` — PNG, fundo quase-preto com textura
fotográfica de gelo, logo "subfrost" sup-esq, eyebrow `ARTICLE #N:` em Glacial, título grande
branco (Geist), floco inf-dir.

**Pipeline de capa (PR #148, LIVE em prod):**

- Upload via editor `/admin` (só-URL ou upload) → `lib/cms/handle-upload.ts`: SVG é sanitizado
  (`lib/cms/svg-sanitize.ts`, DOMPurify profile SVG — permite `<style>`, bloqueia
  script/foreignObject/handlers); raster é otimizado (variantes AVIF/WebP, marcador `.opt.`).
- Render no site: `components/articles/CmsCoverImage.tsx` → **`<img>`** (com `<picture>`
  AVIF/WebP quando há variantes).
- OG social: `app/articles/[slug]/opengraph-image.tsx` → **satori** (`next/og`) desenha a capa
  via `<img objectFit:contain>` num canvas 1200×630 — reenquadra automaticamente pro X.

**Gotcha central (motiva a decisão #5):** a capa é consumida via `<img>` no site e via
satori/resvg na OG. Nos dois contextos, um SVG com `<text font-family="Geist">` **não tem
garantia de resolver a Geist** — SVG dentro de `<img>` não acessa fontes da página nem carrega
fontes externas, e o suporte do rasterizador da OG a `@font-face` embutido é incerto. Publicar o
SVG cru arriscaria título em fonte fallback pro visitante e no card do X.

## 4. Requisitos

- **R1** — Kit **autossuficiente**: uma sessão nova do Claude, recebendo só o `BANNER-KIT.md` (ou
  o prompt colado dele), produz um banner on-brand sem precisar deste histórico de conversa.
- **R2** — **4 layouts canônicos** com anatomia documentada e template SVG copiável cada.
- **R3** — Tipografia **fiel (Geist/Geist Mono) em todos os contextos**: card do site, página do
  artigo, OG/X.
- **R4** — SVGs-fonte **100% vetoriais e self-contained**: sem raster embutido, sem referências
  externas (fontes, imagens, CSS linkados).
- **R5** — Entrega **docs-only**: nenhuma mudança em código, dependências, schema ou build do
  site. `tsc --noEmit` e `vitest` intocados por construção.
- **R6** — Via **PR** (nunca push direto na main).

## 5. Design

### 5.1. Estrutura de arquivos

```
docs/brand/banner-kit/
├── BANNER-KIT.md          # documento central (brand sheet, anatomia, prompt, receita)
├── templates/
│   ├── typographic.svg    # 4 templates de referência com conteúdo
│   ├── stat-hero.svg      #   de exemplo real (artigos publicados)
│   ├── concept.svg
│   └── quote.svg
└── covers/
    └── <slug>.svg         # arquivo dos SVGs-fonte de cada capa produzida
```

Os templates são a **âncora de consistência**: sessões futuras copiam o template e trocam o
conteúdo, em vez de gerar do zero. `covers/` guarda o SVG-fonte de cada capa publicada, nomeado
pelo slug do artigo, pra edição futura sem retrabalho.

### 5.2. Anatomia comum (o grid compartilhado)

- **Canvas:** `viewBox="0 0 1852 849"` (24:11), full-bleed, **sem safe-zone** — a OG automática
  já reenquadra pro X.
- **Margem interna** pros elementos fixos: ~72px (valor exato calibrado medindo as capas atuais
  durante a implementação; o valor final fica gravado nos templates e no `BANNER-KIT.md`, que
  passam a ser a fonte da verdade).
- **4 zonas fixas:**
  1. **Logotype "subfrost"** sup-esq — paths copiados de `logotype_light.svg` pra dentro do
     template (sem referência externa, R4).
  2. **Eyebrow** `ARTICLE #N:` — Glacial `#A7C6DC`, Geist Mono, uppercase, tracking largo.
  3. **Título** — Frost/branco, Geist bold; escala por comprimento (curto ≈ 120px, longo ≈ 88px);
     **máx 3 linhas**, quebradas por sentido (não por largura cega).
  4. **Logomark (floco)** inf-dir, discreto.
- **Cor e textura:** fundo Carbon escurecido (faixa quase-preta das capas atuais); texturas de
  gelo **100% vetoriais** (rachaduras, facetas, linhas finas) em Glacial/Frost com opacidade
  baixa (~8–15%); **gradientes só de luminância** (profundidade), nunca de cor; **Flare em no
  máx 1 elemento** e só quando o artigo pede ênfase/alerta; sem neon/blobs/bokeh (regra do brand).

### 5.3. Os 4 templates

Todos herdam a anatomia comum; o que muda é o protagonista.

1. **`typographic.svg` — workhorse (default).** O padrão das capas atuais, vetorizado:
   composição de rachaduras/facetas de gelo atravessando o canvas, título grande dominante no
   terço esquerdo/central. Se o artigo não tem ângulo visual óbvio, é este.
2. **`stat-hero.svg` — data-driven.** Número gigante em Geist Mono (ex: `1.2M`) ou
   mini-visualização estilizada (barras/linha em Glacial, abstrata) como protagonista à direita;
   título menor à esquerda, subordinado ao dado. Eyebrow pode ganhar sufixo contextual
   (ex: `ARTICLE #12: BY THE NUMBERS`).
3. **`concept.svg` — ilustração conceitual.** Metade direita reservada pra arte conceitual
   gerada por sessão (onde o prompt-kit trabalha mais). O template traz arte de exemplo + regras
   da linguagem visual: geométrica, linhas finas 1.5–2.5px, facetas de gelo, monocromática
   Glacial/Frost sobre Carbon, sem preenchimentos sólidos grandes, sem figuras humanas/mascotes.
   Título na metade esquerda.
4. **`quote.svg` — manifesto.** Frase centralizada grande em Geist, aspas tipográficas
   estilizadas em Glacial como elemento gráfico, atribuição em Geist Mono menor, textura mínima.
   Pra artigos opinativos/visão.

### 5.4. Publicação — SVG-fonte → PNG publicado

Resolve o gotcha das fontes (§3) sem tocar no site:

1. Claude gera/edita o **SVG-fonte** (editável, com `<text>`, font stack
   `Geist, 'Helvetica Neue', Arial, sans-serif`) e salva em `covers/<slug>.svg`.
2. **Receita de rasterização** documentada no `BANNER-KIT.md`: ~10 linhas de Node com
   `@resvg/resvg-js`, rodadas **ad-hoc no scratchpad** (não é script mantido no repo), com
   `fontFiles` apontando pras Geist de `node_modules/geist/dist/fonts/`. Exporta **PNG
   1852×849** com tipografia fiel.
3. O PNG é subido no editor `/admin` como hoje. Todo o resto já existe e está validado em prod:
   o pipeline do PR #148 otimiza pra AVIF/WebP e a OG automática reenquadra pro X.

As capas atuais já são PNG → **zero risco novo no pipeline**. O vetorial vive como fonte da
verdade editável; o site recebe o que já sabe servir.

### 5.5. O prompt-kit (seção "cole isto numa sessão do Claude" do BANNER-KIT.md)

Cinco blocos:

1. **Persona + brand rules** — brand sheet condensado (paleta com hex, tipografia, personalidade,
   proibições). Autossuficiente: não depende de ler o repo (R1).
2. **Seletor de template** — critério objetivo de qual dos 4 usar conforme o tipo de artigo, com
   o path de cada um.
3. **Inputs** — o que a sessão precisa receber: título, nº do artigo, tipo/tema e (pro concept)
   uma frase descrevendo o conceito da arte.
4. **Processo** — copiar o template → substituir textos → ajustar escala do título pela regra de
   comprimento → gerar/adaptar a arte variável → salvar SVG-fonte em `covers/<slug>.svg` →
   rasterizar (receita §5.4) → subir no `/admin`.
5. **Checklist de QA** (defesa contra deriva) — só cores da paleta; gradiente só de luminância;
   máx 3 linhas de título; margens respeitadas; logotype/floco intocados nas posições canônicas;
   contraste do título ≥ WCAG AA sobre o fundo; nenhuma referência externa no SVG.

## 6. Validação / aceite

- **4 banners de exemplo reais** (1 por template), com títulos de artigos já publicados,
  rasterizados em PNG, aprovados visualmente pelo Vitor lado a lado com as capas atuais.
- **Receita testada ponta a ponta**: SVG → PNG → conferir tipografia (Geist de verdade, não
  fallback) e cores no resultado.
- **PR docs-only** no subfrost.io com o kit completo. Nenhum gate de código afetado (R5).

## 7. Fora de escopo

- Script gerador mantido no repo (upgrade futuro se a prática mostrar deriva visual).
- Página/gerador no `/admin` e kit Figma (descartados na decisão #1/#4).
- Re-render das capas antigas 1..9 (convivem com as novas; o follow-up do cover do BIP-110 é
  demanda separada).
- Postagem manual no X (a OG automática já cobre o card).
