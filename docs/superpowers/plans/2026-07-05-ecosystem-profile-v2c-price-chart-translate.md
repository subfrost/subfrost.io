# Ecosystem Profile v2C — Price Chart + Profile Translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gráfico de preço diário (~90d, espo candles) nos profiles `/ecosystem/<slug>` de tokens com pool + botão "Translate EN→ZH" pro markdown do profile no admin.

**Architecture:** Fetch server-side dos candles do espo com fallback de gramática de pool (`<id>-usd` → `<id>-derived_2:0-usd`) e `unstable_cache` de 15min; render em client component recharts entrando no `EcosystemProfile` pelo mesmo padrão de slot do `statHero`. Tradução reusa `lib/cms/translate` no padrão exato da `translateEcosystemDescription`.

**Tech Stack:** Next 16 (App Router, página `force-dynamic`), recharts (dep existente), Prisma, vitest + RTL, espo JSON-RPC (`api.alkanode.com/rpc`).

**Spec:** `docs/superpowers/specs/2026-07-05-ecosystem-profile-v2c-design.md`

## Global Constraints

- Branch `feat/ecosystem-profile-v2c` em worktree novo `../wt-eco-v2c`; **install REAL** (`pnpm install --prefer-offline` + `pnpm prisma generate`) — Turbopack rejeita junction de node_modules no build.
- `git add` **NOMINAL** (nunca `-A`); paths com `[slug]` **sempre entre aspas simples** no bash.
- Sem deps novas; sem mudança de schema Prisma; jsdom NÃO bumpar ≥27.
- **Lint é gate real** (`pnpm lint` = `eslint .`; base = 0 errors/62 warnings — não introduzir NENHUM error novo).
- Soft-launch intacto: NÃO tocar em nav/sitemap (`tests/ecosystem/integration.test.ts` trava isso).
- Tema dual: cores do chart via tokens `--ed-*` com fallback hex (`var(--ed-ice, #5b9cff)` é idêntico em dark e light).
- NÃO mexer em `lib/espo-price.ts` (home stats usa; timeframe/limit diferentes).
- Escala espo: USD = `Number(close)/1e16`; candles chegam **newest-first** (fixture real do probe 2026-07-05 neste plano).
- Gates finais: `npx vitest run tests/ecosystem/` verde · `npx tsc --noEmit` · `pnpm lint` (0 errors) · `pnpm build` ("Compiled successfully" = ok; EINVAL standalone no Windows é ruído).
- ⚠️ `unstable_cache` (de `next/cache`) é legacy no Next 16 mas segue exportado. Logo após o install do worktree, confirmar: `node -e "console.log(typeof require('next/cache').unstable_cache)"` → `function`. Se (inesperadamente) não existir, fallback: memo TTL module-level (`Map<string, {at: number; v: PricePoint[] | null}>`, 900s) no lugar do wrapper — a assinatura pública `getEcosystemPriceSeries` não muda.

---

### Task 0: Worktree + install real (setup)

**Files:** nenhum (setup de ambiente)

- [ ] **Step 1: Criar o worktree**

```bash
cd "/c/Alkanes Geral Dev/subfrost.io"
git worktree add ../wt-eco-v2c -b feat/ecosystem-profile-v2c main
```

- [ ] **Step 2: Install real + prisma generate**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-v2c"
pnpm install --prefer-offline
pnpm prisma generate
node -e "console.log(typeof require('next/cache').unstable_cache)"
```

Expected: install ~35s; prisma generate ok; última linha imprime `function` (se não, aplicar o fallback TTL memo descrito nos Global Constraints na Task 1).

- [ ] **Step 3: Baseline verde**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-v2c"
npx vitest run tests/ecosystem/
```

Expected: 102 testes passando (baseline da main).

---

### Task 1: `lib/ecosystem/candles.ts` — série diária de preço com fallback de pool e cache

**Files:**
- Create: `lib/ecosystem/candles.ts`
- Test: `tests/ecosystem/candles.test.ts`

