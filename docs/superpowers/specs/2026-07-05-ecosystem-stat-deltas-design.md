# Spec — Ecosystem stat cards: indicador de tendência (setinha ↑/↓ + %)

**Data:** 2026-07-05 · **Aprovado por:** Vitor (brainstorm) · **Repo:** `C:\Alkanes Geral Dev\subfrost.io` · **Base:** stat hero LIVE (PR #189) + gráfico v2C (#190)

## Problema

Os stat cards do profile `/ecosystem/<slug>` (holders, supply, preço, jackpot…) mostram só o valor atual. Vitor quer um sinal de **tendência** — uma setinha ↑/↓ com % — pra dar mais informação sem poluir. (Sparkline foi descartado nesta rodada; pode voltar quando houver mais histórico.)

## Decisões (brainstorm 2026-07-05)

1. **Fonte = snapshots horários** (`EcosystemStatSnapshot`). O `priceUsd` já está no snapshot, então TODAS as métricas comparam pela mesma fonte e mesmo intervalo. As candles (90d) seguem só pro gráfico de preço.
2. **Período = 24h** — o snapshot mais recente cujo `takenAt <= (current.takenAt − 24h)`. Enquanto não houver 24h de histórico (cron começou 2026-07-05), **fallback pro snapshot mais antigo disponível**, com o intervalo real no rótulo (ex. `12h`).
3. **Métricas com setinha = toda numérica comparável**: genéricas `holders`, `supply`, `priceUsd` (as que o StatHero renderiza) + custom cujo `value` parseia como número puro (jackpot, fee vault). Compostas tipo tickets `"42 / 1337"` (→ `Number()` = `NaN`) são puladas automaticamente. **Sem baseline comparável (base ausente/zero/NaN) → sem setinha** (card fica como hoje, sem placeholder).
4. **UI**: linha pequena abaixo do valor — seta `↑` verde / `↓` vermelho / `–` neutro (flat) + `X.X%` (magnitude; a seta indica direção) + rótulo do período. Tokens `--ed-*`, `tabular-nums`.
5. **ZH**: o rótulo do período (`24h`/`12h`) é neutro de idioma — sem tradução necessária na v1.

## Arquitetura (delta no data layer + helper puro)

Sem mudança de schema, sem mexer no cron/coletor. Três peças:

### 1. Helper puro — `lib/ecosystem/stat-deltas.ts` (novo)

```ts
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

export type StatDirection = "up" | "down" | "flat"
export interface StatDelta { deltaPct: number; direction: StatDirection } // deltaPct = fração (0.023 = +2.3%)

/**
 * Delta por card entre o snapshot atual e o baseline, keyed pela MESMA chave `k`
 * que o StatHero usa: "generic-holders" | "generic-supply" | "generic-price" | "custom-<key>".
 * Só inclui chaves onde ambos os valores são numéricos finitos e a base != 0.
 */
export function computeStatDeltas(
  current: ProjectStats,
  baseline: ProjectStats | null,
  mainAlkaneId: string | null,
): Record<string, StatDelta>
```

Regras:
- Se `baseline` for `null` → retorna `{}`.
- Genéricas (só quando `mainAlkaneId` existe e há registro em ambos): `generic-holders` (campo `holders`), `generic-supply` (`Number(supply)`), `generic-price` (`priceUsd`).
- Custom: pra cada `current.custom[i]`, procura no `baseline.custom` a MESMA `key`; compara `Number(cur.value)` vs `Number(base.value)`; chave de saída `custom-<key>`.
- Pra cada par `(cur, base)`: se `cur`/`base` não forem finitos ou `base === 0` → pula. Senão `deltaPct = (cur − base) / base`; `direction = cur > base ? "up" : cur < base ? "down" : "flat"`.

### 2. Data layer — `getEcosystemStatsWithDelta(slug)` em `lib/ecosystem/public.ts`

```ts
export interface StatsWithDelta {
  current: ProjectStats
  baseline: ProjectStats | null
  periodLabel: string | null // "24h" | "12h" | null (null quando não há baseline)
}
export async function getEcosystemStatsWithDelta(slug: string): Promise<StatsWithDelta | null>
```

- `projectId` por slug (published) → `null` se não achar.
- `current` = snapshot mais recente (`takenAt desc`). Sem snapshot → `null`.
- `baseline` = snapshot mais recente com `takenAt <= current.takenAt − 24h`. Se nenhum, o **mais antigo** disponível (`takenAt asc`) que **não seja** o current; se só há 1 snapshot → `null`.
- `periodLabel`: `null` se sem baseline; senão `hours = round((current.takenAt − baseline.takenAt)/3_600_000)`; `hours >= 23 → "24h"`, senão `` `${hours}h` `` (bootstrap). (Usa `current.takenAt` como referência, não `Date.now()` — determinístico.)
- Nunca lança (try/catch → `null`); o hero é decorativo.

### 3. UI — `components/ecosystem/StatHero.tsx` (server, edita)

- Props novas (opcionais): `baseline?: ProjectStats | null`, `periodLabel?: string | null`.
- Após montar os cards, `const deltas = computeStatDeltas(stats, baseline ?? null, mainAlkaneId)`.
- Cada card: se `deltas[c.k]` existir, renderiza sob o valor uma linha:
  - seta: `up` → `↑` cor `#3fb950` (verde); `down` → `↓` cor `#f85149` (vermelho); `flat` → `–` cor `var(--ed-muted)`.
  - `${(Math.abs(deltaPct)*100).toFixed(1)}%` + ` ` + `periodLabel` (mono pequeno, `--ed-muted`).
  - `tabular-nums`; `aria-label` tipo `"up 2.3% over 24h"` pra acessibilidade.
- Sem `deltas[c.k]` → card inalterado (nenhuma linha extra). Cores verde/vermelho são fixas (semânticas), iguais nos dois temas.

### 4. Página — `app/ecosystem/[slug]/page.tsx`

- Troca `getLatestEcosystemStats(slug)` por `getEcosystemStatsWithDelta(slug)` no `Promise.all` (mantém `.catch(() => null)`).
- `stats={s?.current ?? null}`, `baseline={s?.baseline ?? null}`, `periodLabel={s?.periodLabel ?? null}`.
- `getLatestEcosystemStats` fica no arquivo se outro caller usar; se só a página usava, pode ser removido (checar no plano).

## Testes (`tests/ecosystem/`)

- **`stat-deltas.test.ts`** (novo): subiu (up + pct certo), caiu (down), flat (igual), base zero → pulado, valor não-numérico custom (`"42 / 1337"`) → pulado, baseline null → `{}`, custom key ausente no baseline → pulado, supply string comparado como número.
- **`public.test.ts`** (estende): `getEcosystemStatsWithDelta` — pega o par (current + ~24h); fallback pro mais antigo quando <24h de histórico (periodLabel = intervalo real); 1 snapshot só → baseline null/periodLabel null; slug inexistente → null. (mock prisma local, padrão do arquivo.)
- **`stat-hero.test.tsx`** (estende): renderiza ↑ verde com % + período quando há delta up; ↓ quando down; nenhuma linha de delta quando baseline ausente; card não-numérico (tickets) sem setinha mesmo com baseline.

## Constraints

PR sempre; worktree novo (`wt-eco-deltas`) com install real (Turbopack×junction); `git add` nominal; path `'app/ecosystem/[slug]/page.tsx'` entre aspas; sem deps novas; **sem migração de schema**; lint gate real (0 errors novos); soft-launch intacto; tokens `--ed-*` (exceto verde/vermelho semânticos fixos). Gates: `npx vitest run tests/ecosystem/` · `tsc --noEmit` · `pnpm lint` · `pnpm build`.

## Verificação prod

Após deploy: `/ecosystem/diesel` e `/ecosystem/fire` mostram setinha+% em holders/preço (período `12h` no bootstrap → `24h` quando o histórico passar de 24h); `/ecosystem/arbuzino` jackpot com setinha e tickets SEM setinha; card sem baseline (projeto novo) sem linha extra.

## Fora de escopo

Sparkline (rodada futura, quando houver histórico); delta em marketcap/volume (StatHero não os renderiza hoje); período configurável pelo usuário; tradução ZH do rótulo.
