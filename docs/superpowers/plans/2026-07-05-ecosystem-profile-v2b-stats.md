# Ecosystem Profile v2B — Dados On-chain (cron + snapshot + stat hero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stat hero no profile com dados on-chain reais (jackpot do Arbuzino, holders/supply/preço por contrato), alimentado por cron horário → snapshot no Postgres (a página nunca consulta RPC no request).

**Architecture:** Model aditivo `EcosystemStatSnapshot` (série temporal Json por projeto); client `simulateView` pro RPC subfrost (`alkanes_simulate`, decode u128 LE); adapters por slug em código (`lib/ecosystem/adapters/`, showcase Arbuzino); coletor `syncEcosystemStats` (genéricas via `getAlkaneDetails` existente + adapter) exposto em rota Bearer-gated; CronJob k8s no padrão marketing-snapshot; `StatHero` server component renderizando o último snapshot (custom primeiro, completa com genéricas, máx 4 cards).

**Tech Stack:** Next 16, Prisma/Postgres Json, vitest, k8s CronJob (curl in-cluster), pnpm.

**Spec:** `docs/superpowers/specs/2026-07-05-ecosystem-profile-v2-design.md` (seção PR B — fontes PROVADAS ao vivo, fixture real do op103 lá)

## Global Constraints

- Branch `feat/ecosystem-profile-v2b`, worktree novo (install REAL — Turbopack×junction); PR sempre; `git add` nominal.
- Schema ADITIVO. Sem deps novas. Soft-launch intacto. Tokens `--ed-*` no público.
- RPC: `process.env.SUBFROST_RPC_URL || "https://mainnet.subfrost.io/v4/subfrost"`; genéricas via `getAlkaneDetails` de `@/lib/marketing/alkane-details` (NÃO duplicar client).
- Rota cron: mesma convenção de `app/api/marketing/snapshot-cron/route.ts` — `PREFETCH_SECRET` enforça só se a env existir; 401 `{ error: "Unauthorized" }`.
- Nada de RPC no pageview: página lê só do banco.
- Todos os coletores nunca lançam por item (um projeto/campo falhar não derruba o batch).
- Gates: `npx vitest run tests/ecosystem/` + `npx tsc --noEmit` + `npx eslint <tocados>` sem findings novos + `pnpm build` verde.

## Setup (orquestrador)

```bash
cd "C:\Alkanes Geral Dev\subfrost.io"
git worktree add ../wt-eco-v2b -b feat/ecosystem-profile-v2b main
cd ../wt-eco-v2b
pnpm install --prefer-offline && pnpm prisma generate
cp "C:\Alkanes Geral Dev\subfrost.io\docs\superpowers\plans\2026-07-05-ecosystem-profile-v2b-stats.md" docs/superpowers/plans/
mkdir -p .superpowers/sdd && echo "# SDD ledger — eco-v2b ($(git rev-parse --short HEAD) base)" > .superpowers/sdd/progress.md
```

---

### Task 1: Schema `EcosystemStatSnapshot` + tipos + client `simulateView`

**Files:**
- Modify: `prisma/schema.prisma` (novo model + relação em `EcosystemProject`)
- Create: `lib/ecosystem/stats-types.ts`
- Create: `lib/ecosystem/simulate.ts`
- Test: `tests/ecosystem/simulate.test.ts` (novo)
- Commit também: `docs/superpowers/plans/2026-07-05-ecosystem-profile-v2b-stats.md`

**Interfaces (Produces):**
```ts
// lib/ecosystem/stats-types.ts
export interface GenericTokenStats { name: string | null; symbol: string | null; holders: number | null; supply: string | null; priceUsd: number | null; marketcapUsd: number | null; volume24hUsd: number | null }
export interface CustomStat { key: string; label: string; labelZh?: string; value: string; unit?: string }
export interface ProjectStats { generic: Record<string, GenericTokenStats>; custom: CustomStat[] }
```
`simulateView(target: { block: string; tx: string }, inputs: string[], fetchImpl?: typeof fetch): Promise<bigint[] | null>`

- [ ] **Step 1: Schema** — em `EcosystemProject`, abaixo de `contracts EcosystemProjectContract[]`, adicionar `statSnapshots EcosystemStatSnapshot[]`; após `EcosystemProjectContract`, novo model:

```prisma
model EcosystemStatSnapshot {
  id        String           @id @default(cuid())
  projectId String
  project   EcosystemProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  takenAt   DateTime         @default(now())
  stats     Json

  @@index([projectId, takenAt])
}
```

- [ ] **Step 2: `pnpm prisma generate`**.

- [ ] **Step 3: `lib/ecosystem/stats-types.ts`** — exatamente as 3 interfaces do bloco acima, com docstring de 1 linha ("shape versionado do Json de EcosystemStatSnapshot.stats").

- [ ] **Step 4: Teste que falha — `tests/ecosystem/simulate.test.ts`** (fixture REAL capturada 2026-07-05 do op103 em 4:257):

```ts
import { describe, it, expect, vi } from "vitest"
import { simulateView } from "@/lib/ecosystem/simulate"

const REAL_DATA =
  "0x3028f2000000000000000000000000008046fc3101000000000000000000000070f5b35900000000000000000000000010055301000000000000000000000000"

const rpcOk = (data: string, error: unknown = null) =>
  ({ ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: { execution: { alkanes: [], data, error, storage: [] }, gasUsed: 1, status: 0 } }) }) as unknown as Response

describe("simulateView", () => {
  it("decodes the real ViewPools payload into 4 LE u128 words", async () => {
    const fetchImpl = vi.fn(async () => rpcOk(REAL_DATA))
    const words = await simulateView({ block: "4", tx: "257" }, ["103"], fetchImpl as never)
    expect(words).toEqual([15870000n, 5133584000n, 1504966000n, 22218000n])
    const body = JSON.parse((fetchImpl.mock.calls[0] as never[])[1]!["body"] as string)
    expect(body.method).toBe("alkanes_simulate")
    expect(body.params[0].target).toEqual({ block: "4", tx: "257" })
    expect(body.params[0].inputs).toEqual(["103"])
  })

  it("returns null on execution error, malformed data, and network failure", async () => {
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => rpcOk("0x", "ALKANES: revert")) as never)).toBeNull()
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => rpcOk("0x1234")) as never)).toBeNull() // não múltiplo de 32 hex
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => { throw new Error("down") }) as never)).toBeNull()
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => ({ ok: false }) as never) as never)).toBeNull()
  })
})
```

⚠️ Os 4 bigints esperados são derivados da fixture — se o decode implementado divergir, é o TESTE que está certo (bytes reais). Conferência manual: word i = hex[32i..32i+32] com bytes revertidos (LE).

- [ ] **Step 5: Rodar — FALHA** (módulo inexistente).

- [ ] **Step 6: Implementar `lib/ecosystem/simulate.ts`**

```ts
// lib/ecosystem/simulate.ts
/**
 * Read-only `alkanes_simulate` against the SUBFROST RPC — the profile stats
 * pipeline's view-opcode reader. Returns the execution data decoded as
 * little-endian u128 words, or null on ANY failure (never throws).
 */
const RPC_URL = process.env.SUBFROST_RPC_URL || "https://mainnet.subfrost.io/v4/subfrost"

export async function simulateView(
  target: { block: string; tx: string },
  inputs: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<bigint[] | null> {
  try {
    const res = await fetchImpl(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alkanes_simulate",
        params: [{
          alkanes: [], transaction: "0x", block: "0x", height: "20000",
          txindex: 0, pointer: 0, refundPointer: 0, vout: 0, target, inputs,
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: { execution?: { data?: unknown; error?: unknown } } }
    const exec = json.result?.execution
    if (!exec || exec.error != null) return null
    if (typeof exec.data !== "string" || !exec.data.startsWith("0x")) return null
    const hex = exec.data.slice(2)
    if (hex.length === 0 || hex.length % 32 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null
    const words: bigint[] = []
    for (let i = 0; i < hex.length; i += 32) {
      const le = hex.slice(i, i + 32).match(/../g)!.reverse().join("")
      words.push(BigInt("0x" + le))
    }
    return words
  } catch {
    return null
  }
}
```

- [ ] **Step 7: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS; `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/ecosystem/stats-types.ts lib/ecosystem/simulate.ts tests/ecosystem/simulate.test.ts docs/superpowers/plans/2026-07-05-ecosystem-profile-v2b-stats.md
git commit -m "feat(ecosystem): stat snapshot model and alkanes_simulate view client"
```