**Interfaces:**
- Consumes: `prisma.ecosystemProject.findFirst` (`@/lib/prisma`), `unstable_cache` (`next/cache`).
- Produces (Tasks 2 e 3 dependem):
  - `interface PricePoint { t: number; usd: number }` (t = unix segundos UTC do dia)
  - `fetchDailyCandles(pool: string, fetchImpl?: typeof fetch): Promise<PricePoint[]>` (lança em falha HTTP)
  - `resolveDailyCandles(alkaneId: string, fetchImpl?: typeof fetch): Promise<PricePoint[] | null>` (nunca lança)
  - `getEcosystemPriceSeries(slug: string): Promise<PricePoint[] | null>`

- [ ] **Step 1: Write the failing test**

Criar `tests/ecosystem/candles.test.ts`:

```ts
// tests/ecosystem/candles.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/prisma", () => ({
  prisma: { ecosystemProject: { findFirst: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import { fetchDailyCandles, resolveDailyCandles, getEcosystemPriceSeries } from "@/lib/ecosystem/candles"

// Fixture REAL (probe 2026-07-05, pool 2:0-usd, timeframe 1d): newest-first, USD = close/1e16.
const espoCandles = [
  { close: "412823201468700598", ts: 1783209600 },
  { close: "412051905620438636", ts: 1783123200 },
  { close: "407722114691735040", ts: 1783036800 },
]

function espoOk(candles: unknown[]) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: "2.0", result: { candles, ok: true }, id: 1 }),
  } as unknown as Response
}

beforeEach(() => vi.clearAllMocks())

describe("fetchDailyCandles", () => {
  it("parses, scales by 1e16 and sorts oldest→newest", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk(espoCandles))
    const points = await fetchDailyCandles("2:0-usd", fetchImpl as never)
    expect(points.map((p) => p.t)).toEqual([1783036800, 1783123200, 1783209600])
    expect(points[2].usd).toBeCloseTo(41.28232, 4)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.method).toBe("ammdata.get_candles")
    expect(body.params).toMatchObject({ pool: "2:0-usd", timeframe: "1d", side: "base", limit: 90, page: 1 })
  })

  it("skips candles with a missing/non-numeric close or missing ts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk([
      { close: "not-a-number", ts: 1783036800 },
      { close: "412823201468700598" }, // sem ts
      { close: "412823201468700598", ts: 1783209600 },
    ]))
    const points = await fetchDailyCandles("2:0-usd", fetchImpl as never)
    expect(points).toHaveLength(1)
    expect(points[0].t).toBe(1783209600)
    expect(points[0].usd).toBeCloseTo(41.28232, 4)
  })

  it("throws on a non-2xx answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 } as never)
    await expect(fetchDailyCandles("2:0-usd", fetchImpl as never)).rejects.toThrow("502")
  })
})

describe("resolveDailyCandles", () => {
  it("uses the direct pool when it has candles", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk(espoCandles))
    const points = await resolveDailyCandles("2:0", fetchImpl as never)
    expect(points).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params.pool).toBe("2:0-usd")
  })

  it("falls back to the DIESEL-derived pool when the direct one is empty", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(espoOk([]))
      .mockResolvedValueOnce(espoOk(espoCandles))
    const points = await resolveDailyCandles("2:25349", fetchImpl as never)
    expect(points).toHaveLength(3)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).params.pool).toBe("2:25349-derived_2:0-usd")
  })

  it("returns null when both pools are empty (project without a pool)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk([]))
    await expect(resolveDailyCandles("9:9", fetchImpl as never)).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("returns null instead of throwing on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"))
    await expect(resolveDailyCandles("2:0", fetchImpl as never)).resolves.toBeNull()
  })
})

describe("getEcosystemPriceSeries", () => {
  it("returns null without touching the RPC when the project has no alkaneId", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce({ alkaneId: null } as never)
    await expect(getEcosystemPriceSeries("clockin")).resolves.toBeNull()
  })

  it("returns null for an unknown/unpublished slug", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    await expect(getEcosystemPriceSeries("nope")).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-v2c"
npx vitest run tests/ecosystem/candles.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/ecosystem/candles'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

Criar `lib/ecosystem/candles.ts`:

```ts
// lib/ecosystem/candles.ts
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"

