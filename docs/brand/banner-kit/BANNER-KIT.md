# SUBFROST Article Banner Kit

Design system para capas de artigo 24:11 (1852×849) do subfrost.io. Fonte da verdade do brand:
`app/brand/page.tsx` + `public/brand/subfrost/`. Fonte da verdade da anatomia: os templates em
`templates/` deste kit.

O kit tem **dois modos**:

- **Modo foto (principal)** — capa fotográfica de gelo (o estilo das capas atuais) + overlay
  canônico por cima. A foto vem de gerador externo via prompts calibrados. Ver "Modo foto".
- **Modo vetorial (alternativo)** — capa 100% SVG a partir dos 4 templates vetoriais, quando
  não houver foto ou o artigo pedir o look geométrico. Ver "Como usar — modo vetorial".

## Modo foto (principal)

Estilo-alvo: macro fotográfico de gelo glacial — azul translúcido profundo, texturas
rachadas, iluminação fria direcional, sombras quase-pretas (referência: capas atuais em
`public/articles/`). Fluxo:

1. **Gere a foto** num gerador externo com os prompts abaixo (Gemini/Nano Banana ou Grok).
2. **Aceite a foto** pelos critérios: paleta fria azul/ciano, sombras quase-pretas; uma zona
   escura contínua (≥1/3 do quadro, de preferência à esquerda) pro bloco de texto; sem
   pessoas, animais, texto, logos ou objetos; textura nítida; o mais largo possível
   (21:9 > 16:9) na maior resolução oferecida.
3. **Componha o overlay canônico** (`templates/photo-overlay.svg`) por cima com a receita de
   composição abaixo → PNG 1852×849 → upload no `/admin`. Arquive o SVG de composição em
   `covers/<slug>.svg` e a foto original como `covers/<slug>-photo.<ext>`.

### Prompt de foto — Gemini / Nano Banana (preferido)

Anexe uma capa existente como referência de estilo (aumenta a consistência; sem anexo o
prompt também funciona) e cole:

> Generate a photorealistic image in the exact photographic style of the attached reference:
> an extreme macro photograph of glacial ice, deep translucent blue ice with intricate
> cracked textures and facets, dramatic directional cold lighting, moody near-black shadows,
> cold cyan-blue color grade. Composition: keep the left third of the frame in deep shadow
> (almost black) as clean negative space; the detailed ice fills the center and right. No
> people, no animals, no text, no logos, no man-made objects. Widescreen 21:9, highest
> resolution. Subject: [ice cave interior | field of deep fissures | underside of an iceberg
> meeting dark water | wall of layered blue ice | macro of ice crystals].

### Prompt de foto — Grok

> Photorealistic extreme macro photograph of glacial ice: deep translucent blue ice,
> intricate cracked textures and facets, dramatic cold directional light, near-black moody
> shadows, cold cyan-blue color grade, left third of the frame in deep clean shadow for text
> overlay, no people, no text, no logos, no man-made objects, cinematic widescreen.

### Variação de estilo — filamentos de gelo (estilo da capa do BIP-110)

Alternativa ao gelo sólido macro: veias/teias de gelo luminosas contra preto, mais abstrata
e etérea. Mesmo uso (Gemini com referência anexada, ou Grok direto):

> Generate a photorealistic abstract macro image: delicate glowing filaments of frost and
> ice branching like veins or lightning across a pure black background, wispy translucent
> ice tendrils with fine sparkling frost particles, cold blue-white light tracing the
> branching structures, deep black negative space dominating the left third of the frame,
> cold cyan-blue color grade, ethereal and precise, no people, no text, no logos, no
> man-made objects. Widescreen 21:9, highest resolution.

Sujeitos alternativos: frost veins branching across black glass · ice crystal network
growing over dark water · frost tendrils radiating from the right edge like a slow
explosion · macro frost patterns crystallizing on a black window.

### Estilo livre (template pra estilos novos)

Troque só o trecho entre colchetes; o resto garante o brand:

> Generate a photorealistic image: [DESCREVA O ESTILO/CENA]. Cold cyan-blue color grade
> with near-black moody shadows, deep dark negative space dominating the left third of the
> frame as clean background for text, dramatic cold lighting, no people, no animals, no
> text, no logos, no man-made objects. Widescreen 21:9, highest resolution.

Gere 2–4 variações e escolha pela zona escura mais limpa atrás do texto.