---

### Task 2: Adapters (registry + Arbuzino)

**Files:**
- Create: `lib/ecosystem/adapters/index.ts`, `lib/ecosystem/adapters/arbuzino.ts`
- Test: `tests/ecosystem/adapters.test.ts` (novo)

**Interfaces:**
- Consumes: `simulateView` (Task 1), `CustomStat` (Task 1).
- Produces:
  ```ts
  export type SimulateFn = typeof simulateView
  export type EcosystemAdapter = (simulate: SimulateFn) => Promise<CustomStat[]>
  export const ECOSYSTEM_ADAPTERS: Record<string, EcosystemAdapter> // { arbuzino }
  ```

- [ ] **Step 1: Teste que falha — `tests/ecosystem/adapters.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest"
import { arbuzinoStats } from "@/lib/ecosystem/adapters/arbuzino"
import { ECOSYSTEM_ADAPTERS } from "@/lib/ecosystem/adapters"

describe("arbuzino adapter", () => {
  it("maps pools/tickets/vault into ordered cards (jackpot = pool_5, feeVault = fee_pool)", async () => {
    const simulate = vi.fn(async (target: { block: string; tx: string }, inputs: string[]) => {
      if (target.tx === "257" && inputs[0] === "103") return [15870000n, 5133584000n, 1504966000n, 22218000n]
      if (target.tx === "257" && inputs[0] === "108") return [42n, 1337n]
      if (target.tx === "777" && inputs[0] === "101") return [1000n, 22218000n, 0n]
      return null
    })
    const cards = await arbuzinoStats(simulate as never)
    expect(cards.map((c) => c.key)).toEqual(["jackpot", "tickets", "feeVault"])
    expect(cards[0]).toMatchObject({ value: "15.04", unit: "DIESEL" }) // 1504966000/1e8, truncado 2 casas
    expect(cards[1].value).toBe("42 / 1337")
    expect(cards[2]).toMatchObject({ value: "0.22", unit: "DIESEL" })
    expect(cards.every((c) => c.label && c.labelZh)).toBe(true)
  })

  it("omits cards whose simulate failed; empty when all fail", async () => {
    const partial = vi.fn(async (_t: unknown, inputs: string[]) => (inputs[0] === "108" ? [1n, 2n] : null))
    const cards = await arbuzinoStats(partial as never)
    expect(cards.map((c) => c.key)).toEqual(["tickets"])
    const none = await arbuzinoStats(vi.fn(async () => null) as never)
    expect(none).toEqual([])
  })

  it("is registered by slug", () => {
    expect(ECOSYSTEM_ADAPTERS.arbuzino).toBe(arbuzinoStats)
  })
})
```

- [ ] **Step 2: Rodar — FALHA.**

- [ ] **Step 3: Implementar**

`lib/ecosystem/adapters/arbuzino.ts`:

```ts
// lib/ecosystem/adapters/arbuzino.ts
/**
 * Arbuzino (Fireball lottery) custom stats via the view opcodes the project
 * documented: op103 ViewPools / op108 ViewTickets on 4:257, op101 ViewVault
 * on 4:777. Amounts are DIESEL base units (1e8).
 */
import type { CustomStat } from "@/lib/ecosystem/stats-types"
import type { SimulateFn } from "@/lib/ecosystem/adapters"

const FIREBALL = { block: "4", tx: "257" }
const FEE_VAULT = { block: "4", tx: "777" }
const ONE_DIESEL = 100_000_000n

/** base units → "12.34" (truncado, 2 casas) */
function diesel(v: bigint): string {
  const whole = v / ONE_DIESEL
  const cents = ((v % ONE_DIESEL) * 100n) / ONE_DIESEL
  return `${whole}.${cents.toString().padStart(2, "0")}`
}

export async function arbuzinoStats(simulate: SimulateFn): Promise<CustomStat[]> {
  const [pools, tickets, vault] = await Promise.all([
    simulate(FIREBALL, ["103"]),
    simulate(FIREBALL, ["108"]),
    simulate(FEE_VAULT, ["101"]),
  ])
  const out: CustomStat[] = []
  if (pools && pools.length >= 4) {
    out.push({ key: "jackpot", label: "Tier-5 jackpot", labelZh: "五中头奖池", value: diesel(pools[2]), unit: "DIESEL" })
  }
  if (tickets && tickets.length >= 2) {
    out.push({ key: "tickets", label: "Tickets (round / all-time)", labelZh: "彩票（本轮 / 累计）", value: `${tickets[0]} / ${tickets[1]}` })
  }
  if (vault && vault.length >= 2) {
    out.push({ key: "feeVault", label: "Fee vault", labelZh: "手续费金库", value: diesel(vault[1]), unit: "DIESEL" })
  }
  return out
}
```