/**
 * Daily USD price series for ecosystem token profiles, from ESPO AMM candles.
 *
 * Same RPC + scale as lib/espo-price.ts, kept separate on purpose: that one is
 * a hot "latest 10m candle" price for home stats; this is a 90-day daily
 * series with pool-grammar fallback and a data cache.
 */
const ESPO_RPC_URL = process.env.ESPO_RPC_URL || "https://api.alkanode.com/rpc"
const ESPO_PRICE_SCALE = 10_000_000_000_000_000
const DAILY_LIMIT = 90

export interface PricePoint {
  /** Unix seconds (UTC day bucket). */
  t: number
  usd: number
}

interface EspoCandle {
  close?: string
  ts?: number
}

/** Daily close series for one ESPO pool key, oldest→newest. Throws on HTTP failure. */
export async function fetchDailyCandles(pool: string, fetchImpl: typeof fetch = fetch): Promise<PricePoint[]> {
  const response = await fetchImpl(ESPO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "ammdata.get_candles",
      params: { pool, timeframe: "1d", side: "base", limit: DAILY_LIMIT, page: 1 },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`ESPO get_candles ${pool} responded ${response.status}`)
  const data = (await response.json()) as { result?: { candles?: EspoCandle[] } }
  const points: PricePoint[] = []
  for (const c of data.result?.candles ?? []) {
    if (typeof c.ts !== "number" || !c.close || !/^\d+$/.test(c.close)) continue
    const usd = Number(c.close) / ESPO_PRICE_SCALE
    if (!Number.isFinite(usd) || usd <= 0) continue
    points.push({ t: c.ts, usd })
  }
  // ESPO answers newest-first; plot chronologically.
  return points.sort((a, b) => a.t - b.t)
}

/**
 * Pool grammar: direct `<id>-usd`, else DIESEL-derived `<id>-derived_2:0-usd`.
 * Unknown pools answer `candles: []` with ok, so an empty series means
 * "no pool", not an error. Never throws — the chart is decorative.
 */
export async function resolveDailyCandles(alkaneId: string, fetchImpl: typeof fetch = fetch): Promise<PricePoint[] | null> {
  try {
    const direct = await fetchDailyCandles(`${alkaneId}-usd`, fetchImpl)
    if (direct.length > 0) return direct
    const derived = await fetchDailyCandles(`${alkaneId}-derived_2:0-usd`, fetchImpl)
    return derived.length > 0 ? derived : null
  } catch {
    return null
  }
}

// 15min data cache (candles are UX-grade); the page itself stays force-dynamic.
// unstable_cache keys include the call args, so this is per-alkaneId.
const cachedResolveDailyCandles = unstable_cache(
  (alkaneId: string) => resolveDailyCandles(alkaneId),
  ["ecosystem-daily-candles"],
  { revalidate: 900 },
)

