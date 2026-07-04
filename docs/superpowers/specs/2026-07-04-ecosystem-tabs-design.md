# Spec-lite — /ecosystem: abas Apps | Contracts (design aprovado pelo Vitor, 2026-07-04)

## Objetivo
Separar o diretório público /ecosystem por TIPO (App | Contract), ortogonal às categorias.
Contratos ganham identidade on-chain (alkaneId) exibida como badge clicável pro explorer.

## Schema (aditivo, zero migration destrutiva)
- `EcosystemProject.kind  String @default("App")` — valores válidos: `App` | `Contract`.
- `EcosystemProject.alkaneId String?` — formato `block:tx` (ex.: `2:0`); só relevante p/ Contract.
- Validação de kind + formato de alkaneId (`/^\d+:\d+$/`) em `lib/ecosystem/constants.ts`
  (padrão das ECOSYSTEM_CATEGORIES/STATUSES existentes) e aplicada na server action de save.

## Admin (/admin/ecosystem — EcosystemAdmin.tsx)
- Select `Kind` (App | Contract) no ProjectForm.
- Campo `Alkane ID` (placeholder `block:tx`, ex. `2:0`) — visível sempre, mas validado
  só quando preenchido; obrigatório NÃO é (contrato pode entrar sem id conhecido).
- Server action `saveEcosystemProject` aceita/valida os 2 campos novos.

## Público (/ecosystem — EcosystemDirectory.tsx)
- Abas "Apps | Contracts" ACIMA dos chips de categoria (EN + ZH; i18n via dicionário
  existente do diretório). Categoria continua filtro ortogonal dentro da aba.
- Card de Contract: badge mono do alkaneId linkando pro explorer.
  URL do explorer (VERIFICADA 2026-07-04 via curl): https://ordiscan.com/alkane/<nome>/<block:tx>
  — o segmento <nome> é vanity (/alkane/X/2:0 → 200; /alkane/2:0 sozinho → 404). Usar
  encodeURIComponent(project.name) no segmento de nome.
- Tema: fundos de card/chip/aba SEMPRE var(--ed-*) (tokens flipam no dark) — NUNCA bg-white
  literal com texto em token (gotcha #179).
- Ecosystem segue FORA de nav/sitemap (soft-launch); tests/ecosystem/integration.test.ts trava isso.

## Seed de contratos (script in-pod, upsert-por-slug, published:true, kind:Contract)
| slug | name | alkaneId | nota |
|---|---|---|---|
| diesel | DIESEL | 2:0 | genesis alkane; mint pareado c/ fee de minerador (≤50% block reward) |
| frbtc | frBTC | 32:0 | BTC wrapped do SUBFROST (signer group) |
| fire | FIRE | 2:77623 | token FIRE (subfrost-alkanes) |
| busd | bUSD | 2:56801 | stablecoin (8 decimals) |
| amm-factory | AMM Factory (synth-pool) | 4:65522 | factory dos pools AMM |
| free-mint-factory | Free Mint Factory | PESQUISAR | confirmar id real na web/Vitor antes de seedar |
| wunsch-vault | wunsch vault | 4:777 | vault do wunsch |
| arbuz | ARBUZ (Magic Arbuz) | 2:25349 | token do Arbuzino |
- Descrições EN+ZH curtas (1-2 frases), estilo dos 20 projetos já seedados.
- Categorias: usar as existentes (não criar categoria nova sem GO).
- Vitor pode trazer lista extra da comunidade — seed é upsert, idempotente.

## Testes
- constants: kind válido/ inválido; alkaneId regex.
- actions: save com kind/alkaneId persiste; rejeita kind desconhecido e alkaneId malformado.
- directory (RTL): abas renderizam EN+ZH; filtro por aba funciona; badge do alkaneId
  aparece só em Contract e linka pro explorer; categoria ortogonal dentro da aba.
- admin (RTL): select kind + campo alkaneId presentes e submetidos no save.
- integration.test.ts: continua travando nav/sitemap escondidos (não inverter).

## Gates
`pnpm tsc --noEmit` limpo · `npx vitest run tests/ecosystem/` verde · suíte paridade
(4 allow-listed + flakes de rede) · `next build` compila · PR → merge → bump quoted
full-SHA → Flux → seed in-pod → conferir /ecosystem prod EN+ZH.

## Fora de escopo (roadmap com GO futuro)
Métricas holders/supply via get-alkane-details + cron; vista tabela rankeada; sparklines;
detail pages; submit form.