`lib/ecosystem/adapters/index.ts`:

```ts
// lib/ecosystem/adapters/index.ts
/**
 * DefiLlama-style per-project stat adapters, keyed by ecosystem slug. A
 * project that documents its view opcodes (like Arbuzino did) gets an adapter
 * here; everyone else still gets the generic per-contract stats.
 */
import type { CustomStat } from "@/lib/ecosystem/stats-types"
import type { simulateView } from "@/lib/ecosystem/simulate"
import { arbuzinoStats } from "@/lib/ecosystem/adapters/arbuzino"

export type SimulateFn = typeof simulateView
export type EcosystemAdapter = (simulate: SimulateFn) => Promise<CustomStat[]>

export const ECOSYSTEM_ADAPTERS: Record<string, EcosystemAdapter> = {
  arbuzino: arbuzinoStats,
}
```

(⚠️ import circular index↔arbuzino é só de TIPO — `import type` não gera ciclo em runtime. Se o tsc reclamar, mover `SimulateFn` para `lib/ecosystem/stats-types.ts` e importar de lá nos dois.)

- [ ] **Step 4: Verde + regressão**; commit:

```bash
git add lib/ecosystem/adapters/index.ts lib/ecosystem/adapters/arbuzino.ts tests/ecosystem/adapters.test.ts
git commit -m "feat(ecosystem): per-project stat adapters with Arbuzino showcase"
```

---

### Task 3: Coletor + rota cron + CronJob k8s

**Files:**
- Create: `lib/ecosystem/stats-sync.ts`
- Create: `app/api/ecosystem/stats-cron/route.ts`
- Create: `k8s/ecosystem-stats-cronjob.yaml`
- Modify: `k8s/kustomization.yaml` (resources: adicionar `- ecosystem-stats-cronjob.yaml` após `- prefetch-cronjob.yaml`)
- Test: `tests/ecosystem/stats-sync.test.ts` (novo)

**Interfaces:**
- Consumes: `getAlkaneDetails(id, fetchImpl)` de `@/lib/marketing/alkane-details`; `simulateView`; `ECOSYSTEM_ADAPTERS`; prisma.
- Produces: `syncEcosystemStats(fetchImpl?: typeof fetch): Promise<{ projects: number; snapshots: number }>`; rota GET `/api/ecosystem/stats-cron` (Bearer PREFETCH_SECRET, convenção snapshot-cron).