/** slug → published project's alkaneId → cached daily series. Null when no token/pool. */
export async function getEcosystemPriceSeries(slug: string): Promise<PricePoint[] | null> {
  const p = await prisma.ecosystemProject.findFirst({
    where: { slug, published: true },
    select: { alkaneId: true },
  })
  if (!p?.alkaneId) return null
  return cachedResolveDailyCandles(p.alkaneId)
}
```

(Se o check do `unstable_cache` na Task 0 tiver falhado: substituir o wrapper por um memo TTL module-level — `const memo = new Map<string, { at: number; v: PricePoint[] | null }>()` consultado/populado dentro de `getEcosystemPriceSeries`, TTL 900_000ms via `Date.now()` — e remover o import de `next/cache`. O teste não muda: o mock de `next/cache` vira inofensivo.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/ecosystem/candles.test.ts
```

Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-v2c"
git add lib/ecosystem/candles.ts tests/ecosystem/candles.test.ts
git commit -m "feat(ecosystem): daily price series from espo with pool-grammar fallback"
```

---

### Task 2: `components/ecosystem/PriceChart.tsx` — client chart recharts tema-dual

**Files:**
- Create: `components/ecosystem/PriceChart.tsx`
- Test: `tests/ecosystem/price-chart.test.tsx`

**Interfaces:**
- Consumes: `PricePoint` de `@/lib/ecosystem/candles` (Task 1); recharts (dep existente).
- Produces (Task 3 depende):
  - `interface PriceChartCopy { title: string }`
  - `PriceChart({ points, copy, locale }: { points: PricePoint[]; copy: PriceChartCopy; locale: "en" | "zh" })` — retorna `null` com <2 pontos.
  - `formatUsd(v: number): string` (exportado pra teste).

- [ ] **Step 1: Write the failing test**

Criar `tests/ecosystem/price-chart.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { PriceChart, formatUsd } from "@/components/ecosystem/PriceChart"

const copy = { title: "Price (90d)" }
const points = [
  { t: 1783036800, usd: 40.77 },
  { t: 1783123200, usd: 41.2 },
  { t: 1783209600, usd: 41.28 },
]

describe("PriceChart", () => {
  it("renders the section title and a recharts container", () => {
    const { container, getByText } = render(<PriceChart points={points} copy={copy} locale="en" />)
    expect(getByText("Price (90d)")).toBeInTheDocument()
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy()
  })

  it("renders nothing with fewer than 2 points", () => {
    const { container } = render(<PriceChart points={points.slice(0, 1)} copy={copy} locale="en" />)
    expect(container.firstChild).toBeNull()
  })
})

