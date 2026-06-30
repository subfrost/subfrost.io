# tlsd access-log shipper — Plano 1 (lado subfrost.io: template ES + esSource)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar o lado subfrost.io pra Peça C — adicionar o campo `kind` ao template ES e fazer o `esSource` filtrar por `instance`/`kind` — de forma **forward-compatible** (no-op em prod até o cutover), sem tocar no tlsd.

**Architecture:** Duas mudanças isoladas e seguras: (1) o índice template `subfrost-cdn` (`dynamic=strict`) ganha o campo `kind` (keyword) pra aceitar os docs do tlsd; (2) o `esSource` (lib/analytics/es.ts) compõe os filtros de query a partir de um helper puro `analyticsFilters(range)` que lê `process.env.ANALYTICS_INSTANCE` — quando setado, filtra por `instance`, e quando for um produtor tlsd (≠ `edge-middleware`), também por `kind:page`. Com a env **unset** (default de prod), o comportamento é **semanticamente equivalente ao de hoje** (o filtro de range passa a vir envolto num `bool.filter` de cláusula única — idêntico em matching/agregação, sem scoring).

**Tech Stack:** Next.js 16, TypeScript, vitest (testes), Elasticsearch index template (JSON em ConfigMap k8s), Flux/GitOps.

## Global Constraints

- **Sem regressão em prod.** Com `ANALYTICS_INSTANCE` **não setado**, o `esSource` deve produzir queries **semanticamente equivalentes** às de hoje (o filtro de range passa a vir envolto num `bool.filter` de cláusula única — idêntico em matching/agregação, sem scoring). Esse é o comportamento atual em produção e não pode mudar até o cutover (Plano 2).
- **Mapping é `dynamic=strict` no topo.** Campo novo (`kind`) tem que entrar no template **antes** de qualquer doc com `kind` chegar, senão o ES rejeita o doc.
- **Paridade de métricas.** Todas as métricas do dashboard (visitors, sessions, pageviews, top-pages, article-engagement) filtram `kind:page` quando lendo docs do tlsd — preserva os números da era-middleware. A base completa (bots/assets) fica no ES pra views futuras, fora deste plano.
- **PR obrigatório** (branch→PR→merge; nunca push direto na main). Branch já criada: `feat/tlsd-access-log-shipper`.
- **Deploy é GitOps:** Flux reconcilia da `main`. O `kind` no template só vale pra índices novos; re-rodar o `es-bootstrap-job` aplica o template.
- `process.env.ANALYTICS_INSTANCE` valores válidos: unset | `edge-middleware` | `tlsd-core`.

---

### Task 1: Adicionar `kind` ao template ES `subfrost-cdn`

**Files:**
- Modify: `k8s/telemetry/index-template-configmap.yaml:66` (adicionar `kind` após `instance`)

**Interfaces:**
- Consumes: nada.
- Produces: o template `subfrost-cdn` passa a ter `kind` (keyword) — consumido pelos docs do tlsd (Plano 2) e pelo filtro do esSource (Task 2).

- [ ] **Step 1: Adicionar o campo `kind` ao mapping**

No arquivo `k8s/telemetry/index-template-configmap.yaml`, dentro do template `subfrost-cdn` (`"properties"`), adicionar a linha do `kind` logo após `instance` (linha 66). O bloco fica assim:

```json
            "service":          { "type": "keyword", "ignore_above": 64 },
            "instance":         { "type": "keyword", "ignore_above": 128 },
            "kind":             { "type": "keyword", "ignore_above": 16 },
            "headers_truncated":{ "type": "boolean" },
            "headers":          { "type": "object", "dynamic": true }
```

(`ignore_above: 16` cobre `page`/`api`/`asset`/`other` com folga.)

- [ ] **Step 2: Validar o JSON do template embutido no YAML**

