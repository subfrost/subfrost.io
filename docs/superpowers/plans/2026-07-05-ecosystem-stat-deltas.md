# Ecosystem Stat Deltas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setinha de tendência (↑/↓ + %) nos stat cards do `/ecosystem/<slug>`, comparando o snapshot atual com o de ~24h atrás.

**Architecture:** Delta calculado server-side no data layer. Helper puro (`computeStatDeltas` + `computePeriodLabel`) sem I/O; `getEcosystemStatsWithDelta(slug)` busca o par de snapshots (current + ~24h, com fallback); o `StatHero` (server component) renderiza a setinha por card. Sem mudança de schema, sem tocar no cron/coletor.

**Tech Stack:** Next 16 (App Router, `force-dynamic`), Prisma (`EcosystemStatSnapshot`), vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-05-ecosystem-stat-deltas-design.md`

## Global Constraints

- Branch `feat/ecosystem-stat-deltas` em worktree novo `../wt-eco-deltas`; **install REAL** (`pnpm install --prefer-offline` + `pnpm prisma generate`) — Turbopack rejeita junction de node_modules no build.
- `git add` **NOMINAL** (nunca `-A`); path `'app/ecosystem/[slug]/page.tsx'` **sempre entre aspas simples** no bash.
- Sem deps novas; **sem mudança de schema Prisma**; jsdom NÃO bumpar ≥27.
- **Lint é gate real** (`pnpm lint` = `eslint .`; base 0 errors/62 warnings — não introduzir NENHUM error novo).
- Soft-launch intacto: NÃO tocar em nav/sitemap.
- Chaves dos cards (verbatim, do StatHero): `generic-holders`, `generic-supply`, `generic-price`, `custom-<key>`.
- Cores da seta (semânticas, fixas nos dois temas): up `#3fb950`, down `#f85149`, flat `var(--ed-muted)`. Período: `24h` quando ≥23h, senão `<n>h`.
- Página segue `force-dynamic`; stats vêm do banco (nunca RPC no request).
- Gates finais: `npx vitest run tests/ecosystem/` verde · `npx tsc --noEmit` · `pnpm lint` (0 errors) · `pnpm build` ("Compiled successfully" = ok; EINVAL standalone no Windows é ruído).

---

### Task 0: Worktree + install real (setup)

**Files:** nenhum (setup)

- [ ] **Step 1: Criar o worktree**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io"
git worktree add ../wt-eco-deltas -b feat/ecosystem-stat-deltas main
```

- [ ] **Step 2: Install real + prisma generate**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-deltas"
pnpm install --prefer-offline
pnpm prisma generate
```

Expected: install ~35s; prisma generate ok.

- [ ] **Step 3: Baseline verde**

```bash
npx vitest run tests/ecosystem/
```

Expected: suíte ecosystem verde (baseline da main).

---

### Task 1: `lib/ecosystem/stat-deltas.ts` — helpers puros (delta + rótulo de período)

**Files:**
- Create: `lib/ecosystem/stat-deltas.ts`
- Test: `tests/ecosystem/stat-deltas.test.ts`

**Interfaces:**
- Consumes: `ProjectStats` de `@/lib/ecosystem/stats-types`.
- Produces (Tasks 2 e 3 dependem):
  - `type StatDirection = "up" | "down" | "flat"`
  - `interface StatDelta { deltaPct: number; direction: StatDirection }` (deltaPct = fração; 0.234 = +23.4%)
  - `computeStatDeltas(current: ProjectStats, baseline: ProjectStats | null, mainAlkaneId: string | null): Record<string, StatDelta>`
  - `computePeriodLabel(currentAt: Date, baselineAt: Date | null): string | null`

- [ ] **Step 1: Write the failing test**

