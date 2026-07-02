# Article Banner Kit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents: usar **Sonnet 5** (`model: "sonnet"`).

**Goal:** Criar o design system de banners de artigo 24:11 do subfrost.io — `docs/brand/banner-kit/` com `BANNER-KIT.md`, 4 templates SVG canônicos e `covers/` — conforme a spec `docs/superpowers/specs/2026-07-02-article-banner-design-system-design.md`.

**Architecture:** Entrega **docs-only** (nenhum código do site muda). Cada template SVG é self-contained (logotype/logomark em paths inline, zero referência externa) e 100% vetorial. A verificação de cada task é um ciclo render→inspeção: rasterizar com `@resvg/resvg-js` + TTFs Geist do repo e conferir o PNG visualmente contra o checklist de QA. PNGs de render **não são commitados**.

**Tech Stack:** SVG puro; `@resvg/resvg-js` (instalado ad-hoc no scratchpad, NÃO vira dependência do repo); fontes `node_modules/geist/dist/fonts/` (já no repo).

## Global Constraints

- Branch: `feat/article-banner-kit` (já existe, contém a spec). **Nunca** push direto na `main`; entrega termina em PR.
- Canvas: `viewBox="0 0 1852 849"` (24:11), full-bleed, sem safe-zone.
- Paleta (únicas cores permitidas): Carbon `#212121` e derivados escuros de luminância; Frost `#E9F0F7`; Glacial `#A7C6DC`; Flare `#EC4521` (máx 1 elemento, só ênfase/alerta — **nenhum template de exemplo usa Flare**); título em `#F4F7FA`.
- Tipografia nos SVGs: `font-family="Geist"` / `"Geist Mono"` (resolvidas no render via fontFiles; sem `@font-face`, sem fonte embutida).
- SVGs self-contained: proibido `<image>`, `<script>`, `<foreignObject>`, `href="http`, `@import`, `url(` externo. Gradientes só de luminância (mesma matiz, opacidade/lightness variando) — nunca de cor.
- Valores canônicos (medidos por pixel da capa BIP-110 original, 1852×849):
  - Logotype "subfrost": `<g transform="translate(6.8,68.3) scale(0.188)">` + os 7 paths `fill="white"` de `public/brand/subfrost/Logos/svg/logotype/logotype_light.svg` (excluir o path do floco, `fill="#A7C6DC"`).
  - Logomark (floco): `<g transform="translate(1612,641) scale(0.381)">` + o path `fill="#A7C6DC"` do mesmo arquivo (o floco ocupa 0..320 no viewBox de origem → 122px na capa).
  - Eyebrow: Geist Mono 600, `font-size="33"`, `letter-spacing="7"`, fill `#A7C6DC`, `x="86"`, baseline `y="315"`, texto UPPERCASE terminando em `:`.
  - Título: Geist `font-weight="700"`, fill `#F4F7FA`, `x="84"`; 1 linha → `font-size="118"`; 2–3 linhas → `font-size="108"` com avanço de baseline de 124px; máx 3 linhas.
  - Fundo: `<rect>` full-canvas com gradiente vertical `#0B0F14` (topo) → `#04060A` (base).
  - Texturas de gelo: strokes/facetas `#A7C6DC`, strokes opacity 0.06–0.18 width 1–3, facetas (polygons) opacity 0.03–0.06. Densidade à direita, respiro à esquerda (zona de texto livre de textura).
- Harness de render (criado na Task 1, reusado por todas): `$SCRATCH/banner-kit/render.mjs`, onde `$SCRATCH = C:\Users\vdto8\AppData\Local\Temp\claude\C--Alkanes-Geral-Dev\a13c6d4b-469b-4425-82da-2ef75a761330\scratchpad` (em git-bash: `/c/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/a13c6d4b-469b-4425-82da-2ef75a761330/scratchpad`).
- Checagem estática (todas as tasks de template): `grep -nE '<image|<script|<foreignObject|href="http|@import|url\(' <arquivo>` deve retornar **vazio** (exit 1).
- Números de artigo/estatísticas nos exemplos são ilustrativos; títulos usam artigos reais quando existem.

## File Structure