⚠️ **Marca d'água do Gemini**: as saídas trazem um sparkle no canto inferior direito —
que pode ficar até ~10% pra dentro da borda — e são ~2.35:1 (mais largas que 24:11). A
receita de composição corta **12% da direita** antes do cover ancorado à esquerda: mata a
marca e preserva a zona escura do texto (validado na capa do artigo #4). Se ainda sobrar
resquício em alguma foto, cubra com patch escuro no SVG de composição. Baixe sempre a
foto na **maior resolução** que o gerador oferecer (evita upscale na composição).

### Receita de composição (foto + overlay → PNG publicado)

No scratchpad (NÃO commitar): `npm i @resvg/resvg-js sharp`, depois
`node compose.mjs <foto> <overlay.svg> <out.png>`:

```js
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

// uso: node compose.mjs <foto> <overlay.svg> <out.png> [trim=0.12] [glyphPng]
// glyphPng: passe assets/logomark-glyph.png (floco OFICIAL raster) — substitui o floco
// vetorial aproximado do overlay pela arte exata.
const [,, photo, overlaySvg, outPng, trimArg, glyphPng] = process.argv
const FONTS = '<raiz-do-repo>/node_modules/geist/dist/fonts'

// 1) foto -> trim da direita (default 12%; mata a marca d'agua do Gemini, que pode ficar
//    ate ~10% pra dentro da borda) -> cover 1852x849 ancorado a esquerda.
const trim = trimArg === undefined ? 0.12 : Number(trimArg)
const meta = await sharp(photo).metadata()
const base = await sharp(photo)
  .extract({ left: 0, top: 0, width: Math.round(meta.width * (1 - trim)), height: meta.height })
  .resize(1852, 849, { fit: 'cover', position: 'left' })
  .png().toBuffer()

// 2) SVG efemero de composicao: foto + overlay canonico (+ floco oficial se glyphPng)
let overlay = readFileSync(overlaySvg, 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '')
let glyphImg = ''
if (glyphPng) {
  overlay = overlay.replace(/<g transform="translate\(1673,701\)">[\s\S]*?<\/g>/, '')
  const gm = await sharp(glyphPng).metadata()
  const W = 122, H = Math.round(W * gm.height / gm.width)
  glyphImg = `<image x="${1673 - W / 2}" y="${701 - H / 2}" width="${W}" height="${H}" xlink:href="data:image/png;base64,${readFileSync(glyphPng).toString('base64')}"/>`
}
const svg = `<svg width="1852" height="849" viewBox="0 0 1852 849"
  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image x="0" y="0" width="1852" height="849" xlink:href="data:image/png;base64,${base.toString('base64')}"/>
  ${overlay}
  ${glyphImg}
</svg>`

// 3) rasteriza com Geist real
const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1852 }, font: {
  fontFiles: [
    `${FONTS}/geist-sans/Geist-Bold.ttf`, `${FONTS}/geist-sans/Geist-SemiBold.ttf`,
    `${FONTS}/geist-sans/Geist-Medium.ttf`, `${FONTS}/geist-sans/Geist-Regular.ttf`,
    `${FONTS}/geist-mono/GeistMono-SemiBold.ttf`, `${FONTS}/geist-mono/GeistMono-Bold.ttf`,
  ], loadSystemFonts: false, defaultFontFamily: 'Geist' } })
writeFileSync(outPng, r.render().asPng())
```

O `photo-overlay.svg` traz um **véu de legibilidade** (gradiente de opacidade sobre a coluna
do texto) num padrão suave (stops 0.55) que preserva a textura da foto. Ajuste pela foto:
zona escura já limpa → reduza/remova o `<rect>` do véu; foto ocupada atrás do texto → suba
até ~0.97 (apaga o fundo, como no banner do incidente de 2026-07-02). Regra prática: o
título precisa de contraste AA — na dúvida, o véu fica.

## Como usar — modo vetorial (alternativo)

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
| `photo-overlay.svg` | (Modo foto) overlay canônico transparente pra compor sobre foto. | "Why BIP-110 Doesn't Stop Alkanes" |

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
- **Logomark** (floco): centro em (1673,701), largura 122. **Arte OFICIAL (raster, usar no
  modo foto): `assets/logomark-glyph.png`** — extraída do asset do designer (2026-07-02),
  com alpha; a receita de composição a posiciona via o 5º argumento (`glyphPng`). Os
  templates vetoriais carregam uma APROXIMAÇÃO em 8 polygons (as diagonais do oficial são
  assimétricas — sem o vetor oficial, a aproximação fica até alguém extrair os paths).
  ⚠️ O `logomark.svg`/favicon do brand folder tem um desenho DIFERENTE (pétalas curvas
  conectadas) — não usar nas capas.
- **Fundo**: gradiente vertical de luminância `#0B0F14 → #04060A`.
- **Textura de gelo**: strokes `#A7C6DC` opacity 0.06–0.18 / width 1–3; facetas (polygons)
  opacity 0.03–0.06. Densidade à direita; a coluna de texto respira (nenhum stroke sob texto).
- **Artigo vs. não-artigo**: capa de **artigo** segue o padrão canônico à risca (eyebrow
  `ARTICLE #N:` + título nas escalas acima). Banner **avulso** (incidente, anúncio, social)
  mantém logotype, floco e paleta, mas o texto tem hierarquia/tamanhos livres (ex.: banner
  do incidente de 2026-07-02).

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
> Leia `docs/brand/banner-kit/BANNER-KIT.md`. Modo foto (principal) se eu te der uma foto;
> senão, modo vetorial. Inputs:
> - **Título**: <título exato do artigo>
> - **Número do artigo**: <N>
> - **Foto** (modo foto): <path da foto gerada no Gemini/Grok>
> - **Tipo** (modo vetorial): <default | data-heavy | conceito | opinião> → template pela tabela.
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
  (Exceção documentada: o SVG **efêmero de composição** do modo foto embute a foto via
  `<image>` base64 — ele nunca é commitado como template e só existe pra rasterizar.)
- [ ] Modo foto: foto atende os critérios de aceitação; véu ajustado pro contraste AA.
- [ ] Render final: PNG 1852×849, tipografia Geist real (não fallback), conferido visualmente.
- [ ] SVG-fonte salvo em `covers/<slug>.svg` (+ foto original em `covers/<slug>-photo.<ext>` no modo foto).