O template é um JSON dentro de um bloco `data:` do ConfigMap. Validar que o JSON continua parseável. Rodar:

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
python -c "import yaml,json,sys; d=yaml.safe_load(open('k8s/telemetry/index-template-configmap.yaml')); [json.loads(v) for v in d['data'].values()]; print('JSON OK')"
```

Expected: `JSON OK` (sem exceção). Se o ConfigMap tiver múltiplas chaves em `data`, o comando valida todas.

- [ ] **Step 3: Validar que `kind` está no template parseado**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
python -c "import yaml,json; d=yaml.safe_load(open('k8s/telemetry/index-template-configmap.yaml')); blob=[v for v in d['data'].values() if 'subfrost-cdn' in v][0]; t=json.loads(blob); import json as j; print('kind' in j.dumps(t))"
```

Expected: `True`.

- [ ] **Step 4: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add k8s/telemetry/index-template-configmap.yaml
git commit -m "feat(telemetry): add kind field to subfrost-cdn ES template (Peça C)"
```

> **Nota de cutover (Plano 2):** aplicar o template novo = re-rodar o `es-bootstrap-job` (faz `PUT _index_template/subfrost-cdn`). O template governa índices **novos**; pro índice do dia já criado, fazer também `PUT subfrost-cdn-<hoje>/_mapping` com `{"properties":{"kind":{"type":"keyword","ignore_above":16}}}` (adicionar campo a mapping strict é permitido). Isso é passo do Plano 2 — aqui só mudamos o ConfigMap.

---

### Task 2: `esSource` filtra por `instance`/`kind` via helper puro

**Files:**
- Modify: `lib/analytics/es.ts` (adicionar `analyticsFilters` + trocar `rangeQuery` por `analyticsQuery` nas 4 funções de fetch)
- Test: `tests/analytics/es-source.test.ts` (novo)

**Interfaces:**
- Consumes: `esRangeBounds` de `lib/analytics/es-client.ts`; `DateRange` de `lib/analytics/source.ts`.
- Produces: `analyticsFilters(r: DateRange): Array<Record<string, unknown>>` (exportada, pura, lê `process.env.ANALYTICS_INSTANCE`) e `analyticsQuery(r: DateRange): { bool: { filter: ... } }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/analytics/es-source.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { analyticsFilters } from "@/lib/analytics/es"
import type { DateRange } from "@/lib/analytics/source"

const R: DateRange = { start: "28daysAgo", end: "today", preset: "28d" }