- [ ] **Step 1: Teste que falha — `tests/ecosystem/stats-sync.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn() },
    ecosystemStatSnapshot: { create: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock("@/lib/marketing/alkane-details", () => ({ getAlkaneDetails: vi.fn() }))
vi.mock("@/lib/ecosystem/adapters", () => ({
  ECOSYSTEM_ADAPTERS: { arbuzino: vi.fn(async () => [{ key: "jackpot", label: "Tier-5 jackpot", value: "15.04", unit: "DIESEL" }]) },
}))

import { prisma } from "@/lib/prisma"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { syncEcosystemStats } from "@/lib/ecosystem/stats-sync"

const proj = (over: Record<string, unknown>) => ({
  id: "p1", slug: "arbuzino", alkaneId: "2:25349", published: true,
  contracts: [{ alkaneId: "4:257" }, { alkaneId: "2:25349" }],
  ...over,
})
const detail = (id: string) => ({
  id, name: "N", symbol: "S", holders: 10, priceUsd: 0.01, supply: "100000",
  marketcapUsd: 2500, fdvUsd: null, volume24hUsd: 19, priceChange24h: null, priceChange7d: null, priceChange30d: null,
})

beforeEach(() => vi.clearAllMocks())

describe("syncEcosystemStats", () => {
  it("dedupes alkane ids, writes one snapshot with generic+custom, prunes old rows", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([proj({})] as never)
    vi.mocked(getAlkaneDetails).mockImplementation(async (id: string) => detail(id) as never)
    const r = await syncEcosystemStats()
    expect(r).toEqual({ projects: 1, snapshots: 1 })
    expect(vi.mocked(getAlkaneDetails).mock.calls.map((c) => c[0]).sort()).toEqual(["2:25349", "4:257"]) // dedupado
    const created = vi.mocked(prisma.ecosystemStatSnapshot.create).mock.calls[0][0]
    expect(created.data.projectId).toBe("p1")
    expect(created.data.stats.custom[0].key).toBe("jackpot")
    expect(Object.keys(created.data.stats.generic).sort()).toEqual(["2:25349", "4:257"])
    expect(prisma.ecosystemStatSnapshot.deleteMany).toHaveBeenCalled()
  })

  it("skips projects with no ids and no adapter; one failure doesn't sink the batch", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      proj({ id: "a", slug: "no-ids", alkaneId: null, contracts: [] }),
      proj({ id: "b", slug: "boom", alkaneId: "2:0", contracts: [] }),
      proj({ id: "c", slug: "ok", alkaneId: "32:0", contracts: [] }),
    ] as never)
    vi.mocked(getAlkaneDetails).mockImplementation(async (id: string) => {
      if (id === "2:0") throw new Error("boom")
      return detail(id) as never
    })
    const r = await syncEcosystemStats()
    expect(r.snapshots).toBe(1) // só "ok" (boom falhou, no-ids pulado)
    expect(prisma.ecosystemStatSnapshot.create).toHaveBeenCalledTimes(1)
  })
})
```

(Nota: `getAlkaneDetails` real NUNCA lança — o teste do "boom" cobre o guard defensivo do coletor mesmo assim.)

- [ ] **Step 2: Rodar — FALHA.**

- [ ] **Step 3: Implementar `lib/ecosystem/stats-sync.ts`**

```ts
// lib/ecosystem/stats-sync.ts
/**
 * Hourly stats collector for ecosystem profiles. For every published project
 * with at least one alkane id (or a custom adapter): generic per-contract
 * stats via the canon get-alkane-details endpoint, custom stats via the
 * project's adapter, persisted as ONE EcosystemStatSnapshot row. Per-project
 * failures are logged and skipped — one bad project never sinks the batch.
 */
import { prisma } from "@/lib/prisma"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { simulateView } from "@/lib/ecosystem/simulate"
import { ECOSYSTEM_ADAPTERS } from "@/lib/ecosystem/adapters"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

const KEEP_DAYS = 90
const CONCURRENCY = 3

export async function syncEcosystemStats(
  fetchImpl: typeof fetch = fetch,
): Promise<{ projects: number; snapshots: number }> {
  const projects = await prisma.ecosystemProject.findMany({
    where: { published: true },
    include: { contracts: { orderBy: { sortOrder: "asc" } } },
  })

  let snapshots = 0
  for (const p of projects) {
    const ids = [...new Set([p.alkaneId, ...p.contracts.map((c) => c.alkaneId)].filter((x): x is string => !!x))]
    const adapter = ECOSYSTEM_ADAPTERS[p.slug]
    if (ids.length === 0 && !adapter) continue
    try {
      const generic: ProjectStats["generic"] = {}
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const blocks = await Promise.all(ids.slice(i, i + CONCURRENCY).map((id) => getAlkaneDetails(id, fetchImpl)))
        for (const b of blocks) {
          generic[b.id] = {
            name: b.name, symbol: b.symbol, holders: b.holders, supply: b.supply,
            priceUsd: b.priceUsd, marketcapUsd: b.marketcapUsd, volume24hUsd: b.volume24hUsd,
          }
        }
      }
      const custom = adapter ? await adapter((t, i2) => simulateView(t, i2, fetchImpl)) : []
      const stats: ProjectStats = { generic, custom }
      await prisma.ecosystemStatSnapshot.create({
        data: { projectId: p.id, stats: stats as unknown as object },
      })
      await prisma.ecosystemStatSnapshot.deleteMany({
        where: { projectId: p.id, takenAt: { lt: new Date(Date.now() - KEEP_DAYS * 24 * 3600 * 1000) } },
      })
      snapshots++
    } catch (e) {
      console.error(`[ecosystem-stats] ${p.slug} failed`, e)
    }
  }
  return { projects: projects.length, snapshots }
}
```

