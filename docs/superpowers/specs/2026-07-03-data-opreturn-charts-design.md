# Spec addendum — OP_RETURN activity charts on subfrost.io/data

**Date:** 2026-07-03 · Extends `2026-07-03-public-data-page-design.md`.

## Decision record

The original spec barred OP_RETURN/decoder data from the public page until the decoder is "officialized". **Vitor (CMO) revoked that bar on 2026-07-03** for chart-level aggregates, accepting that /data is publicly reachable, on one condition adopted for credibility: the section carries a **methodology note** stating the data comes from the open-source sampled scanner ("sampled data / beta"), with a link to the public scanner repo. The exact full-chain engine (separate workstream) will later replace the source transparently (same ingestion contract) and the note gets upgraded — a deliberate "now with exact numbers" announcement moment.

## Scope

Add an "Alkanes on-chain activity" section to `/data` with **9 charts**, all derived from the existing `OpReturnDaily` table (ingested daily 06:30 UTC from the scanner CSV since PR #138; ~187 days of history):

1. Alkanes share of all Bitcoin transactions (daily %) — line
2. Alkanes share of OP_RETURN transactions (daily %) — line
3. Latest day: OP_RETURN transactions split, Alkanes vs other — donut
4. DIESEL mints as share of all Bitcoin transactions (daily %) — line
5. OP_RETURN bytes, cumulative all-time — area
6. OP_RETURN bytes per OP_RETURN transaction (daily) — line
7. Miner fee revenue per day (BTC) — line
8. Miner fee revenue split: Alkanes vs rest (BTC, stacked) — stacked area
9. Alkanes share of miner fee revenue (daily %) — line

**Skipped (source lacks columns):** "block space by weight" and "UNCOMMON•GOODS mints that are DIESEL" from the reference dashboard — the scanner computes these internally but does not export them in `history.csv`. They join when the exact engine (or an extended CSV) provides the columns; the section's grid must accept new charts without refactor.

## Constraints

- Data source = `OpReturnDaily` via existing `listOpReturnDaily()` — NO new ingestion, NO schema change, NO touching the scanner repo (other workstream).
- Section is server-rendered into the existing `/data` page; hidden entirely when the table is empty. Never 500s.
- Methodology note (EN/ZH) with link to https://github.com/Vdto88/alkanes-opreturn-stats — wording approved shape: "Sampled data from our open-source OP_RETURN scanner. An exact full-chain engine is in the works."
- `/api/data` contract unchanged (charts are page-only for now; API exposure can come later if needed).
- Same visual language as the metric cards; recharts; i18n EN/ZH via the page's copy-object pattern.
- Everything else inherits the parent spec (PR-only, gates, deploy pattern).
