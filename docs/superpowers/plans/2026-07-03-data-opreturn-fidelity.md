# OP_RETURN Section Fidelity Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Alkanes on-chain activity" section of `/data` a faithful port of the original dashboard (https://vdto88.github.io/alkanes-opreturn-stats/): multi-series charts with clickable legends, an All/60-days window selector, per-chart descriptions with computed numbers, day-extrapolated fee charts, a 3-slice donut, sub-header stats line, and a "How it's calculated" block.

**Reference artifact (source of truth for texts and series):** `.superpowers/sdd/dash-reference.html` — a saved copy of the original dashboard. Chart titles are its `<h2>`s; descriptions are the `<p class="chartnote">` following each chart; series names are the Chart.js `label:'…'` strings.

**Architecture:** `lib/marketing/public-opreturn.ts` is REWRITTEN (v2 payload — its only consumer is our own component, changed in the same PR). `components/data/OpReturnCharts.tsx` is rewritten around a window selector + multi-line chart cards with legend toggling. `app/data/page.tsx` gains description templates (EN/ZH) with `{token}` placeholders interpolated from payload stats.

**Tech Stack:** recharts (Legend onClick toggling), Next RSC, vitest.

## Global Constraints

- Charts must match the reference 1:1 in series composition and semantics for the 9 portable charts. The 2 weight/UNCOMMON•GOODS charts stay out (columns pending upstream).
- Fee charts are **extrapolated to full days**: `factor(r) = r.blocksScanned === 0 ? null : 144 / r.blocksScanned`. Miner revenue USD/day = `((feeTotalSats/1e8) * factor + 3.125 * 144) * btcUsd`. Fees split (BTC/day): alkanes = `feeAlkanesSats/1e8 * factor`, rest = `(feeTotalSats-feeAlkanesSats)/1e8 * factor`. (Formulas confirmed by the reference's own chartnotes.)
- Percent values stay fractions in the payload; formatting only in the client.
- Window selector: exactly two options, **All** (default label "All time") and **60 days** — client-side slice of the last 60 points; selector state is client-only (no URL/param).
- Legend click toggles a series' visibility (recharts `Legend onClick` + per-dataKey hidden state); single-series charts show no legend.
- Descriptions: EN texts ported from the reference's chartnotes with the baked numbers replaced by computed tokens; ZH = real translations of the same templates. Token interpolation helper replaces `{name}` from a values map; missing values render "—".
- Methodology note + GitHub link stay; the "How it's calculated" block is added at the end of the section (port the reference's `.how` prose, adapting "we" → "the scanner"; EN/ZH).
- `getPublicOpReturnData()` never throws; section hidden when days === 0; page never 500s. No /api change, no schema change, no new deps.
- Worktree `C:\Alkanes Geral Dev\wt-public-data-page`, branch `feat/data-opreturn-fidelity`, pnpm, PR-only. Allowed pre-existing failures: the 4 in tests/cms/admin-nav + admin-landing (suite with `CI=true`).

---

### Task 1: Payload v2 — rewrite `lib/marketing/public-opreturn.ts`

**Files:**
- Modify (rewrite): `lib/marketing/public-opreturn.ts`
- Modify (rewrite): `tests/marketing/public-opreturn.test.ts`

**Interfaces (Produces — Task 2 imports these):**

```ts
export interface OpReturnPoint { date: string; value: number | null }

export interface PublicOpReturnPayload {
  updatedAt: string | null
  days: number
  header: { firstDate: string | null; lastDate: string | null; totalTxSampled: number }
  dailyShare: { date: string; txShare: number | null; opReturnPenetration: number | null }[]
  opReturnShare: { date: string; txPct: number | null; bytesPct: number | null }[]
  latestDonut: { date: string; diesel: number; alkanesOther: number; other: number } | null
  dieselTxShare: OpReturnPoint[]
  bytesCum: { date: string; opReturn: number; alkanes: number; runes: number }[]
  bytesPerTx: { date: string; alkanes: number | null; rest: number | null }[]
  minerRevenueUsd: OpReturnPoint[]
  feesSplitBtc: { date: string; alkanes: number | null; rest: number | null }[]
  alkanesFeeShare: OpReturnPoint[]
  stats: {
    last30: { alkanesOfOpReturnTx: number | null; alkanesOfOpReturnBytes: number | null; alkanesFeeShare: number | null }
    full: { alkanesFeeShare: number | null; opReturnFeeShare: number | null; alkanesBytesPerTx: number | null }
    latest: { date: string; fromHeight: number; toHeight: number; blocksScanned: number; txWithOpReturn: number; txAlkanes: number; alkanesOfOpReturnTx: number | null } | null
  }
}
export async function getPublicOpReturnData(): Promise<PublicOpReturnPayload>
```

**Derivations (per row r, in date order):**
- dailyShare: txShare = ratio(txAlkanes, totalTx); opReturnPenetration = ratio(txWithOpReturn, totalTx)
- opReturnShare: txPct = ratio(txAlkanes, txWithOpReturn); bytesPct = ratio(alkanesBytes, opReturnBytes)
- latestDonut (from last row, null when its txWithOpReturn === 0): diesel = dieselMints, alkanesOther = max(0, txAlkanes - dieselMints), other = max(0, txWithOpReturn - txAlkanes)
- dieselTxShare: ratio(dieselMints, totalTx)
- bytesCum: three running sums — opReturnBytes, alkanesBytes, runestoneBytes
- bytesPerTx: alkanes = ratio(alkanesBytes, txAlkanes); rest = ratio(opReturnBytes - alkanesBytes, txWithOpReturn - txAlkanes)
- minerRevenueUsd / feesSplitBtc: extrapolated per Global Constraints (value null when blocksScanned === 0)
- alkanesFeeShare: ratio(feeAlkanesSats, feeTotalSats)
- stats: ratio-of-sums over the window (last30 = rows.slice(-30); full = all rows): alkanesOfOpReturnTx = sum(txAlkanes)/sum(txWithOpReturn); alkanesOfOpReturnBytes = sum(alkanesBytes)/sum(opReturnBytes); alkanesFeeShare = sum(feeAlkanesSats)/sum(feeTotalSats); opReturnFeeShare = sum(feeOpReturnSats)/sum(feeTotalSats); alkanesBytesPerTx = sum(alkanesBytes)/sum(txAlkanes). header.totalTxSampled = sum(totalTx).
- Error containment identical to v1 (EMPTY payload; never throws). `ratio(num, den)` returns null on den 0.

- [ ] **Step 1:** Rewrite the test file first: keep the fixture-row helper pattern from the current test; assert numerically (toBeCloseTo, 10 digits) at least: both dailyShare lines, both opReturnShare lines, 3-slice donut (incl. clamping when dieselMints > txAlkanes), the three cumulative sums across 2 rows, bytesPerTx alkanes AND rest (incl. null when txWithOpReturn === txAlkanes), minerRevenueUsd with a hand-computed expected value (e.g. blocksScanned 72 → factor 2, feeTotalSats 160_000_000, btcUsd 60000 → (1.6*2 + 450) * 60000), feesSplitBtc extrapolation, alkanesFeeShare, stats.last30 vs stats.full differing when a 31st row exists, header sums, null-on-zero-denominator cases, empty table, store-throw. Run → FAIL (shape mismatch).
- [ ] **Step 2:** Rewrite the lib per the interfaces + derivations above (pure, small helpers; single pass where natural). Run the test file → PASS. `npx tsc --noEmit` will FAIL at this point because `OpReturnCharts.tsx` still consumes the v1 shape — that is EXPECTED and resolved in Task 2; do NOT run tsc as a gate for this task, run only the test file.
- [ ] **Step 3:** Commit: `feat(data): OP_RETURN payload v2 — multi-series, extrapolated fees, description stats`

---

### Task 2: Component + page — faithful UI

**Files:**
- Modify (rewrite): `components/data/OpReturnCharts.tsx`
- Modify: `app/data/page.tsx` (opreturn copy block replaced by the new template shape; nothing else)

**Requirements:**

1. **Sub-header line** under the section title: `"{firstDate} – {lastDate} · {days} days · {totalTx} transactions sampled · updated daily"` (dates formatted "Dec 29" style via `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })` for EN and `"zh-CN"` for ZH; totalTx grouped).
2. **Window selector**: two pill buttons ("All time" / "60 days"; ZH "全部" / "60 天") top-right of the section; state client-side; when "60 days", every chart's data is `.slice(-60)`; cumulative chart still slices (it shows the tail of the running sum — same as the reference).
3. **Chart cards** in the reference's order (9 portable ones):
   1. *Daily Alkanes share* — 2 lines: "Transactions" (dailyShare.txShare, accent #5dcaa5) + "OP_RETURN penetration" (dailyShare.opReturnPenetration, #aab8d6); pct axis; legend clickable.
   2. *Alkanes' share of OP_RETURN* — 2 lines: "% of OP_RETURN transactions" (txPct, accent) + "% of OP_RETURN bytes" (bytesPct, #f0997b); legend clickable.
   3. *Last day — share of OP_RETURN transactions* — donut, 3 slices: DIESEL mints (#5dcaa5), Alkanes excl. DIESEL (#8fd9c0), Other OP_RETURN (#22304a); center/side text shows Alkanes total % of OP_RETURN tx.
   4. *DIESEL mints — share of all Bitcoin transactions* — 1 line, pct.
   5. *OP_RETURN bytes (all time)* — 3 lines cumulative: "OP_RETURN bytes" (#aab8d6), "Alkanes" (accent), "Runes (bytes)" (#f0997b); bytes axis (GB/MB); legend clickable.
   6. *OP_RETURN bytes per transaction* — 2 lines: "Alkanes" (accent) + "Other OP_RETURN" (#f0997b); numeric axis; legend clickable.
   7. *Miner fee revenue* — 1 line, USD axis (compact $, e.g. "$4.2M").
   8. *Miner fee revenue from fees (BTC) — Alkanes vs rest* — stacked area (alkanes accent on top of rest #f0997b), BTC axis; legend clickable ("Alkanes fees"/"Other fees").
   9. *Alkanes' share of miner fee revenue* — 1 line, pct.
4. **Legend toggling**: shared `<ToggleLineChart>` helper — recharts `<Legend onClick={...}>` toggles a `hidden: Record<string, boolean>` state; `<Line hide={hidden[key]}>`. Single-line charts render without Legend. Add the reference's tip line ("Tip: click a legend item to show/hide its line." / ZH equivalent) under multi-series charts.
5. **Descriptions**: each chart card renders a `desc` paragraph under the chart. Templates live in the page copy (EN ported from the reference's chartnotes in `.superpowers/sdd/dash-reference.html`, with every baked number replaced by a token; ZH translated). Token values come from `payload.stats` / chart data, formatted client-side. Tokens per chart (interpolate with a `fill(template, values)` helper that replaces `{k}` and renders "—" for missing):
   - Chart 2: `{txPct30}` = stats.last30.alkanesOfOpReturnTx, `{bytesPct30}` = stats.last30.alkanesOfOpReturnBytes
   - Chart 3: `{lastDate}`, `{fromHeight}`, `{toHeight}`, `{blocks}`, `{opRetTx}`, `{alkTx}`, `{pct}` from stats.latest ("How this is calculated. Last day = … blocks …–…, N sampled. Of X transactions carrying an OP_RETURN that day, Y were Alkanes → Z%.")
   - Chart 6: `{bytesPerTx}` = stats.full.alkanesBytesPerTx (the "~21.2 bytes/tx" figure)
   - Chart 7: no tokens needed beyond static text (subsidy figure 3.125 BTC is fixed prose)
   - Chart 9: `{feeShareFull}` = stats.full.alkanesFeeShare, `{feeShare30}` = stats.last30.alkanesFeeShare, `{opRetFeeShare}` = stats.full.opReturnFeeShare
   - Charts 1, 4, 5, 8: port the reference text; where it bakes numbers not in `stats`, generalize the sentence to be number-free rather than inventing new stats fields (YAGNI).
6. **"How it's calculated"** block at the end: port the reference's `.how` paragraphs (adapt voice: "The scanner reads every sampled Bitcoin block…"), EN/ZH, plus the existing methodology link line.
7. Everything else on the page unchanged. `npx tsc --noEmit` green at the END of this task (v1→v2 consumer updated).

- [ ] **Step 1:** Extract the 9 relevant chartnote texts + `.how` prose from `.superpowers/sdd/dash-reference.html` (Read it; ignore the two skipped charts' notes).
- [ ] **Step 2:** Rewrite `OpReturnCharts.tsx` per requirements (window selector, ToggleLineChart, donut, stacked, desc interpolation).
- [ ] **Step 3:** Update the `opreturn` copy blocks in `app/data/page.tsx` (EN templates ported; ZH translated; identical shapes).
- [ ] **Step 4:** `npx tsc --noEmit` → 0. `pnpm vitest run tests/marketing/public-opreturn.test.ts tests/api/` → green. `rm -rf .next && pnpm next build 2>&1 | tail -15` → routes compile (Windows standalone EPERM tail = environmental).
- [ ] **Step 5:** `pnpm next start -p 3100` + curl `/data`: 200; grep for "updated daily" (sub-header SSR'd) — if local DB unreachable the section hides (acceptable; note which case). Kill server.
- [ ] **Step 6:** Commit: `feat(data): faithful OP_RETURN section — window selector, multi-series, descriptions, how-it-works`

---

### Task 3: Gates, push, PR

- [ ] `npx tsc --noEmit && CI=true pnpm vitest run 2>&1 | tail -4` → tsc 0; only the 4 allow-listed failures.
- [ ] Push with embedded token (`TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/data-opreturn-fidelity`).
- [ ] `gh pr create` — title `feat: faithful OP_RETURN dashboard port on /data`; body: summary of the fidelity features, reference link, note that weight/UNCOMMON•GOODS charts remain pending upstream CSV columns, gates evidence.