```
docs/brand/banner-kit/
├── BANNER-KIT.md            # Task 5 — documento central do kit
├── templates/
│   ├── typographic.svg      # Task 1 — workhorse (com harness de render)
│   ├── stat-hero.svg        # Task 2 — data-driven
│   ├── concept.svg          # Task 3 — ilustração conceitual
│   └── quote.svg            # Task 4 — manifesto
└── covers/
    └── README.md            # Task 6 — convenção de arquivo de SVG-fonte
```

---

### Task 1: Harness de render + `templates/typographic.svg`

**Files:**
- Create: `$SCRATCH/banner-kit/render.mjs` (harness, NÃO commitado)
- Create: `docs/brand/banner-kit/templates/typographic.svg`

**Interfaces:**
- Produces: harness `node render.mjs <in.svg> <out.png>` (usado pelas Tasks 2, 3, 4, 6); estrutura canônica de template (fundo, logotype, eyebrow, título, floco) que as Tasks 2–4 replicam.

- [ ] **Step 1: Criar o harness de render no scratchpad**

```bash
mkdir -p "/c/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/a13c6d4b-469b-4425-82da-2ef75a761330/scratchpad/banner-kit" && cd "$_" && npm init -y >/dev/null && npm i @resvg/resvg-js --no-audit --no-fund
```

Criar `render.mjs` nessa pasta com este conteúdo exato:

```js
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const [,, inSvg, outPng] = process.argv
const FONTS = 'C:/Alkanes Geral Dev/subfrost.io/node_modules/geist/dist/fonts'
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

Obs: se `Geist-SemiBold.ttf` não existir no pacote, remover essa linha (conferir com `ls`).

- [ ] **Step 2: Criar `docs/brand/banner-kit/templates/typographic.svg`**

Conteúdo completo (os paths do wordmark e do floco vêm de `public/brand/subfrost/Logos/svg/logotype/logotype_light.svg` — copiar os `d="..."` na íntegra; abreviados aqui como comentário para não duplicar o arquivo de origem no plano):

```xml
<svg width="1852" height="849" viewBox="0 0 1852 849" xmlns="http://www.w3.org/2000/svg">
  <!-- ============ TEMPLATE: typographic (workhorse) ============
       Exemplo real: "Ethereum Was Supposed to Run on Bitcoin" (3 linhas).
       Troque: eyebrow, linhas do titulo. Regras no BANNER-KIT.md. -->

  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B0F14"/>
      <stop offset="1" stop-color="#04060A"/>
    </linearGradient>
  </defs>

  <!-- fundo -->
  <rect x="0" y="0" width="1852" height="849" fill="url(#bg)"/>

  <!-- textura de gelo (denso a direita, zona de texto limpa) -->
  <g stroke="#A7C6DC" fill="none" stroke-linecap="round">
    <path d="M1852 120 L1610 210 L1445 330 L1360 470" stroke-width="2.5" opacity="0.16"/>
    <path d="M1610 210 L1500 150 L1380 130" stroke-width="1.5" opacity="0.10"/>
    <path d="M1445 330 L1290 360 L1140 430" stroke-width="1.8" opacity="0.12"/>
    <path d="M1360 470 L1320 620 L1380 780 L1470 849" stroke-width="2.2" opacity="0.15"/>
    <path d="M1320 620 L1160 660 L1020 740" stroke-width="1.4" opacity="0.09"/>
    <path d="M1852 400 L1700 420 L1560 470 L1445 330" stroke-width="1.6" opacity="0.11"/>
    <path d="M1700 420 L1720 560 L1660 700" stroke-width="1.3" opacity="0.08"/>
    <path d="M1290 360 L1250 240 L1270 100 L1320 0" stroke-width="1.5" opacity="0.10"/>
    <path d="M1140 430 L1060 380 L980 400" stroke-width="1.1" opacity="0.07"/>
    <path d="M1020 740 L940 720 L870 760" stroke-width="1.0" opacity="0.06"/>
  </g>
  <g fill="#A7C6DC" stroke="none">
    <polygon points="1610,210 1500,150 1445,330" opacity="0.05"/>
    <polygon points="1445,330 1360,470 1560,470" opacity="0.04"/>
    <polygon points="1320,620 1160,660 1380,780" opacity="0.045"/>
  </g>

  <!-- logotype "subfrost" (canonico — nao mover) -->
  <g transform="translate(6.8,68.3) scale(0.188)">
    <!-- COLAR AQUI os 7 <path ... fill="white"/> de logotype_light.svg (todos MENOS o floco #A7C6DC) -->
  </g>

  <!-- eyebrow (canonico) -->
  <text x="86" y="315" font-family="Geist Mono" font-weight="600" font-size="33" letter-spacing="7" fill="#A7C6DC">ARTICLE #2:</text>

  <!-- titulo: 3 linhas, 108px, avanco 124 -->
  <text x="84" y="445" font-family="Geist" font-weight="700" font-size="108" fill="#F4F7FA">Ethereum Was</text>
  <text x="84" y="569" font-family="Geist" font-weight="700" font-size="108" fill="#F4F7FA">Supposed to Run</text>
  <text x="84" y="693" font-family="Geist" font-weight="700" font-size="108" fill="#F4F7FA">on Bitcoin</text>

  <!-- logomark floco (canonico — nao mover) -->
  <g transform="translate(1612,641) scale(0.381)">
    <!-- COLAR AQUI o <path ... fill="#A7C6DC"/> do floco de logotype_light.svg -->
  </g>
</svg>
```

Ao criar o arquivo real, substituir os dois comentários `COLAR AQUI` pelos paths completos copiados de `logotype_light.svg` (wordmark = os 7 paths `fill="white"`; floco = o único path `fill="#A7C6DC"`).

- [ ] **Step 3: Checagem estática (deve falhar em encontrar proibidos)**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && grep -nE '<image|<script|<foreignObject|href="http|@import|url\(' docs/brand/banner-kit/templates/typographic.svg; echo "exit=$?"
```

Expected: nenhuma linha; `exit=1`. (`url(#bg)` interno NÃO é match do padrão `url\(` externo? É match — por isso o padrão exige revisão manual: a ÚNICA ocorrência aceitável é `fill="url(#bg)"` referenciando o gradiente local `#bg`. Qualquer outra = reprovado.)

- [ ] **Step 4: Render + verificação de dimensões**

```bash
SCRATCH="/c/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/a13c6d4b-469b-4425-82da-2ef75a761330/scratchpad/banner-kit" && cd "$SCRATCH" && node render.mjs "/c/Alkanes Geral Dev/subfrost.io/docs/brand/banner-kit/templates/typographic.svg" out-typographic.png && node -e "require('C:/Alkanes Geral Dev/subfrost.io/node_modules/sharp')('out-typographic.png').metadata().then(m=>console.log(m.width+'x'+m.height))"
```

Expected: `rendered out-typographic.png` e `1852x849`.

- [ ] **Step 5: Inspeção visual (Read do PNG) contra o checklist**

Ler `$SCRATCH/banner-kit/out-typographic.png` e conferir TODOS:
1. Wordmark "subfrost" nítido no canto sup-esq, branco, sem distorção (compare mentalmente com subfrost.io).
2. Eyebrow em Glacial, mono, tracking largo, termina em `:`.
3. Título em Geist Bold branco, 3 linhas alinhadas em x=84, sem colidir com textura.
4. Floco inf-dir em Glacial, proporção correta (não oval).
5. Textura: densa à direita, esquerda respira; nenhum stroke cruza o texto; nada parece "neon".
6. Fundo escuro com gradiente sutil de luminância (não banding forte).

Se algum item falhar: ajustar o SVG (posições/opacidades/paths de textura) e repetir Steps 3–5 até passar.

- [ ] **Step 6: Commit**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && git add docs/brand/banner-kit/templates/typographic.svg && git commit -m "docs(banner-kit): template typographic (workhorse) 1852x849"
```

---

### Task 2: `templates/stat-hero.svg`

**Files:**
- Create: `docs/brand/banner-kit/templates/stat-hero.svg`

**Interfaces:**
- Consumes: harness `node render.mjs <in.svg> <out.png>` da Task 1; paths de wordmark/floco de `logotype_light.svg` (mesma extração da Task 1).

- [ ] **Step 1: Criar `docs/brand/banner-kit/templates/stat-hero.svg`**

Mesma estrutura canônica (fundo, logotype em `translate(6.8,68.3) scale(0.188)`, eyebrow em x=86/y=315, floco em `translate(1612,641) scale(0.381)` — copiar os paths reais como na Task 1). O que muda — protagonista de dado à direita, título subordinado à esquerda:

```xml
  <!-- eyebrow com sufixo contextual -->
  <text x="86" y="315" font-family="Geist Mono" font-weight="600" font-size="33" letter-spacing="7" fill="#A7C6DC">ARTICLE #4: BY THE NUMBERS</text>

  <!-- titulo subordinado (2 linhas, menor) -->
  <text x="84" y="470" font-family="Geist" font-weight="700" font-size="84" fill="#F4F7FA">Alkanes by</text>
  <text x="84" y="566" font-family="Geist" font-weight="700" font-size="84" fill="#F4F7FA">the Numbers</text>

  <!-- protagonista: numero gigante em Geist Mono -->
  <text x="1010" y="520" font-family="Geist Mono" font-weight="700" font-size="230" fill="#A7C6DC">1.2M</text>
  <text x="1016" y="580" font-family="Geist Mono" font-weight="600" font-size="30" letter-spacing="6" fill="#A7C6DC" opacity="0.75">OP_RETURN MESSAGES DECODED</text>

  <!-- mini-vis: barras abstratas (nao precisam ser dados reais) -->
  <g fill="#A7C6DC">
    <rect x="1016" y="668" width="34" height="60"  opacity="0.25"/>
    <rect x="1064" y="640" width="34" height="88"  opacity="0.35"/>
    <rect x="1112" y="652" width="34" height="76"  opacity="0.30"/>
    <rect x="1160" y="600" width="34" height="128" opacity="0.50"/>
    <rect x="1208" y="612" width="34" height="116" opacity="0.45"/>
    <rect x="1256" y="556" width="34" height="172" opacity="0.65"/>
    <rect x="1304" y="580" width="34" height="148" opacity="0.55"/>
    <rect x="1352" y="520" width="34" height="208" opacity="0.85"/>
  </g>
```

Textura de gelo: versão REDUZIDA da Task 1 (só 4–5 strokes no quadrante superior direito, opacity ≤0.10), pra não competir com o número. Exemplo:

```xml
  <g stroke="#A7C6DC" fill="none" stroke-linecap="round">
    <path d="M1852 90 L1660 150 L1520 240" stroke-width="1.8" opacity="0.10"/>
    <path d="M1660 150 L1600 80 L1560 0" stroke-width="1.2" opacity="0.07"/>
    <path d="M1520 240 L1420 220 L1330 250" stroke-width="1.3" opacity="0.08"/>
    <path d="M1852 320 L1740 300 L1640 330" stroke-width="1.1" opacity="0.06"/>
  </g>
```

- [ ] **Step 2: Checagem estática**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && grep -nE '<image|<script|<foreignObject|href="http|@import|url\(' docs/brand/banner-kit/templates/stat-hero.svg; echo "exit=$?"
```

Expected: só a ocorrência `fill="url(#bg)"` (gradiente local); nada mais.

- [ ] **Step 3: Render + dimensões**

```bash
SCRATCH="/c/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/a13c6d4b-469b-4425-82da-2ef75a761330/scratchpad/banner-kit" && cd "$SCRATCH" && node render.mjs "/c/Alkanes Geral Dev/subfrost.io/docs/brand/banner-kit/templates/stat-hero.svg" out-stat-hero.png && node -e "require('C:/Alkanes Geral Dev/subfrost.io/node_modules/sharp')('out-stat-hero.png').metadata().then(m=>console.log(m.width+'x'+m.height))"
```

Expected: `1852x849`.

- [ ] **Step 4: Inspeção visual (Read do PNG)**

Checklist da Task 1 (itens 1, 2, 4, 6) MAIS:
- O número "1.2M" é o elemento dominante (maior que o título) e não colide com o floco (floco em x1612–1734/y641–761; barras terminam em x1386).
- Barras legíveis mas discretas (nenhuma acima de opacity 0.85).
- Título 2 linhas não invade a coluna do número (linhas terminam antes de x~960).

Ajustar e repetir Steps 2–4 se falhar.

- [ ] **Step 5: Commit**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && git add docs/brand/banner-kit/templates/stat-hero.svg && git commit -m "docs(banner-kit): template stat-hero (data-driven)"
```

---

### Task 3: `templates/concept.svg`

**Files:**
- Create: `docs/brand/banner-kit/templates/concept.svg`

**Interfaces:**
- Consumes: harness da Task 1; paths de wordmark/floco (mesma extração).

- [ ] **Step 1: Criar `docs/brand/banner-kit/templates/concept.svg`**

Estrutura canônica (fundo/logotype/eyebrow/floco idênticos, paths reais colados). Exemplo real: BIP-110. Título na metade esquerda; metade direita = arte conceitual. A arte de exemplo: um **bloco hexagonal facetado** (o protocolo) cercado por rachaduras que **param na borda** (a proposta que não o atinge):

```xml
  <text x="86" y="315" font-family="Geist Mono" font-weight="600" font-size="33" letter-spacing="7" fill="#A7C6DC">ARTICLE #3:</text>

  <text x="84" y="445" font-family="Geist" font-weight="700" font-size="108" fill="#F4F7FA">Why BIP-110</text>
  <text x="84" y="569" font-family="Geist" font-weight="700" font-size="108" fill="#F4F7FA">Doesn&#39;t Stop</text>
  <text x="84" y="693" font-family="Geist" font-weight="700" font-size="108" fill="#F4F7FA">Alkanes</text>

  <!-- arte conceitual: hexagono facetado centrado em (1390,420), raio 250 -->
  <g stroke="#A7C6DC" fill="none" stroke-linejoin="round">
    <polygon points="1390,170 1607,295 1607,545 1390,670 1173,545 1173,295" stroke-width="3" opacity="0.55"/>
    <!-- facetas internas -->
    <path d="M1390 170 L1390 420 L1173 295 M1390 420 L1607 295 M1390 420 L1607 545 M1390 420 L1390 670 M1390 420 L1173 545" stroke-width="1.6" opacity="0.28"/>
    <!-- preenchimentos de faceta -->
  </g>
  <g fill="#A7C6DC" stroke="none">
    <polygon points="1390,170 1607,295 1390,420" opacity="0.06"/>
    <polygon points="1390,420 1607,545 1390,670" opacity="0.045"/>
    <polygon points="1173,295 1390,420 1173,545" opacity="0.035"/>
  </g>
  <!-- rachaduras externas que PARAM na borda do hexagono -->
  <g stroke="#A7C6DC" fill="none" stroke-linecap="round">
    <path d="M1852 120 L1720 220 L1607 295" stroke-width="2.2" opacity="0.16"/>
    <path d="M1852 640 L1730 600 L1607 545" stroke-width="1.8" opacity="0.13"/>
    <path d="M1390 0 L1392 90 L1390 170" stroke-width="1.6" opacity="0.11"/>
    <path d="M1060 160 L1120 240 L1173 295" stroke-width="1.5" opacity="0.10"/>
    <path d="M1080 700 L1130 610 L1173 545" stroke-width="1.4" opacity="0.09"/>
  </g>
```

Obs: floco (x1612–1734, y641–761) fica abaixo-direita do hexágono (que termina em y670/x1607) — sem colisão, mas conferir no render que a rachadura `1852 640 → 1607 545` não atravessa o floco (passa acima; se encostar, subir o endpoint).

- [ ] **Step 2: Checagem estática**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && grep -nE '<image|<script|<foreignObject|href="http|@import|url\(' docs/brand/banner-kit/templates/concept.svg; echo "exit=$?"
```

Expected: só `fill="url(#bg)"`.

- [ ] **Step 3: Render + dimensões**

```bash
SCRATCH="/c/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/a13c6d4b-469b-4425-82da-2ef75a761330/scratchpad/banner-kit" && cd "$SCRATCH" && node render.mjs "/c/Alkanes Geral Dev/subfrost.io/docs/brand/banner-kit/templates/concept.svg" out-concept.png && node -e "require('C:/Alkanes Geral Dev/subfrost.io/node_modules/sharp')('out-concept.png').metadata().then(m=>console.log(m.width+'x'+m.height))"
```

Expected: `1852x849`.

- [ ] **Step 4: Inspeção visual (Read do PNG)**

Checklist da Task 1 (itens 1, 2, 4, 6) MAIS:
- O hexágono lê como objeto sólido facetado (não wireframe caótico); conceito "rachaduras param na borda" perceptível.
- Título (3 linhas até x~1010) não invade a arte (hexágono começa em x1173).
- Nada de preenchimento sólido grande, sem figuras humanas/mascotes.

Ajustar e repetir se falhar.

- [ ] **Step 5: Commit**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && git add docs/brand/banner-kit/templates/concept.svg && git commit -m "docs(banner-kit): template concept (ilustracao conceitual)"
```

---

### Task 4: `templates/quote.svg`

**Files:**
- Create: `docs/brand/banner-kit/templates/quote.svg`

**Interfaces:**
- Consumes: harness da Task 1; paths de wordmark/floco (mesma extração).

- [ ] **Step 1: Criar `docs/brand/banner-kit/templates/quote.svg`**

Estrutura canônica (fundo/logotype/floco idênticos). Tipografia centralizada; eyebrow também centralizado neste template (única exceção posicional, documentada no BANNER-KIT.md). Frase de exemplo ilustrativa (marcar pro Vitor validar/trocar na revisão):

```xml
  <!-- aspas decorativas -->
  <text x="180" y="400" font-family="Geist" font-weight="700" font-size="320" fill="#A7C6DC" opacity="0.22">&#8220;</text>

  <!-- eyebrow centralizado -->
  <text x="926" y="270" text-anchor="middle" font-family="Geist Mono" font-weight="600" font-size="33" letter-spacing="7" fill="#A7C6DC">ARTICLE #5: PERSPECTIVE</text>

  <!-- frase (2 linhas, centrada) -->
  <text x="926" y="430" text-anchor="middle" font-family="Geist" font-weight="600" font-size="76" fill="#F4F7FA">Bitcoin is the settlement layer.</text>
  <text x="926" y="522" text-anchor="middle" font-family="Geist" font-weight="600" font-size="76" fill="#F4F7FA">Everything else is negotiable.</text>

  <!-- atribuicao -->
  <text x="926" y="620" text-anchor="middle" font-family="Geist Mono" font-weight="600" font-size="30" letter-spacing="6" fill="#A7C6DC" opacity="0.8">&#8212; SUBFROST</text>
```

Textura mínima — 3 strokes nos cantos (longe do centro):

```xml
  <g stroke="#A7C6DC" fill="none" stroke-linecap="round">
    <path d="M1852 80 L1700 130 L1590 200" stroke-width="1.6" opacity="0.09"/>
    <path d="M0 720 L140 680 L260 700" stroke-width="1.4" opacity="0.08"/>
    <path d="M1780 849 L1750 760 L1790 680" stroke-width="1.2" opacity="0.07"/>
  </g>
```

- [ ] **Step 2: Checagem estática**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && grep -nE '<image|<script|<foreignObject|href="http|@import|url\(' docs/brand/banner-kit/templates/quote.svg; echo "exit=$?"
```

Expected: só `fill="url(#bg)"`.

- [ ] **Step 3: Render + dimensões**

```bash
SCRATCH="/c/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/a13c6d4b-469b-4425-82da-2ef75a761330/scratchpad/banner-kit" && cd "$SCRATCH" && node render.mjs "/c/Alkanes Geral Dev/subfrost.io/docs/brand/banner-kit/templates/quote.svg" out-quote.png && node -e "require('C:/Alkanes Geral Dev/subfrost.io/node_modules/sharp')('out-quote.png').metadata().then(m=>console.log(m.width+'x'+m.height))"
```

Expected: `1852x849`.

- [ ] **Step 4: Inspeção visual (Read do PNG)**

Checklist da Task 1 (itens 1, 4, 6) MAIS:
- Frase centrada opticamente (não colide com aspas decorativas nem com o floco).
- Hierarquia: frase >> eyebrow ≈ atribuição.
- Quase só tipografia — se a textura chamar atenção, reduzir opacidade.

Ajustar e repetir se falhar.

- [ ] **Step 5: Commit**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && git add docs/brand/banner-kit/templates/quote.svg && git commit -m "docs(banner-kit): template quote (manifesto)"
```

---

### Task 5: `BANNER-KIT.md`

**Files:**
- Create: `docs/brand/banner-kit/BANNER-KIT.md`

**Interfaces:**
- Consumes: os 4 templates (paths finais) e o harness (o código do render vira a "receita" documentada).
- Produces: o documento que o prompt-kit referencia; `covers/` convention usada pela Task 6.

- [ ] **Step 1: Criar `docs/brand/banner-kit/BANNER-KIT.md`**

Conteúdo completo (se os valores canônicos tiverem sido ajustados nas Tasks 1–4 durante a inspeção visual, usar os valores FINAIS dos templates — os templates são a fonte da verdade):

````markdown
# SUBFROST Article Banner Kit

Design system para capas de artigo 24:11 (1852×849) do subfrost.io. Fonte da verdade do brand:
`app/brand/page.tsx` + `public/brand/subfrost/`. Fonte da verdade da anatomia: os templates em
`templates/` deste kit.

## Como usar (fluxo completo)

1. Escolha o template pelo tipo de artigo (tabela abaixo).
2. Copie o SVG do template e substitua os textos (regras de escala abaixo).
3. Gere/adapte a arte variável (só no concept; nos outros, ajuste fino da textura é opcional).
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
  (`ARTICLE #12: BY THE NUMBERS`).
- **Título**: Geist 700, `#F4F7FA`, x=84. Escala por comprimento: 1 linha → 118px;
  2–3 linhas → 108px, avanço de baseline 124px. MÁXIMO 3 linhas, quebradas por sentido.
  (No stat-hero o título é subordinado: 84px, avanço 96px, máx 2 linhas.)
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
const r = new Resvg(readFileSync(inSvg, 'utf8'), {
  fitTo: { mode: 'width', value: 1852 },
  font: {
    fontFiles: [
      `${FONTS}/geist-sans/Geist-Bold.ttf`,
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
```

Gotchas conhecidos: `feGaussianBlur` no resvg deixa retângulos escuros translúcidos/esverdeados
(linearRGB) — não usar; para véus/scrims use `linearGradient` de opacidade. O pacote `geist`
do npm traz TTFs (além de woff2) — use os TTFs.

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

- [ ] Só cores da paleta (Carbon/derivados, Frost, Glacial, `#F4F7FA`; Flare no máx 1 elemento).
- [ ] Gradientes só de luminância; zero neon/blob/bokeh.
- [ ] Máx 3 linhas de título; quebras por sentido; nada de hífen.
- [ ] Logotype e floco nas posições canônicas, intocados.
- [ ] Nenhum stroke/faceta sob o texto; coluna de texto respira.
- [ ] Contraste título/fundo ≥ WCAG AA (branco sobre quase-preto passa folgado).
- [ ] SVG self-contained: sem `<image>`, `<script>`, `<foreignObject>`, refs externas.
- [ ] Render final: PNG 1852×849, tipografia Geist real (não fallback), conferido visualmente.
- [ ] SVG-fonte salvo em `covers/<slug>.svg`.
````

- [ ] **Step 2: Verificar a receita documentada contra o harness real**

Comparar o bloco de código do `BANNER-KIT.md` com `$SCRATCH/banner-kit/render.mjs` (devem ser equivalentes; o doc usa `<raiz-do-repo>` como placeholder de path — é o ÚNICO placeholder permitido, pois o path absoluto varia por máquina). Conferir também que os valores da anatomia batem com os SVGs finais:

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && grep -o 'translate(6.8,68.3) scale(0.188)' docs/brand/banner-kit/templates/*.svg | sort -u && grep -o 'translate(1612,641) scale(0.381)' docs/brand/banner-kit/templates/*.svg | sort -u
```

Expected: as 4 ocorrências de cada transform (uma por template). Se algum template tiver valores ajustados, atualizar o BANNER-KIT.md pra bater.

- [ ] **Step 3: Commit**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && git add docs/brand/banner-kit/BANNER-KIT.md && git commit -m "docs(banner-kit): BANNER-KIT.md (brand sheet, anatomia, prompt, receita, QA)"
```

---

### Task 6: `covers/README.md` + galeria de aprovação + PR

**Files:**
- Create: `docs/brand/banner-kit/covers/README.md`

**Interfaces:**
- Consumes: harness da Task 1; os 4 templates; `BANNER-KIT.md`.

- [ ] **Step 1: Criar `docs/brand/banner-kit/covers/README.md`**

```markdown
# covers/

SVG-fonte de cada capa publicada, nomeado pelo slug do artigo
(`<slug>.svg`, ex.: `why-bip-110-doesnt-stop-alkanes.svg`).

O PNG publicado NÃO fica aqui — ele é rasterizado da fonte (receita no
`../BANNER-KIT.md`) e sobe pelo editor `/admin`. Este diretório existe para
edição futura sem retrabalho: alterou o artigo, edita o SVG-fonte,
re-rasteriza, re-sobe.
```

- [ ] **Step 2: Render final dos 4 templates (galeria de aprovação)**

```bash
SCRATCH="/c/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/a13c6d4b-469b-4425-82da-2ef75a761330/scratchpad/banner-kit" && cd "$SCRATCH" && for t in typographic stat-hero concept quote; do node render.mjs "/c/Alkanes Geral Dev/subfrost.io/docs/brand/banner-kit/templates/$t.svg" "out-$t.png"; done && ls -la out-*.png
```

Expected: 4 PNGs. Ler os 4 (Read) e apresentar ao Vitor no chat como galeria, lado a lado com a descrição de cada template. **GATE: aguardar aprovação visual do Vitor.** Se pedir ajustes: ajustar o(s) template(s), re-render, re-apresentar; commitar ajustes com `docs(banner-kit): ajustes visuais pós-review`.

- [ ] **Step 3: Commit + push + PR**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && git add docs/brand/banner-kit/covers/README.md && git commit -m "docs(banner-kit): covers/ (convencao de SVG-fonte por slug)" && git push -u origin feat/article-banner-kit
```

```bash
cd "/c/Alkanes Geral Dev/subfrost.io" && gh pr create --title "docs: article banner kit (design system de capas 24:11)" --body "## Summary
- Design system de banners de artigo 24:11 (1852x849): docs/brand/banner-kit/
- BANNER-KIT.md (brand sheet, anatomia canonica, prompt-kit, receita SVG->PNG, QA checklist)
- 4 templates SVG canonicos (typographic / stat-hero / concept / quote), 100% vetoriais e self-contained
- covers/ para SVG-fonte por artigo
- Spec: docs/superpowers/specs/2026-07-02-article-banner-design-system-design.md

Docs-only: zero mudanca de codigo/schema/build.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: URL do PR. Reportar ao Vitor (merge é dele).

---

## Self-Review (executado na escrita do plano)

1. **Spec coverage**: §5.1 estrutura → Tasks 1–6; §5.2 anatomia → Global Constraints + Task 1; §5.3 os 4 templates → Tasks 1–4; §5.4 receita/publicação → harness Task 1 + doc Task 5; §5.5 prompt-kit → Task 5; §6 validação (4 exemplos + receita ponta-a-ponta + PR) → Steps de render por task + Task 6; §7 fora de escopo respeitado (nenhum script commitado — harness fica no scratchpad). R1–R6 cobertos.
2. **Placeholders**: os comentários `COLAR AQUI` nas tasks de template são instruções de cópia com fonte exata (`logotype_light.svg`) — não são TBDs; `<raiz-do-repo>` no doc da receita é o único placeholder intencional (path varia por máquina), justificado na Task 5 Step 2.
3. **Type consistency**: transforms canônicos (`translate(6.8,68.3) scale(0.188)`, `translate(1612,641) scale(0.381)`), medidas de eyebrow/título e o contrato do harness (`node render.mjs <in> <out>`) idênticos em todas as tasks e no BANNER-KIT.md.