(Se o tsc reclamar do `stats: ... as unknown as object`, usar `Prisma.InputJsonValue` importado de `@prisma/client` — preferir isso se compilar limpo.)

- [ ] **Step 4: Rota `app/api/ecosystem/stats-cron/route.ts`** (espelho EXATO da convenção snapshot-cron):

```ts
import { NextRequest, NextResponse } from "next/server"
import { syncEcosystemStats } from "@/lib/ecosystem/stats-sync"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.PREFETCH_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  const t0 = Date.now()
  try {
    const r = await syncEcosystemStats()
    return NextResponse.json({ ok: true, ...r, ms: Date.now() - t0 })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
```

Adicionar ao teste (`tests/ecosystem/stats-sync.test.ts`, describe novo `stats-cron route`; mock local `vi.mock("@/lib/ecosystem/stats-sync", () => ({ syncEcosystemStats: vi.fn(async () => ({ projects: 1, snapshots: 1 })) }))` no topo do bloco — como o arquivo já mocka os módulos do coletor, IMPORTAR a rota dinamicamente no teste):

```ts
describe("stats-cron route auth", () => {
  it("401s with wrong bearer when PREFETCH_SECRET is set; 200 without env", async () => {
    const { GET } = await import("@/app/api/ecosystem/stats-cron/route")
    vi.stubEnv("PREFETCH_SECRET", "s3cret")
    const denied = await GET(new Request("http://x/api/ecosystem/stats-cron", { headers: { authorization: "Bearer wrong" } }) as never)
    expect(denied.status).toBe(401)
    const okAuth = await GET(new Request("http://x/api/ecosystem/stats-cron", { headers: { authorization: "Bearer s3cret" } }) as never)
    expect(okAuth.status).toBe(200)
    vi.unstubAllEnvs()
    const open = await GET(new Request("http://x/api/ecosystem/stats-cron") as never)
    expect(open.status).toBe(200)
  })
})
```

(⚠️ a rota chama `syncEcosystemStats` REAL — que usa o prisma mockado do arquivo; para o 200, mockar `prisma.ecosystemProject.findMany` → `[]` com `mockResolvedValue` (não `Once`). Ajustar conforme necessário mantendo as asserções.)

- [ ] **Step 5: `k8s/ecosystem-stats-cronjob.yaml`** — cópia de `k8s/marketing-snapshot-cronjob.yaml` com: `name: ecosystem-stats-sync`, `schedule: "17 * * * *"`, comentário de topo ("Hourly ecosystem profile stats: generic per-contract token data + per-project adapters (Arbuzino jackpot). Endpoint is cheap and idempotent-ish (one snapshot per run); retries safe."), e URL `http://subfrost-io.subfrost.svc.cluster.local/api/ecosystem/stats-cron`. Mesmíssimos spot/tolerations/limits/backoff/env PREFETCH_SECRET. Registrar em `k8s/kustomization.yaml` resources.

- [ ] **Step 6: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS; `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add lib/ecosystem/stats-sync.ts app/api/ecosystem/stats-cron/route.ts k8s/ecosystem-stats-cronjob.yaml k8s/kustomization.yaml tests/ecosystem/stats-sync.test.ts
git commit -m "feat(ecosystem): hourly stats collector, cron route and CronJob"
```

---

### Task 4: Mapper + StatHero + integração na página

**Files:**
- Modify: `lib/ecosystem/public.ts` (`getLatestEcosystemStats`)
- Create: `components/ecosystem/StatHero.tsx`
- Modify: `components/ecosystem/EcosystemProfile.tsx` (prop opcional `statHero?: ReactNode`, renderizada entre `</header>` e `<ProfileBody>`)
- Modify: `app/ecosystem/[slug]/page.tsx` (fetch paralelo + copy `stats` EN/ZH)
- Test: `tests/ecosystem/stat-hero.test.tsx` (novo) + 1 caso em `tests/ecosystem/profile-public.test.ts`

