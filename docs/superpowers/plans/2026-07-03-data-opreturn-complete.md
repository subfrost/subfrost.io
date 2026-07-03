# OP_RETURN Completion — new CSV columns + last 2 charts + sync fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the scanner CSV's 4 new columns (`weightTotal,weightAlkanes,ugMints,dieselUg`), FIX the sync parser (it currently skips every row because it requires exactly 15 cells and the CSV now has 19 — the daily sync is broken until this ships), and add the 2 missing charts to /data: "Alkanes' share of block space (by weight)" and "UNCOMMON•GOODS mints that are DIESEL".

**Context:** The upstream CSV (https://vdto88.github.io/alkanes-opreturn-stats/history.csv) now has 19 header columns; historical rows are fully backfilled; the current (partial) day's row has the 4 new fields EMPTY (`,,,,` — empty string means "no data", never coerce to 0). Reference dashboard for chart fidelity: `.superpowers/sdd/dash-reference.html`.

## Global Constraints

- **Parser must accept both**: the legacy 15-column CSV AND the new 19-column CSV (header-based column mapping, not positional count). A row missing any of the 15 BASE columns' values is skipped; the 4 OPTIONAL columns map `""`/absent/non-finite → `null`.
- New Prisma fields are NULLABLE and additive (no data loss): `weightTotal Float?`, `weightAlkanes Float?`, `ugMints Int?`, `dieselUg Int?` on `OpReturnDaily`. CI's deploy workflow runs `prisma db push` on merge — additive nullable columns are safe.
- `OpReturnRow` gains the 4 fields as OPTIONAL (`weightTotal?: number | null` etc.) so every existing constructor/fixture keeps compiling; `OPRETURN_COLUMNS` (the 15 base names) must NOT change — add a separate `OPRETURN_OPTIONAL_COLUMNS` list.
- Chart derivations: weightShare = `ratio(weightAlkanes, weightTotal)`; ugDieselShare = `ratio(dieselUg, ugMints)` — null when either side is null/0. Stats (ratio-of-sums over rows where BOTH fields are non-null): `stats.weight = { full, latest }` (latest = last row with non-null weight data), `stats.ug = { early30, last30, full }` (early30 = first 30 rows with non-null UG data).
- Chart placement (reference order): weight chart is #3 (right after "Alkanes' share of OP_RETURN"); UG chart is #6 (right after "DIESEL mints — share of all Bitcoin transactions"). Both single-line pct charts, accent #5dcaa5, same Card/desc pattern as the section's other charts.
- Description templates (port from reference, numbers → tokens; EN + real ZH):
  - Weight: "This is the literal block space Alkanes occupy — transaction weight, the unit Bitcoin's block limit is actually denominated in (not byte counts, not transaction counts). Alkanes were {weightShareFull} of all block weight over the period and {weightShareLatest} on the last measured day. This is the honest \"how much of Bitcoin is Alkanes\" answer: by weight they are still a minority of block space, far below their share of transaction count (most Alkanes tx are tiny DIESEL mints). Measured directly from each transaction's weight via a metashrew/alkanes-rs indexer."
  - UG: "UNCOMMON•GOODS (Rune 1:0) rides along on almost every DIESEL mint. Of all UNCOMMON•GOODS mints each day, the share that are also DIESEL climbed from {ugShareEarly} early on to {ugShareRecent} recently ({ugShareFull} over the whole period): when you see an UNCOMMON•GOODS mint today, it is almost always DIESEL \"wearing Runes clothing.\" Detected as a runestone whose mint is Rune 1:0 on a DIESEL (cellpack 2:0 op 77) transaction."
- Percent tokens formatted "x.x%" like the section's other stat tokens. Missing values → "—".
- Never throw / never 500; section behavior unchanged when the new fields are all null (the 2 new charts render with gaps or, if a chart's series is entirely null, its card still renders with an empty chart — recharts tolerates all-null with connectNulls; do NOT add special hiding logic).
- Worktree `C:\Alkanes Geral Dev\wt-public-data-page`, branch `feat/data-opreturn-complete`, pnpm, PR-only. Allowed pre-existing failures: the 4 admin-nav/admin-landing (suite with `CI=true`).

---

### Task 1: Schema + types + sync parser v2 (the urgent fix)

**Files:**
- Modify: `prisma/schema.prisma` (OpReturnDaily: add the 4 nullable fields, with a comment noting empty-CSV-cell → null)
- Modify: `lib/marketing/opreturn-types.ts` (OpReturnRow optional fields + `OPRETURN_OPTIONAL_COLUMNS`)
- Modify: `lib/marketing/opreturn-sync.ts` (header-based parser + upsert incl. new fields)
- Modify: `lib/marketing/opreturn-store.ts` (its `map(r: DbRow)` must pass the 4 fields through — read the file; DbRow comes from prisma so fields exist after schema change)
- Test: extend `tests/marketing/opreturn-sync.test.ts` (or the existing sync test file — find it with `ls tests/marketing/`)

**Parser contract (rewrite `parseHistoryCsv`):**
```ts
export function parseHistoryCsv(text: string): OpReturnRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].split(",")
  const col = new Map(header.map((name, i) => [name, i]))
  for (const base of OPRETURN_COLUMNS) if (!col.has(base)) return []   // unknown schema: refuse all
  const out: OpReturnRow[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split(",")
    const dateCell = cells[col.get("date")!]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCell ?? "")) continue
    const row = { date: dateCell } as OpReturnRow
    let ok = true
    for (const name of OPRETURN_COLUMNS) {
      if (name === "date") continue
      const n = Number(cells[col.get(name)!])
      if (!Number.isFinite(n)) { ok = false; break }
      ;(row as unknown as Record<string, number>)[name] = n
    }
    if (!ok) continue
    for (const name of OPRETURN_OPTIONAL_COLUMNS) {
      const i = col.get(name)
      const cell = i === undefined ? "" : (cells[i] ?? "")
      const n = cell === "" ? NaN : Number(cell)
      ;(row as unknown as Record<string, number | null>)[name] = Number.isFinite(n) ? n : null
    }
    out.push(row)
  }
  return out
}
```
Upsert: spread stays as-is (`const { date, ...rest } = r`) — the optional fields ride along (null values included explicitly so an update can null-out stale values).

**Test cases to add (TDD — write first, watch fail, then implement):** legacy 15-col text parses (optional fields null); 19-col text with values parses them as numbers; trailing `,,,,` (today's row) → the 4 fields null, base fields intact; header missing a base column → `[]`; garbage in an optional cell → null while row survives; garbage in a base cell → row skipped. Keep every existing passing assertion working.

- [ ] Steps: tests first → fail → implement schema/types/parser/store passthrough → `npx prisma generate` → run the sync test file + `npx vitest run tests/marketing/` → green (public-opreturn tests must be untouched and green) → `npx tsc --noEmit` → 0 → commit `fix(data): header-based CSV parser + ingest weight/UG columns (schema additive)`

---

### Task 2: Payload + the 2 new charts

**Files:**
- Modify: `lib/marketing/public-opreturn.ts` (+`weightShare`, `ugDieselShare` line series; `stats.weight`, `stats.ug` per Global Constraints)
- Modify: `tests/marketing/public-opreturn.test.ts` (numeric assertions incl. null-handling when fields absent/null, early30 vs last30 vs full windows)
- Modify: `components/data/OpReturnCharts.tsx` (insert the 2 single-line pct charts at positions 3 and 6; copy interface gains the 2 chart entries)
- Modify: `app/data/page.tsx` (opreturn copy blocks both locales: the 2 titles + desc templates from Global Constraints, ZH real translation; NOTHING else)

- [ ] Steps: payload tests first → fail → lib → green → component + copy → `npx tsc --noEmit` 0 → `CI=true pnpm vitest run 2>&1 | tail -4` (only the 4 allow-listed failures) → `rm -rf .next && pnpm next build 2>&1 | tail -12` (compiles; Windows EPERM tail environmental) → commit `feat(data): block-weight and UNCOMMON•GOODS charts — dashboard complete (11/11)`

---

### Task 3: Gates, push, PR (controller-owned ops after merge: deploy + backfill job + prod verify)

- [ ] `npx tsc --noEmit && CI=true pnpm vitest run 2>&1 | tail -4` → green (4 allow-listed only)
- [ ] Push with embedded token; `gh pr create` titled `fix+feat: OP_RETURN sync parser v2 + block-weight and UG charts (11/11)` — body must flag the URGENT part (parser currently skips all rows of the 19-column CSV; daily sync broken until merged).
