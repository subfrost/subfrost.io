# SUBFROST Article Banner Kit

Design system para capas de artigo 24:11 (1852×849) do subfrost.io. Fonte da verdade do brand:
`app/brand/page.tsx` + `public/brand/subfrost/`. Fonte da verdade da anatomia: os templates em
`templates/` deste kit.

## Como usar (fluxo completo)

1. Escolha o template pelo tipo de artigo (tabela abaixo).
2. Copie o SVG do template e substitua os textos (regras de escala abaixo).
3. Gere/adapte a arte variável (só no concept; nos outros, ajuste fino da textura é opcional).
   A arte do concept segue a linguagem do kit: geométrica, linhas finas (1.5–3px), facetas,
   monocromática Glacial/Frost sobre o fundo escuro — sem preenchimentos sólidos grandes.
4. Salve o SVG-fonte em `covers/<slug-do-artigo>.svg` (commit via PR).
5. Rasterize para PNG 1852×849 (receita abaixo) e suba o PNG no editor `/admin`.
   O pipeline do site otimiza (AVIF/WebP) e a OG automática reenquadra pro X — full-bleed,
   sem safe-zone.

## Seletor de template

| Template | Use quando | Exemplo no kit |
|---|---|---|
| `typographic.svg` | Default. Artigo sem ângulo visual óbvio. | "Ethereum Was Supposed to Run on Bitcoin" |
| `stat-hero.svg` | Artigo data-heavy; um número resume a história. | "Alkanes by the Numbers" |
| `concept.svg` | Artigo com um conceito visualizável. | "Why BIP-110 Doesn't Stop Alkanes" |
| `quote.svg` | Artigo opinativo/visão; uma frase carrega. | manifesto |

## Brand sheet (condensado)

- **Paleta**: Carbon `#212121` (e derivados escuros) · Frost `#E9F0F7` · Glacial `#A7C6DC`
  (floco, acentos frios) · Flare `#EC4521` (SÓ ênfase/alerta, máx 1 elemento por banner).
  Título em `#F4F7FA`.
- **Tipografia**: Geist (títulos/editorial) + Geist Mono (eyebrow, dados, atribuições).
- **Personalidade**: cold, precise, liquid, trustworthy — never generic crypto.
- **Proibições**: neon, blobs, bokeh, gradientes de cor (só luminância), raster embutido,
  figuras humanas/mascotes, preenchimentos sólidos grandes.

## Anatomia canônica (todas as medidas em unidades do viewBox 1852×849)

- Canvas: `viewBox="0 0 1852 849"`, full-bleed.
- **Logotype** "subfrost": `<g transform="translate(6.8,68.3) scale(0.188)">` + paths brancos
  de `public/brand/subfrost/Logos/svg/logotype/logotype_light.svg` (sem o floco). NÃO mover.
- **Eyebrow**: Geist Mono 600, 33px, letter-spacing 7, `#A7C6DC`, x=86, baseline y=315,
  UPPERCASE, termina em `:` (ex.: `ARTICLE #12:`). Sufixo contextual permitido
  (`ARTICLE #12: BY THE NUMBERS`). Única exceção posicional do kit: no `quote.svg`, eyebrow
  e frase são centralizados (`text-anchor="middle"`, x=926) — layout do template, não copiar
  x/y fixos para os outros três.
- **Título**: Geist 700, `#F4F7FA`, x=84. Escala por comprimento: 1 linha → 118px;
  2–3 linhas → 108px, avanço de baseline 124px. MÁXIMO 3 linhas, quebradas por sentido.
  (No stat-hero o título é subordinado: 84px, avanço 96px, máx 2 linhas. No quote, a frase
  usa Geist 600 76px, centralizada, 2 linhas.)
- **Logomark** (floco): `<g transform="translate(1612,641) scale(0.381)">` + path `#A7C6DC`
  do logotype_light.svg. NÃO mover.