Criar `tests/ecosystem/stat-deltas.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { computeStatDeltas, computePeriodLabel } from "@/lib/ecosystem/stat-deltas"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

const gen = (over: Record<string, unknown>) => ({
  name: "ARBUZ", symbol: "ARBUZ", holders: 1000, supply: "100000",
  priceUsd: 0.01, marketcapUsd: 2000, volume24hUsd: 10, ...over,
})
const stats = (over: Partial<ProjectStats>): ProjectStats => ({
  generic: { "2:25349": gen({}) },
  custom: [{ key: "jackpot", label: "Jackpot", value: "10.00", unit: "DIESEL" }],
  ...over,
})

describe("computeStatDeltas", () => {
  it("returns {} when baseline is null", () => {
    expect(computeStatDeltas(stats({}), null, "2:25349")).toEqual({})
  })

  it("computes up/down/flat for generic holders/price", () => {
    const current = stats({ generic: { "2:25349": gen({ holders: 1234, priceUsd: 0.008 }) } })
    const baseline = stats({ generic: { "2:25349": gen({ holders: 1000, priceUsd: 0.01 }) } })
    const d = computeStatDeltas(current, baseline, "2:25349")
    expect(d["generic-holders"]).toEqual({ deltaPct: 0.234, direction: "up" })
    expect(d["generic-price"].direction).toBe("down")
    expect(d["generic-price"].deltaPct).toBeCloseTo(-0.2, 5)
    expect(d["generic-supply"]).toEqual({ deltaPct: 0, direction: "flat" }) // supply igual "100000"
  })

  it("compares supply as a number (string field)", () => {
    const current = stats({ generic: { "2:25349": gen({ supply: "110000" }) } })
    const baseline = stats({ generic: { "2:25349": gen({ supply: "100000" }) } })
    expect(computeStatDeltas(current, baseline, "2:25349")["generic-supply"]).toEqual({ deltaPct: 0.1, direction: "up" })
  })

  it("skips a metric when the baseline value is zero (no div-by-zero)", () => {
    const current = stats({ generic: { "2:25349": gen({ holders: 5 }) } })
    const baseline = stats({ generic: { "2:25349": gen({ holders: 0 }) } })
    expect(computeStatDeltas(current, baseline, "2:25349")["generic-holders"]).toBeUndefined()
  })

  it("skips a metric when a value is null (holders null → not comparable)", () => {
    const current = stats({ generic: { "2:25349": gen({ holders: null }) } })
    const baseline = stats({ generic: { "2:25349": gen({ holders: 100 }) } })
    expect(computeStatDeltas(current, baseline, "2:25349")["generic-holders"]).toBeUndefined()
  })

  it("computes custom deltas by key and skips non-numeric composite values", () => {
    const current = stats({
      custom: [
        { key: "jackpot", label: "Jackpot", value: "15.04" },
        { key: "tickets", label: "Tickets", value: "42 / 1337" },
      ],
    })
    const baseline = stats({
      custom: [
        { key: "jackpot", label: "Jackpot", value: "12.00" },
        { key: "tickets", label: "Tickets", value: "40 / 1300" },
      ],
    })
    const d = computeStatDeltas(current, baseline, "2:25349")
    expect(d["custom-jackpot"].direction).toBe("up")
    expect(d["custom-tickets"]).toBeUndefined() // "42 / 1337" → NaN → pulado
  })

  it("skips a custom key absent from the baseline", () => {
    const current = stats({ custom: [{ key: "new", label: "New", value: "5" }] })
    const baseline = stats({ custom: [{ key: "old", label: "Old", value: "5" }] })
    expect(computeStatDeltas(current, baseline, "2:25349")["custom-new"]).toBeUndefined()
  })

  it("skips generics when mainAlkaneId is null", () => {
    const d = computeStatDeltas(stats({}), stats({}), null)
    expect(d["generic-holders"]).toBeUndefined()
  })
})

describe("computePeriodLabel", () => {
  const base = new Date("2026-07-05T18:00:00Z")
  it("returns null without a baseline", () => {
    expect(computePeriodLabel(base, null)).toBeNull()
  })
  it("returns 24h when the gap is ~24h or more", () => {
    expect(computePeriodLabel(base, new Date("2026-07-04T18:00:00Z"))).toBe("24h")
    expect(computePeriodLabel(base, new Date("2026-07-04T17:00:00Z"))).toBe("24h") // 25h
  })
  it("returns <n>h during bootstrap (<23h of history)", () => {
    expect(computePeriodLabel(base, new Date("2026-07-05T06:00:00Z"))).toBe("12h")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ecosystem/stat-deltas.test.ts
```

Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