describe("analyticsFilters", () => {
  const prev = process.env.ANALYTICS_INSTANCE
  beforeEach(() => { delete process.env.ANALYTICS_INSTANCE })
  afterEach(() => { if (prev === undefined) delete process.env.ANALYTICS_INSTANCE; else process.env.ANALYTICS_INSTANCE = prev })

  it("unset → só filtro de range (paridade com prod)", () => {
    const f = analyticsFilters(R)
    expect(f).toHaveLength(1)
    expect(f[0]).toHaveProperty("range.ts")
  })

  it("edge-middleware → range + instance, SEM kind", () => {
    process.env.ANALYTICS_INSTANCE = "edge-middleware"
    const f = analyticsFilters(R)
    expect(f).toHaveLength(2)
    expect(f[1]).toEqual({ term: { instance: "edge-middleware" } })
    expect(f.some((x) => JSON.stringify(x).includes('"kind"'))).toBe(false)
  })

  it("tlsd-core → range + instance + kind:page", () => {
    process.env.ANALYTICS_INSTANCE = "tlsd-core"
    const f = analyticsFilters(R)
    expect(f).toHaveLength(3)
    expect(f[1]).toEqual({ term: { instance: "tlsd-core" } })
    expect(f[2]).toEqual({ term: { kind: "page" } })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx vitest run tests/analytics/es-source.test.ts
```

Expected: FAIL — `analyticsFilters` não existe / não é exportado de `@/lib/analytics/es`.

- [ ] **Step 3: Implementar `analyticsFilters` + `analyticsQuery` em `lib/analytics/es.ts`**

Em `lib/analytics/es.ts`, **substituir** a linha:

```typescript
const rangeQuery = (r: DateRange) => ({ range: { ts: esRangeBounds(r) } })
```

por:

```typescript
/** Composição dos filtros de query do dashboard. ANALYTICS_INSTANCE unset =
 *  comportamento de prod (só range, agrega todo subfrost-cdn-*). Setado =
 *  filtra o produtor (instance); se for um produtor tlsd (≠ edge-middleware),
 *  também filtra kind:page (paridade de métricas com a era-middleware). */
export function analyticsFilters(r: DateRange): Array<Record<string, unknown>> {
  const filters: Array<Record<string, unknown>> = [{ range: { ts: esRangeBounds(r) } }]
  const instance = process.env.ANALYTICS_INSTANCE
  if (instance) {
    filters.push({ term: { instance } })
    if (instance !== "edge-middleware") filters.push({ term: { kind: "page" } })
  }
  return filters
}
const analyticsQuery = (r: DateRange) => ({ bool: { filter: analyticsFilters(r) } })
```

- [ ] **Step 4: Trocar `rangeQuery` por `analyticsQuery` nas 3 aggs simples**

Em `lib/analytics/es.ts`, nas funções `fetchVisitors`, `fetchTopPages`, `fetchTrafficSources`, trocar `query: rangeQuery(r)` por `query: analyticsQuery(r)`. (São 3 ocorrências de `query: rangeQuery(r)`.)

- [ ] **Step 5: Incluir os filtros na agg de article-engagement**

Em `lib/analytics/es.ts`, na função `fetchArticleEngagement`, o `pvRes` usa:

```typescript
      query: { bool: { filter: [rangeQuery(r), { prefix: { path_src: "/articles/" } }] } },
```

Trocar por:

```typescript
      query: { bool: { filter: [...analyticsFilters(r), { prefix: { path_src: "/articles/" } }] } },
```

E a função `collectArticleSessions` usa `query: rangeQuery(r)` — trocar por `query: analyticsQuery(r)`.

- [ ] **Step 6: Confirmar que não sobrou `rangeQuery`**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
grep -n "rangeQuery" lib/analytics/es.ts
```

Expected: nenhuma saída (zero ocorrências — `rangeQuery` foi totalmente substituído).

- [ ] **Step 7: Rodar os testes novos e confirmar que passam**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx vitest run tests/analytics/es-source.test.ts
```

Expected: PASS (3 testes).

- [ ] **Step 8: Rodar a suíte de analytics inteira (sem regressão)**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx vitest run tests/analytics
```

Expected: PASS (todos, incl. os ga4 existentes).

- [ ] **Step 9: Typecheck**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/analytics/es.ts tests/analytics/es-source.test.ts
git commit -m "feat(analytics): esSource filtra por instance/kind (forward-compat, no-op em prod) — Peça C"
```

---

## Self-Review

**Spec coverage (do spec §4.1 U5 + U6):**
- U5 (template `kind`) → Task 1. ✅
- U6 (esSource filtro `kind` + pin `instance`) → Task 2. ✅
- Semântica "todas as métricas filtram kind:page no tlsd" (open question #5 do spec, fechada) → `analyticsFilters` aplica o filtro em todas as 4 aggs. ✅
- Itens NÃO cobertos aqui (de propósito, são do Plano 2): patch Rust do tlsd, config `[telemetry]` no `tlsd.yaml`, build da imagem, re-rodar bootstrap/PUT mapping no índice do dia, cutover/flip do `ANALYTICS_INSTANCE`, remoção do middleware.

**Placeholder scan:** sem TBD/TODO. Todo código mostrado por completo. ✅

**Type consistency:** `analyticsFilters(r: DateRange)` definida na Task 2 e usada na Task 2; retorna `Array<Record<string, unknown>>`; `analyticsQuery` envelopa em `{ bool: { filter } }`. Os testes batem os nomes/shapes. `DateRange` importado de `@/lib/analytics/source` (igual ao es.ts). ✅

**Risco residual:** o `grep` do Step 6 garante que nenhuma agg ficou sem o filtro novo. Os testes de paridade (unset) garantem zero regressão em prod.