describe("formatUsd", () => {
  it("formats large, mid and sub-dollar values", () => {
    expect(formatUsd(1234.5)).toBe("$1,235")
    expect(formatUsd(41.283)).toBe("$41.28")
    expect(formatUsd(0.00123456)).toBe("$0.001235")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ecosystem/price-chart.test.tsx
```

Expected: FAIL — módulo `@/components/ecosystem/PriceChart` inexistente.

- [ ] **Step 3: Write minimal implementation**

Criar `components/ecosystem/PriceChart.tsx`:

```tsx
"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { PricePoint } from "@/lib/ecosystem/candles"

export interface PriceChartCopy {
  title: string
}

// --ed-ice é o mesmo hex em dark e light; os demais tokens seguem o tema.
const STROKE = "var(--ed-ice, #5b9cff)"
const HAIR = "var(--ed-hair, #262626)"
const MUTED = "var(--ed-muted, #8a8a8a)"

/** ≥1 → $X.XX (milhares com separador); <1 → 4 dígitos significativos (preços de alkane são miúdos). */
export function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return "—"
  if (v >= 1000) return `$${Math.round(v).toLocaleString("en-US")}`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(4)}`
}

function fmtDay(t: number, locale: "en" | "zh", full = false): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    ...(full ? { year: "numeric" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(t * 1000))
}

export function PriceChart({ points, copy, locale }: {
  points: PricePoint[]
  copy: PriceChartCopy
  locale: "en" | "zh"
}) {
  if (points.length < 2) return null
  const data = points.map((p) => ({ ...p, day: fmtDay(p.t, locale) }))
  return (
    <section className="mt-8 rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-4 py-3.5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">{copy.title}</p>
      <div className="mt-2 h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={HAIR} strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis
              tick={{ fontSize: 11, fill: MUTED }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={formatUsd}
              domain={["auto", "auto"]}
            />
            <Tooltip
              formatter={(v: number) => formatUsd(v)}
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t
                return typeof t === "number" ? fmtDay(t, locale, true) : ""
              }}
              contentStyle={{
                background: "var(--ed-surface)",
                border: "1px solid var(--ed-hair)",
                borderRadius: 8,
                color: "var(--ed-ink)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--ed-muted)" }}
            />
            <Area
              type="monotone"
              dataKey="usd"
              name="USD"
              stroke={STROKE}
              fill={STROKE}
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/ecosystem/price-chart.test.tsx
```

Expected: PASS (3 testes). (Warning de width/height 0 do ResponsiveContainer no jsdom é ruído conhecido.)

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/PriceChart.tsx tests/ecosystem/price-chart.test.tsx
git commit -m "feat(ecosystem): dual-theme recharts price chart component"
```

---

### Task 3: Slot `priceChart` no EcosystemProfile + wiring da página + copy EN/ZH

**Files:**
- Modify: `components/ecosystem/EcosystemProfile.tsx` (props + interface `ProfileCopy` + render do slot)
- Modify: `app/ecosystem/[slug]/page.tsx` (3º fetch paralelo + copy + prop)
- Test: `tests/ecosystem/profile-page.test.tsx` (fixture de copy + teste do slot)

**Interfaces:**
- Consumes: `PriceChart`/`PriceChartCopy` (Task 2), `getEcosystemPriceSeries` (Task 1).
- Produces: `ProfileCopy` ganha campo obrigatório `chart: PriceChartCopy`; `EcosystemProfile` ganha prop opcional `priceChart?: ReactNode` renderizada logo após `{statHero}`.

- [ ] **Step 1: Write the failing test**

Em `tests/ecosystem/profile-page.test.tsx`:

(a) na fixture `copy` do topo, adicionar o campo novo (obrigatório na interface):

```ts
const copy: ProfileCopy = {
  back: "← Ecosystem", website: "Website", docs: "Docs", overview: "Overview",
  contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
  stats: { holders: "Holders", supply: "Supply", price: "Price" },
  chart: { title: "Price (90d)" },
}
```

(b) novo teste no `describe("EcosystemProfile v2 — banner + tabs")` (ou describe novo):

```tsx
it("renders the priceChart slot after the header", () => {
  render(
    <EcosystemProfile
      p={profile({})}
      copy={copy}
      backHref="/ecosystem"
      priceChart={<div data-testid="price-chart-slot" />}
    />,
  )
  expect(screen.getByTestId("price-chart-slot")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ecosystem/profile-page.test.tsx
```

Expected: FAIL — TS não conhece `chart` em `ProfileCopy` nem a prop `priceChart` (erro de type/render).

- [ ] **Step 3: Write minimal implementation**

Em `components/ecosystem/EcosystemProfile.tsx`:

(a) import do tipo, junto dos imports existentes:

```tsx
import type { PriceChartCopy } from "./PriceChart"
```

(b) `ProfileCopy` ganha o campo (depois de `stats: StatHeroCopy`):

```tsx
export interface ProfileCopy {
  back: string
  website: string
  docs: string
  overview: string
  contractsTitle: string
  contractCol: string
  idCol: string
  notesCol: string
  statuses: Record<string, string>
  stats: StatHeroCopy
  chart: PriceChartCopy
}
```

(c) assinatura e render do componente:

```tsx
export function EcosystemProfile({ p, copy, backHref, statHero, priceChart }: {
  p: PublicEcosystemProfile
  copy: ProfileCopy
  backHref: string
  statHero?: ReactNode
  priceChart?: ReactNode
}) {
```

e no JSX, logo após `{statHero ?? null}`:

```tsx
      {statHero ?? null}

      {priceChart ?? null}

      <ProfileBody p={p} copy={copy} />
```

Em `app/ecosystem/[slug]/page.tsx`:

(d) imports novos:

```tsx
import { PriceChart } from "@/components/ecosystem/PriceChart"
import { getEcosystemPriceSeries } from "@/lib/ecosystem/candles"
```

(e) copy dos dois locales (campo `chart` depois de `stats`):

```tsx
  en: {
    // ...campos existentes inalterados...
    stats: { holders: "Holders", supply: "Supply", price: "Price (USD)" },
    chart: { title: "Price (90d)" },
  },
  zh: {
    // ...campos existentes inalterados...
    stats: { holders: "持有者", supply: "供应量", price: "价格 (USD)" },
    chart: { title: "价格（90 天）" },
  },
```

(f) fetch paralelo (3º item) e prop:

```tsx
  const [p, stats, series] = await Promise.all([
    getEcosystemProfile(slug, locale),
    getLatestEcosystemStats(slug).catch(() => null), // hero é decorativo: falha de stats não derruba o profile
    getEcosystemPriceSeries(slug).catch(() => null), // idem: gráfico é decorativo
  ])
  if (!p) notFound()
  const backHref = locale === "zh" ? "/ecosystem?lang=zh" : "/ecosystem"
  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[880px] px-6 pb-24 pt-10 sm:px-10">
        <EcosystemProfile
          p={p} copy={copy[locale]} backHref={backHref}
          statHero={<StatHero stats={stats} mainAlkaneId={p.alkaneId} copy={copy[locale].stats} locale={locale} />}
          priceChart={series ? <PriceChart points={series} copy={copy[locale].chart} locale={locale} /> : null}
        />
      </main>
    </EditorialShell>
  )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ecosystem/profile-page.test.tsx tests/ecosystem/price-chart.test.tsx
npx tsc --noEmit
```

Expected: testes PASS; tsc limpo (confirma que a page compila com o campo novo obrigatório).

- [ ] **Step 5: Commit**

```bash
git add components/ecosystem/EcosystemProfile.tsx 'app/ecosystem/[slug]/page.tsx' tests/ecosystem/profile-page.test.tsx
git commit -m "feat(ecosystem): price chart section on token profiles"
```

---

### Task 4: Action `translateEcosystemProfile`

**Files:**
- Modify: `actions/ecosystem/projects.ts` (nova action no fim do arquivo, após `translateEcosystemDescription`)
- Test: `tests/ecosystem/actions.test.ts`

**Interfaces:**
- Consumes: `requireEdit()`, `translate`/`translationUnavailable`/`Locale` (`@/lib/cms/translate`) — tudo já importado no arquivo.
- Produces (Task 5 depende): `translateEcosystemProfile(profileEn: string): Promise<{ ok: boolean; zh?: string; error?: string }>`.

- [ ] **Step 1: Write the failing test**

Em `tests/ecosystem/actions.test.ts`:

(a) ampliar o import da lib de tradução (linha ~21):

```ts
import { translate, translationUnavailable } from "@/lib/cms/translate"
```

(b) adicionar `translateEcosystemProfile` ao import das actions (linhas ~22-27):

```ts
import {
  saveEcosystemProject,
  deleteEcosystemProject,
  setFeaturedBandEnabled,
  translateEcosystemDescription,
  translateEcosystemProfile,
} from "@/actions/ecosystem/projects"
```

(c) describe novo no fim do arquivo:

```ts
describe("translateEcosystemProfile", () => {
  it("returns the translated markdown body", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(translate).mockResolvedValueOnce({ title: "", excerpt: "", body: "## 产品\n\n中文正文", sources: "" } as never)
    const res = await translateEcosystemProfile("## Products\n\nEnglish body")
    expect(res).toEqual({ ok: true, zh: "## 产品\n\n中文正文" })
    expect(vi.mocked(translate).mock.calls[0][0].body).toBe("## Products\n\nEnglish body")
  })

  it("rejects viewer without edit privilege", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(viewer as never)
    const res = await translateEcosystemProfile("body")
    expect(res.ok).toBe(false)
    expect(translate).not.toHaveBeenCalled()
  })

  it("rejects empty source", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    expect((await translateEcosystemProfile("   ")).ok).toBe(false)
    expect(translate).not.toHaveBeenCalled()
  })

  it("fails gracefully when translation is unavailable", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(editor as never)
    vi.mocked(translationUnavailable).mockReturnValueOnce(true)
    const res = await translateEcosystemProfile("body")
    expect(res).toEqual({ ok: false, error: "Translation unavailable (no API key)" })
    expect(translate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ecosystem/actions.test.ts
```

Expected: FAIL — `translateEcosystemProfile` não exportado.

- [ ] **Step 3: Write minimal implementation**

Em `actions/ecosystem/projects.ts`, após `translateEcosystemDescription`:

```ts
export async function translateEcosystemProfile(
  profileEn: string
): Promise<{ ok: boolean; zh?: string; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  if (!profileEn.trim()) return { ok: false, error: "Nothing to translate" }
  if (translationUnavailable()) return { ok: false, error: "Translation unavailable (no API key)" }
  // Same body-only path as the short description; the translator's system
  // prompt already preserves Markdown structure (headings, tables, code).
  const from: Locale = "en"
  const to: Locale = "zh"
  const out = await translate(
    { title: "", excerpt: "", body: profileEn.trim(), sources: "" },
    from,
    to
  )
  return { ok: true, zh: out.body.trim() }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/ecosystem/actions.test.ts
```

Expected: PASS (todos, incluindo os 4 novos).

- [ ] **Step 5: Commit**

```bash
git add actions/ecosystem/projects.ts tests/ecosystem/actions.test.ts
git commit -m "feat(ecosystem): translateEcosystemProfile server action"
```

---

### Task 5: Botão "Translate EN→ZH" no Profile (ZH) do admin

**Files:**
- Modify: `components/cms/ecosystem/EcosystemAdmin.tsx` (import, estado, handler, botão no header do textarea Profile ZH)
- Modify: `tests/ecosystem/admin-upload.test.tsx` (factory mock do módulo de actions ganha o export novo)
- Test: `tests/ecosystem/admin-form.test.tsx`

**Interfaces:**
- Consumes: `translateEcosystemProfile` (Task 4); estados `profileEn`/`profileZh`/`previewZh` e helper `onError` já existentes no `ProjectForm`.
- Produces: botão com `aria-label="Translate profile EN→ZH"` (texto visível "Translate EN→ZH" — o aria-label desambigua do botão da descrição nos testes).

- [ ] **Step 1: Write the failing test**

Em `tests/ecosystem/admin-form.test.tsx`:

(a) factory mock (linhas ~6-11) ganha o export novo:

```ts
vi.mock("@/actions/ecosystem/projects", () => ({
  saveEcosystemProject: vi.fn(),
  deleteEcosystemProject: vi.fn(),
  setFeaturedBandEnabled: vi.fn(),
  translateEcosystemDescription: vi.fn(),
  translateEcosystemProfile: vi.fn(),
}))
```

(b) import (linha ~4):

```ts
import { saveEcosystemProject, translateEcosystemProfile } from "@/actions/ecosystem/projects"
```

(c) describe novo no fim:

```tsx
describe("EcosystemAdmin — translate profile", () => {
  it("fills Profile (ZH) from the action result and disables while empty", async () => {
    vi.mocked(translateEcosystemProfile).mockResolvedValue({ ok: true, zh: "## 中文正文" })
    const { getByText, getByLabelText, getByRole } = render(
      <EcosystemAdmin projects={[]} featuredBandEnabled={false} canEdit />,
    )
    fireEvent.click(getByText("New project"))
    const btn = getByRole("button", { name: "Translate profile EN→ZH" })
    expect(btn).toBeDisabled() // profileEn vazio
    fireEvent.change(getByLabelText("Profile (EN)"), { target: { value: "## Products" } })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    await waitFor(() => expect(translateEcosystemProfile).toHaveBeenCalledWith("## Products"))
    await waitFor(() => expect(getByLabelText("Profile (ZH)")).toHaveValue("## 中文正文"))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ecosystem/admin-form.test.tsx
```

Expected: FAIL — botão "Translate profile EN→ZH" não existe.

- [ ] **Step 3: Write minimal implementation**

Em `components/cms/ecosystem/EcosystemAdmin.tsx`:

(a) adicionar `translateEcosystemProfile` ao import das actions (bloco de imports no topo, junto de `translateEcosystemDescription`).

(b) estado novo, logo após `const [translating, setTranslating] = useState(false)` (linha ~305):

```tsx
  const [translatingProfile, setTranslatingProfile] = useState(false)
```

(c) handler novo, logo após `translateZh()` (linha ~371):

```tsx
  function translateProfileZh() {
    setTranslatingProfile(true); onError(null)
    startTransition(async () => {
      const res = await translateEcosystemProfile(profileEn)
      setTranslatingProfile(false)
      if (res.ok && res.zh) setProfileZh(res.zh)
      else onError(res.error ?? "Translate failed")
    })
  }
```

(d) header do bloco "Profile (ZH)" (linhas ~559-564) passa a ter os dois botões:

```tsx
        <div className="flex items-center justify-between">
          <label className={label} htmlFor="ep-profile-zh">Profile (ZH)</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Translate profile EN→ZH"
              onClick={translateProfileZh}
              disabled={translatingProfile || !profileEn.trim()}
              className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
            >
              {translatingProfile ? "Translating…" : "Translate EN→ZH"}
            </button>
            <button type="button" onClick={() => setPreviewZh(!previewZh)} className="text-xs text-sky-400 hover:text-sky-300">
              {previewZh ? "Edit ZH" : "Preview ZH"}
            </button>
          </div>
        </div>
```

(e) Em `tests/ecosystem/admin-upload.test.tsx` (linhas ~7+), o factory mock do mesmo módulo ganha a mesma linha:

```ts
  translateEcosystemProfile: vi.fn(),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ecosystem/admin-form.test.tsx tests/ecosystem/admin-upload.test.tsx
```

Expected: PASS (incluindo o teste novo).

- [ ] **Step 5: Commit**

```bash
git add components/cms/ecosystem/EcosystemAdmin.tsx tests/ecosystem/admin-form.test.tsx tests/ecosystem/admin-upload.test.tsx
git commit -m "feat(ecosystem): admin Translate EN→ZH button for the profile body"
```

---

### Task 6: Gates finais da branch

**Files:** nenhum novo (só verificação; consertar o que quebrar)

- [ ] **Step 1: Suíte ecosystem completa**

```bash
cd "/c/Alkanes Geral Dev/wt-eco-v2c"
npx vitest run tests/ecosystem/
```

Expected: 102 baseline + ~18 novos, todos verdes.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Lint (gate real)**

```bash
pnpm lint
```

Expected: **0 errors** (warnings pré-existentes ok, 62 na base; nenhum error novo nos arquivos tocados).

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: "Compiled successfully" (EINVAL de standalone no Windows é ruído conhecido). Confirma `unstable_cache` vivo no Next 16 e recharts no bundle client.

- [ ] **Step 5: Commit (só se algo foi consertado nos steps acima)**

```bash
git add <arquivos consertados nominalmente>
git commit -m "fix(ecosystem): address branch gate findings"
```

---

## Pós-plano (fluxo da sessão, fora das tasks)

Review da branch (Opus, 4 ângulos) → push via `TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/ecosystem-profile-v2c` → `gh pr create --head feat/ecosystem-profile-v2c` → CI paridade (só 4 falhas allow-listed: admin-nav 3 + admin-landing 1) → `gh pr merge N --squash` → esperar workflow "Deploy to GCP" da main → bump `k8s/kustomization.yaml` newTag **QUOTED full-SHA** direto na main (`deploy(io):`) → poll da imagem do deployment ANTES do rollout status → verificação prod: /ecosystem/diesel + /fire (pool direto), /arbuzino (derivado), /clockin (sem gráfico, sem buraco), admin traduz profile do arbuzino → `?lang=zh` com corpo em chinês.