**Interfaces:**
- Consumes: `ProjectStats`/`CustomStat` (Task 1); snapshot model (Task 1).
- Produces:
  - `getLatestEcosystemStats(slug: string): Promise<ProjectStats | null>` em `lib/ecosystem/public.ts`.
  - `StatHero({ stats, mainAlkaneId, copy, locale })` server component; `StatHeroCopy { holders: string; supply: string; price: string }`.
  - `EcosystemProfile` aceita `statHero?: ReactNode`.

- [ ] **Step 1: Testes que falham**

`tests/ecosystem/stat-hero.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatHero } from "@/components/ecosystem/StatHero"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

const copy = { holders: "Holders", supply: "Supply", price: "Price" }
const stats = (over: Partial<ProjectStats>): ProjectStats => ({
  generic: {
    "2:25349": { name: "ARBUZ", symbol: "ARBUZ", holders: 1234, supply: "100000", priceUsd: 0.0102, marketcapUsd: 2500, volume24hUsd: 19 },
  },
  custom: [
    { key: "jackpot", label: "Tier-5 jackpot", labelZh: "五中头奖池", value: "15.04", unit: "DIESEL" },
    { key: "tickets", label: "Tickets (round / all-time)", value: "42 / 1337" },
  ],
  ...over,
})

describe("StatHero", () => {
  it("renders custom cards first, then generic fill up to 4 cards", () => {
    render(<StatHero stats={stats({})} mainAlkaneId="2:25349" copy={copy} locale="en" />)
    const labels = screen.getAllByTestId("stat-label").map((n) => n.textContent)
    expect(labels).toEqual(["Tier-5 jackpot", "Tickets (round / all-time)", "Holders", "Supply"])
    expect(screen.getByText("15.04 DIESEL")).toBeInTheDocument()
    expect(screen.getByText("1.2k")).toBeInTheDocument() // holders compacto
  })

  it("uses zh labels when locale=zh and labelZh exists", () => {
    render(<StatHero stats={stats({})} mainAlkaneId="2:25349" copy={{ holders: "持有者", supply: "供应量", price: "价格" }} locale="zh" />)
    expect(screen.getByText("五中头奖池")).toBeInTheDocument()
    expect(screen.getByText("Tickets (round / all-time)")).toBeInTheDocument() // sem labelZh → EN
  })

  it("renders nothing when stats null or no cards derivable", () => {
    const { container } = render(<StatHero stats={null} mainAlkaneId="2:25349" copy={copy} locale="en" />)
    expect(container.innerHTML).toBe("")
    const { container: c2 } = render(<StatHero stats={{ generic: {}, custom: [] }} mainAlkaneId={null} copy={copy} locale="en" />)
    expect(c2.innerHTML).toBe("")
  })
})
```

Em `tests/ecosystem/profile-public.test.ts` (mock do prisma no topo ganha `ecosystemStatSnapshot: { findFirst: vi.fn() }`):

```ts
describe("getLatestEcosystemStats", () => {
  it("returns the newest snapshot stats or null", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce({ id: "p1" } as never)
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockResolvedValueOnce({ stats: { generic: {}, custom: [] } } as never)
    expect(await getLatestEcosystemStats("arbuzino")).toEqual({ generic: {}, custom: [] })
    expect(prisma.ecosystemStatSnapshot.findFirst).toHaveBeenCalledWith({
      where: { projectId: "p1" }, orderBy: { takenAt: "desc" },
    })
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    expect(await getLatestEcosystemStats("nope")).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar — FALHA.**

- [ ] **Step 3: Implementar**

`lib/ecosystem/public.ts` (append; import `type ProjectStats` de stats-types):

```ts
export async function getLatestEcosystemStats(slug: string): Promise<ProjectStats | null> {
  const p = await prisma.ecosystemProject.findFirst({ where: { slug, published: true }, select: { id: true } })
  if (!p) return null
  const snap = await prisma.ecosystemStatSnapshot.findFirst({
    where: { projectId: p.id },
    orderBy: { takenAt: "desc" },
  })
  return snap ? (snap.stats as unknown as ProjectStats) : null
}
```

`components/ecosystem/StatHero.tsx`:

```tsx
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

export interface StatHeroCopy {
  holders: string
  supply: string
  price: string
}

/** "1234567" → "1.2M"; mantém 2-4 casas para valores pequenos; não-numérico passa direto. */
function formatCompact(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  if (Number.isInteger(n)) return String(n)
  return String(n)
}