- **Fundo**: gradiente vertical de luminância `#0B0F14 → #04060A`.
- **Textura de gelo**: strokes `#A7C6DC` opacity 0.06–0.18 / width 1–3; facetas (polygons)
  opacity 0.03–0.06. Densidade à direita; a coluna de texto respira (nenhum stroke sob texto).

## Receita de rasterização (SVG-fonte → PNG publicado)

Por que: a capa é servida via `<img>` e a OG via satori — `<text font-family="Geist">` NÃO
resolve a fonte nesses contextos. O PNG rasterizado com as TTFs reais resolve.

No scratchpad (NÃO commitar): `npm i @resvg/resvg-js`, depois `node render.mjs in.svg out.png`:

```js
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const [,, inSvg, outPng] = process.argv
const FONTS = '<raiz-do-repo>/node_modules/geist/dist/fonts'
const svg = readFileSync(inSvg, 'utf8')

const r = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1852 },
  font: {
    fontFiles: [
      `${FONTS}/geist-sans/Geist-Bold.ttf`,
      `${FONTS}/geist-sans/Geist-SemiBold.ttf`,
      `${FONTS}/geist-sans/Geist-Medium.ttf`,
      `${FONTS}/geist-sans/Geist-Regular.ttf`,
      `${FONTS}/geist-mono/GeistMono-SemiBold.ttf`,
      `${FONTS}/geist-mono/GeistMono-Bold.ttf`,
    ],
    loadSystemFonts: false,
    defaultFontFamily: 'Geist',
  },
})
writeFileSync(outPng, r.render().asPng())
console.log('rendered', outPng)
```

Gotchas conhecidos: `feGaussianBlur` no resvg deixa retângulos escuros translúcidos/esverdeados
(linearRGB) — não usar; para véus/scrims use `linearGradient` de opacidade. O pacote `geist`
do npm traz TTFs (além de woff2) — use os TTFs. A lista de `fontFiles` precisa cobrir todo
`font-weight` usado nos templates (ex.: `quote.svg` usa Geist 600 na frase — exige
`Geist-SemiBold.ttf`, não só Bold/Medium/Regular).

## Prompt pronto (cole numa sessão nova do Claude)

> Você vai criar a capa 24:11 de um artigo do subfrost.io usando o banner-kit do repo.
> Leia `docs/brand/banner-kit/BANNER-KIT.md` e siga o fluxo "Como usar". Inputs:
> - **Título**: <título exato do artigo>
> - **Número do artigo**: <N>
> - **Tipo**: <default | data-heavy | conceito | opinião> → escolha o template pela tabela.
> - **Conceito da arte** (só p/ concept): <uma frase, ex. "rachaduras que param na borda">
> - **Stat** (só p/ stat-hero): <número + label>
>
> Regras não-negociáveis: paleta/anatomia/proibições do BANNER-KIT.md; logotype e floco
> intocados nas posições canônicas; máx 3 linhas de título; QA checklist antes de entregar.
> Salve o SVG-fonte em `docs/brand/banner-kit/covers/<slug>.svg`, rasterize com a receita
> e entregue o PNG + preview.

## QA checklist (rodar antes de entregar qualquer banner)

- [ ] Só cores da paleta (Carbon/derivados, Frost, Glacial, `#F4F7FA`; Flare no máx 1 elemento). Branco do logotype é canônico (ok).
- [ ] Gradientes só de luminância; zero neon/blob/bokeh.
- [ ] Máx 3 linhas de título; quebras por sentido; nada de hífen.
- [ ] Logotype e floco nas posições canônicas, intocados.
- [ ] Nenhum stroke/faceta sob o texto; coluna de texto respira.
- [ ] Contraste título/fundo ≥ WCAG AA (branco sobre quase-preto passa folgado).
- [ ] SVG self-contained: sem `<image>`, `<script>`, `<foreignObject>`, refs externas.
- [ ] Render final: PNG 1852×849, tipografia Geist real (não fallback), conferido visualmente.
- [ ] SVG-fonte salvo em `covers/<slug>.svg`.