Criar `lib/ecosystem/stat-deltas.ts`:

```ts
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

export type StatDirection = "up" | "down" | "flat"
export interface StatDelta { deltaPct: number; direction: StatDirection }

/** null/undefined/"" → NaN (não comparável); resto → Number(). Evita Number(null)===0. */
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN
  return Number(v)
}

/** Direção + fração de variação; null se não comparável (não-finito ou base 0). */
function delta(cur: number, base: number): StatDelta | null {
  if (!Number.isFinite(cur) || !Number.isFinite(base) || base === 0) return null
  const rawPct = (cur - base) / base
  // Arredonda pra 3 casas de fração (=0.1% de resolução) — estabiliza o display e os testes.
  const deltaPct = Math.round(rawPct * 1000) / 1000
  const direction: StatDirection = cur > base ? "up" : cur < base ? "down" : "flat"
  return { deltaPct, direction }
}

/**
 * Delta por card entre o snapshot atual e o baseline, keyed pela MESMA chave que o
 * StatHero usa: "generic-holders" | "generic-supply" | "generic-price" | "custom-<key>".
 * Só inclui chaves onde ambos os valores são numéricos finitos e a base != 0.
 */
export function computeStatDeltas(
  current: ProjectStats,
  baseline: ProjectStats | null,
  mainAlkaneId: string | null,
): Record<string, StatDelta> {
  const out: Record<string, StatDelta> = {}
  if (!baseline) return out

  const gCur = mainAlkaneId ? current.generic[mainAlkaneId] : undefined
  const gBase = mainAlkaneId ? baseline.generic[mainAlkaneId] : undefined
  if (gCur && gBase) {
    const pairs: [string, unknown, unknown][] = [
      ["generic-holders", gCur.holders, gBase.holders],
      ["generic-supply", gCur.supply, gBase.supply],
      ["generic-price", gCur.priceUsd, gBase.priceUsd],
    ]
    for (const [k, cur, base] of pairs) {
      const d = delta(num(cur), num(base))
      if (d) out[k] = d
    }
  }

  for (const c of current.custom) {
    const b = baseline.custom.find((x) => x.key === c.key)
    if (!b) continue
    const d = delta(num(c.value), num(b.value))
    if (d) out[`custom-${c.key}`] = d
  }
  return out
}

/**
 * Rótulo do período entre o snapshot atual e o baseline: "24h" quando ≥23h,
 * senão "<n>h" (bootstrap, <24h de histórico). null quando não há baseline.
 */
export function computePeriodLabel(currentAt: Date, baselineAt: Date | null): string | null {
  if (!baselineAt) return null
  const hours = Math.round((currentAt.getTime() - baselineAt.getTime()) / 3_600_000)
  return hours >= 23 ? "24h" : `${Math.max(hours, 1)}h`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/ecosystem/stat-deltas.test.ts
```

Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-deltas"
git add lib/ecosystem/stat-deltas.ts tests/ecosystem/stat-deltas.test.ts
git commit -m "feat(ecosystem): pure helpers for stat deltas and period label"
```

---

### Task 2: `getEcosystemStatsWithDelta` no data layer

**Files:**
- Modify: `lib/ecosystem/public.ts` (nova função + import; `getLatestEcosystemStats` fica inalterada)
- Test: `tests/ecosystem/public.test.ts` (estende os mocks + novo describe)

**Interfaces:**
- Consumes: `computePeriodLabel` (Task 1); `prisma.ecosystemProject.findFirst`, `prisma.ecosystemStatSnapshot.findFirst`.
- Produces (Task 3 depende):
  - `interface StatsWithDelta { current: ProjectStats; baseline: ProjectStats | null; periodLabel: string | null }`
  - `getEcosystemStatsWithDelta(slug: string): Promise<StatsWithDelta | null>`

- [ ] **Step 1: Write the failing test**

Em `tests/ecosystem/public.test.ts`:

(a) estender o `vi.mock` do prisma (linhas ~4-9) pra incluir os métodos novos:

```ts
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn(), findFirst: vi.fn() },
    ecosystemSettings: { findUnique: vi.fn() },
    ecosystemStatSnapshot: { findFirst: vi.fn() },
  },
}))
```

(b) estender o import (linha ~12):

```ts
import { getEcosystemDirectory, getEcosystemStatsWithDelta } from "@/lib/ecosystem/public"
```

(c) novo describe no fim do arquivo:

```ts
describe("getEcosystemStatsWithDelta", () => {
  const proj = { id: "p1" }
  const snap = (takenAt: string, stats: unknown) => ({ takenAt: new Date(takenAt), stats })
  const S = (holders: number) => ({ generic: { "2:0": { holders } }, custom: [] })

  it("returns null for an unknown/unpublished slug", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    expect(await getEcosystemStatsWithDelta("nope")).toBeNull()
  })

  it("returns null when there is no snapshot", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockResolvedValueOnce(null as never)
    expect(await getEcosystemStatsWithDelta("x")).toBeNull()
  })

  it("pairs current with the snapshot ~24h before and labels it 24h", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    const current = snap("2026-07-05T18:00:00Z", S(1234))
    const base24 = snap("2026-07-04T18:00:00Z", S(1000))
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockImplementation((args: never) => {
      const a = args as { where: { takenAt?: { lte?: Date; lt?: Date } }; orderBy: { takenAt: string } }
      if (a.where.takenAt?.lte) return Promise.resolve(base24 as never) // cutoff query
      if (a.orderBy.takenAt === "asc") return Promise.resolve(null as never)
      return Promise.resolve(current as never) // desc, sem filtro → current
    })
    const r = await getEcosystemStatsWithDelta("x")
    expect((r!.current as never as ReturnType<typeof S>).generic["2:0"].holders).toBe(1234)
    expect((r!.baseline as never as ReturnType<typeof S>).generic["2:0"].holders).toBe(1000)
    expect(r!.periodLabel).toBe("24h")
  })

  it("falls back to the oldest snapshot and labels the real gap when <24h of history", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    const current = snap("2026-07-05T18:00:00Z", S(1234))
    const oldest = snap("2026-07-05T06:00:00Z", S(1100)) // 12h atrás
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockImplementation((args: never) => {
      const a = args as { where: { takenAt?: { lte?: Date; lt?: Date } }; orderBy: { takenAt: string } }
      if (a.where.takenAt?.lte) return Promise.resolve(null as never)     // nada ≥24h atrás
      if (a.orderBy.takenAt === "asc") return Promise.resolve(oldest as never)
      return Promise.resolve(current as never)
    })
    const r = await getEcosystemStatsWithDelta("x")
    expect(r!.periodLabel).toBe("12h")
    expect((r!.baseline as never as ReturnType<typeof S>).generic["2:0"].holders).toBe(1100)
  })

  it("returns baseline null / periodLabel null with a single snapshot", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    const current = snap("2026-07-05T18:00:00Z", S(1234))
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockImplementation((args: never) => {
      const a = args as { where: { takenAt?: { lte?: Date } }; orderBy: { takenAt: string } }
      if (a.where.takenAt?.lte) return Promise.resolve(null as never)
      if (a.orderBy.takenAt === "asc") return Promise.resolve(null as never) // nenhum anterior ao current
      return Promise.resolve(current as never)
    })
    const r = await getEcosystemStatsWithDelta("x")
    expect(r!.baseline).toBeNull()
    expect(r!.periodLabel).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ecosystem/public.test.ts
```

Expected: FAIL — `getEcosystemStatsWithDelta` não exportado.

- [ ] **Step 3: Write minimal implementation**

Em `lib/ecosystem/public.ts`:

(a) import no topo (junto dos outros):

```ts
import { computePeriodLabel } from "@/lib/ecosystem/stat-deltas"
```

(b) adicionar no fim do arquivo:

```ts
const STAT_DELTA_WINDOW_MS = 24 * 60 * 60 * 1000

export interface StatsWithDelta {
  current: ProjectStats
  baseline: ProjectStats | null
  periodLabel: string | null
}

/**
 * Snapshot mais recente + o de ~24h atrás (fallback: o mais antigo disponível), pro
 * indicador de tendência do StatHero. Nunca lança — o hero é decorativo.
 */
export async function getEcosystemStatsWithDelta(slug: string): Promise<StatsWithDelta | null> {
  try {
    const p = await prisma.ecosystemProject.findFirst({ where: { slug, published: true }, select: { id: true } })
    if (!p) return null
    const current = await prisma.ecosystemStatSnapshot.findFirst({
      where: { projectId: p.id },
      orderBy: { takenAt: "desc" },
    })
    if (!current) return null
    const cutoff = new Date(current.takenAt.getTime() - STAT_DELTA_WINDOW_MS)
    let baseline = await prisma.ecosystemStatSnapshot.findFirst({
      where: { projectId: p.id, takenAt: { lte: cutoff } },
      orderBy: { takenAt: "desc" },
    })
    if (!baseline) {
      // Bootstrap (<24h de histórico): compara com o snapshot mais antigo anterior ao current.
      baseline = await prisma.ecosystemStatSnapshot.findFirst({
        where: { projectId: p.id, takenAt: { lt: current.takenAt } },
        orderBy: { takenAt: "asc" },
      })
    }
    return {
      current: current.stats as unknown as ProjectStats,
      baseline: baseline ? (baseline.stats as unknown as ProjectStats) : null,
      periodLabel: computePeriodLabel(current.takenAt, baseline?.takenAt ?? null),
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/ecosystem/public.test.ts
```

Expected: PASS (existentes + 5 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/ecosystem/public.ts tests/ecosystem/public.test.ts
git commit -m "feat(ecosystem): getEcosystemStatsWithDelta data layer (current + ~24h baseline)"
```

---

### Task 3: Setinha no StatHero + wiring da página

**Files:**
- Modify: `components/ecosystem/StatHero.tsx` (import, props, render da setinha)
- Modify: `app/ecosystem/[slug]/page.tsx` (troca a função de stats + passa baseline/periodLabel)
- Test: `tests/ecosystem/stat-hero.test.tsx` (novo describe)

**Interfaces:**
- Consumes: `computeStatDeltas`/`StatDelta` (Task 1), `getEcosystemStatsWithDelta` (Task 2).
- Produces: `StatHero` ganha props opcionais `baseline?: ProjectStats | null`, `periodLabel?: string | null`; cada card com delta comparável renderiza uma linha com seta + % + período (`aria-label` = `"<dir> <pct>% over <period>"`).

- [ ] **Step 1: Write the failing test**

Em `tests/ecosystem/stat-hero.test.tsx`, novo describe no fim (o fixture `stats`/`copy` do topo já existe; `ProjectStats` já está importado na linha 4).

Nota: com 2 custom cards, o StatHero mostra 4 cards = jackpot, tickets, holders, supply (o card de preço NÃO entra — fica de fora do limite de 4). Por isso o "down" é testado via **supply**, não preço.

```ts
describe("StatHero — trend deltas", () => {
  const genBase = { name: "ARBUZ", symbol: "ARBUZ", priceUsd: 0.01, marketcapUsd: 2500, volume24hUsd: 19 }
  const cur = (): ProjectStats => ({
    generic: { "2:25349": { ...genBase, holders: 1234, supply: "90000" } },
    custom: [
      { key: "jackpot", label: "Tier-5 jackpot", value: "15.04", unit: "DIESEL" },
      { key: "tickets", label: "Tickets (round / all-time)", value: "42 / 1337" },
    ],
  })
  const base = (): ProjectStats => ({
    generic: { "2:25349": { ...genBase, holders: 1000, supply: "100000" } },
    custom: [
      { key: "jackpot", label: "Tier-5 jackpot", value: "12.00", unit: "DIESEL" },
      { key: "tickets", label: "Tickets (round / all-time)", value: "40 / 1300" },
    ],
  })

  it("marks up/down direction and the right % on the comparable cards", () => {
    render(<StatHero stats={cur()} baseline={base()} periodLabel="24h" mainAlkaneId="2:25349" copy={copy} locale="en" />)
    const rows = screen.getAllByTestId("stat-delta")
    const byPct = (pct: string) => rows.find((r) => r.textContent?.includes(pct))
    expect(byPct("23.4%")?.getAttribute("data-direction")).toBe("up")   // holders 1234 vs 1000
    expect(byPct("10.0%")?.getAttribute("data-direction")).toBe("down") // supply 90000 vs 100000
    expect(byPct("25.3%")?.getAttribute("data-direction")).toBe("up")   // jackpot 15.04 vs 12.00
  })

  it("renders a delta row only for numeric cards (tickets excluded)", () => {
    render(<StatHero stats={cur()} baseline={base()} periodLabel="24h" mainAlkaneId="2:25349" copy={copy} locale="en" />)
    // jackpot + holders + supply = 3 rows; tickets ("42 / 1337" → NaN) has none.
    expect(screen.getAllByTestId("stat-delta")).toHaveLength(3)
  })

  it("shows the period label in every delta row", () => {
    render(<StatHero stats={cur()} baseline={base()} periodLabel="24h" mainAlkaneId="2:25349" copy={copy} locale="en" />)
    expect(screen.getAllByTestId("stat-delta").every((r) => r.textContent?.includes("24h"))).toBe(true)
  })

  it("renders no delta rows at all when baseline is absent", () => {
    render(<StatHero stats={cur()} baseline={null} periodLabel={null} mainAlkaneId="2:25349" copy={copy} locale="en" />)
    expect(screen.queryAllByTestId("stat-delta")).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ecosystem/stat-hero.test.tsx
```

Expected: FAIL — StatHero não aceita `baseline`/`periodLabel` nem renderiza a linha de delta.

- [ ] **Step 3: Write minimal implementation**

Em `components/ecosystem/StatHero.tsx`:

(a) import no topo (após os existentes):

```tsx
import { computeStatDeltas, type StatDelta } from "@/lib/ecosystem/stat-deltas"
```

(b) antes do `export function StatHero`, adicionar as constantes e o sub-componente:

```tsx
const DELTA_COLOR: Record<StatDelta["direction"], string> = {
  up: "#3fb950",
  down: "#f85149",
  flat: "var(--ed-muted)",
}
const DELTA_ARROW: Record<StatDelta["direction"], string> = { up: "↑", down: "↓", flat: "–" }

function StatDeltaRow({ delta, periodLabel }: { delta: StatDelta; periodLabel: string | null }) {
  const pct = (Math.abs(delta.deltaPct) * 100).toFixed(1)
  const period = periodLabel ?? "period"
  return (
    <p
      data-testid="stat-delta"
      data-direction={delta.direction}
      className="mt-1 font-mono text-[11px]"
      style={{ color: DELTA_COLOR[delta.direction], fontVariantNumeric: "tabular-nums" }}
      aria-label={`${delta.direction} ${pct}% over ${period}`}
    >
      {DELTA_ARROW[delta.direction]} {pct}%
      {periodLabel ? <span className="ml-1" style={{ color: "var(--ed-muted)" }}>{periodLabel}</span> : null}
    </p>
  )
}
```

(c) atualizar a assinatura pra receber as props novas:

```tsx
export function StatHero({ stats, baseline, mainAlkaneId, copy, locale, periodLabel }: {
  stats: ProjectStats | null
  baseline?: ProjectStats | null
  mainAlkaneId: string | null
  copy: StatHeroCopy
  locale: "en" | "zh"
  periodLabel?: string | null
}) {
```

(d) logo após `if (cards.length === 0) return null`, computar os deltas:

```tsx
  if (cards.length === 0) return null
  const deltas = computeStatDeltas(stats, baseline ?? null, mainAlkaneId)
```

(e) no `.map` dos cards, adicionar a linha de delta após o `<p>` do valor:

```tsx
      {cards.slice(0, 4).map((c) => (
        <div key={c.k} className="rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-4 py-3.5">
          <p data-testid="stat-label" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">{c.label}</p>
          <p className="mt-1 text-[22px] font-medium tracking-[-0.015em] text-[color:var(--ed-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{c.value}</p>
          {deltas[c.k] ? <StatDeltaRow delta={deltas[c.k]} periodLabel={periodLabel ?? null} /> : null}
        </div>
      ))}
```

Em `app/ecosystem/[slug]/page.tsx`:

(f) trocar o import de `getLatestEcosystemStats` por `getEcosystemStatsWithDelta` (linha do import de `@/lib/ecosystem/public`):

```tsx
import { getEcosystemProfile, getEcosystemStatsWithDelta } from "@/lib/ecosystem/public"
```

(g) no `Promise.all`, trocar a chamada de stats:

```tsx
  const [p, s, series] = await Promise.all([
    getEcosystemProfile(slug, locale),
    getEcosystemStatsWithDelta(slug).catch(() => null), // hero é decorativo
    getEcosystemPriceSeries(slug).catch(() => null),
  ])
```

(h) atualizar a montagem do `statHero`:

```tsx
          statHero={<StatHero stats={s?.current ?? null} baseline={s?.baseline ?? null} periodLabel={s?.periodLabel ?? null} mainAlkaneId={p.alkaneId} copy={copy[locale].stats} locale={locale} />}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ecosystem/stat-hero.test.tsx tests/ecosystem/profile-page.test.tsx
npx tsc --noEmit
```

Expected: testes PASS; tsc limpo (confirma que a página compila com a troca de função).

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/StatHero.tsx 'app/ecosystem/[slug]/page.tsx' tests/ecosystem/stat-hero.test.tsx
git commit -m "feat(ecosystem): trend arrow (up/down + %) on stat cards"
```

---

### Task 4: Gates finais da branch

**Files:** nenhum novo (verificação; consertar o que quebrar)

- [ ] **Step 1: Suíte ecosystem completa**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-deltas"
npx vitest run tests/ecosystem/
```

Expected: baseline + ~20 novos (11 stat-deltas + 5 public + 4 stat-hero), todos verdes.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Lint (gate real)**

```bash
pnpm lint
```

Expected: **0 errors** (warnings pré-existentes ok; nenhum error novo nos arquivos tocados).

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: "Compiled successfully" (EINVAL de standalone no Windows é ruído conhecido).

- [ ] **Step 5: Commit (só se algo foi consertado)**

```bash
git add <arquivos consertados nominalmente>
git commit -m "fix(ecosystem): address branch gate findings"
```

---

## Pós-plano (fluxo da sessão, fora das tasks)

Review final da branch (Opus) → push via `TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/ecosystem-stat-deltas` → `gh pr create --head feat/ecosystem-stat-deltas` → CI paridade (só 4 falhas allow-listed) → `gh pr merge N --squash` → esperar "Deploy to GCP" da main → bump `k8s/kustomization.yaml` newTag **QUOTED full-SHA** direto na main (`deploy(io):`) → poll da imagem do deployment ANTES do rollout status → verificação prod: /ecosystem/diesel + /fire com setinha+% em holders/preço (período `12h` no bootstrap, vira `24h` quando o histórico passar de 24h); /arbuzino jackpot com setinha e tickets sem; projeto sem baseline sem linha extra.
```