export function StatHero({ stats, mainAlkaneId, copy, locale }: {
  stats: ProjectStats | null
  mainAlkaneId: string | null
  copy: StatHeroCopy
  locale: "en" | "zh"
}) {
  if (!stats) return null
  const cards: { label: string; value: string }[] = []
  for (const c of stats.custom) {
    cards.push({
      label: locale === "zh" && c.labelZh ? c.labelZh : c.label,
      value: c.unit ? `${formatCompact(c.value)} ${c.unit}` : c.value,
    })
  }
  const g = mainAlkaneId ? stats.generic[mainAlkaneId] : undefined
  if (g) {
    if (cards.length < 4 && g.holders != null) cards.push({ label: copy.holders, value: formatCompact(String(g.holders)) })
    if (cards.length < 4 && g.supply) cards.push({ label: copy.supply, value: formatCompact(g.supply) })
    if (cards.length < 4 && g.priceUsd != null) cards.push({ label: copy.price, value: `$${g.priceUsd < 1 ? g.priceUsd.toFixed(4) : g.priceUsd.toFixed(2)}` })
  }
  if (cards.length === 0) return null
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.slice(0, 4).map((c) => (
        <div key={c.label} className="rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-4 py-3.5">
          <p data-testid="stat-label" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">{c.label}</p>
          <p className="mt-1 text-[22px] font-medium tracking-[-0.015em] text-[color:var(--ed-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}
```

⚠️ Conferir contra o teste: holders 1234 → `formatCompact` dá `"1.2k"` ✓; jackpot `"15.04"` não-inteiro < 1e3 → `String(15.04)` = `"15.04"` ✓ (+ " DIESEL").

`components/ecosystem/EcosystemProfile.tsx`: assinatura ganha `statHero?: ReactNode`; renderizar `{statHero ?? null}` logo após `</header>`.

`app/ecosystem/[slug]/page.tsx`: import `getLatestEcosystemStats` + `StatHero`; copy ganha `stats: { holders: "Holders", supply: "Supply", price: "Price (USD)" }` (EN) / `stats: { holders: "持有者", supply: "供应量", price: "价格 (USD)" }` (ZH); no page component:

```tsx
  const [p, stats] = await Promise.all([
    getEcosystemProfile(slug, locale),
    getLatestEcosystemStats(slug),
  ])
  if (!p) notFound()
  // ...
  <EcosystemProfile p={p} copy={copy[locale]} backHref={backHref}
    statHero={<StatHero stats={stats} mainAlkaneId={p.alkaneId} copy={copy[locale].stats} locale={locale} />} />
```

(`ProfileCopy` ganha `stats: StatHeroCopy` — import type de StatHero.)

- [ ] **Step 4: Verde + regressão** — `npx vitest run tests/ecosystem/` PASS; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/ecosystem/public.ts components/ecosystem/StatHero.tsx components/ecosystem/EcosystemProfile.tsx 'app/ecosystem/[slug]/page.tsx' tests/ecosystem/stat-hero.test.tsx tests/ecosystem/profile-public.test.ts
git commit -m "feat(ecosystem): on-chain stat hero on project profiles"
```

---

### Task 5: Gates + PR + deploy + ativação (orquestrador)

- [ ] `npx vitest run tests/ecosystem/ tests/i18n/` verde · `npx tsc --noEmit` · eslint nos tocados sem findings · `pnpm build` verde (rota + /api/ecosystem/stats-cron na tabela)
- [ ] Push + `gh pr create --head feat/ecosystem-profile-v2b` + CI paridade (4 allow-listed; lint agora é gate REAL pós-#187)
- [ ] Review final Opus da branch → merge squash → esperar "Deploy to GCP" → bump QUOTED full-SHA → Flux APLICAR o tag novo (⚠️ poll da imagem do deployment ANTES do rollout status — o status responde "rolled out" pro rollout velho) → rollout
- [ ] Ativação: `curl` na rota stats-cron (in-pod ou via ingress com Bearer) → 1º snapshot materializado
- [ ] Verificação prod: /ecosystem/arbuzino com stat hero (jackpot DIESEL real, tickets, fee vault, holders); projeto sem stats → sem hero; EN+ZH labels; CronJob criado (`kubectl get cronjob ecosystem-stats-sync`)
