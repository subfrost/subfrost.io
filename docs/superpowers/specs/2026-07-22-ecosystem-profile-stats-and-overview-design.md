# Ecosystem profile: honest stats and a single description

**Date:** 2026-07-22
**Origin:** Gabe's structural feedback on `/ecosystem/<slug>` profile pages.

> "Inaccurate info at the bottom here. I dont think that info belongs on these contract pages
> anyways. Other than maybe how many times the contract has been called."
>
> "I would also merge these into the overview section at the bottom. I noticed there is a lot of
> overlap between these descriptions."

Two structural changes plus one genuine bug fix uncovered while investigating.

---

## Problem

### 1. The stat hero shows numbers that are wrong, useless, or both

`StatHero` renders up to four cards. Two sources feed it:

- `stats.custom[]` — per-slug adapters (`lib/ecosystem/adapters/`), hand-written and exact by
  construction. Only `arbuzino` has any today.
- `stats.generic[mainAlkaneId]` — `holders` / `supply` / `priceUsd`, fetched generically from
  `getAlkaneDetails` (oyl.alkanode.com) for every project that has an `alkaneId`.

Eight published projects have an `alkaneId`. Their most recent snapshots:

| slug | alkaneId | holders | supply | priceUsd |
|---|---|---:|---:|---:|
| `diesel` | 2:0 | 8383 | 66916515276188 | 51.139 |
| `fire` | 2:77623 | 1586 | 5747412236840 | 39.298 |
| `frbtc` | 32:0 | 2698 | 10034558165 | 51881.886 |
| `arbuz` | 2:25349 | 257 | 25150000000000 | **0** |
| `acai` | 2:21219 | 1350 | 9677 | **0** |
| `goji` | 2:10663 | 1350 | 9657 | **0** |
| `alkane-pandas` | 2:614 | **1** | **10** | **0** |
| `wunsch-vault` | 4:777 | **0** | **0** | **0** |

Two distinct defects are tangled here.

**Defect A — a real bug.** `StatHero.tsx:68` gates the price card on `g.priceUsd != null`. The value
is `0`, not `null`, so it passes the guard and renders **`$0.0000`**. A price of zero means "no
market, or unknown", never "worth nothing". This affects five of the eight. The same class of bug
gives `wunsch-vault` a hero reading `HOLDERS 0 / SUPPLY 0 / PRICE $0.0000`.

**Defect B — a modelling error.** Holders, supply and price are *token* metrics. They mean something
for a fungible asset people trade. They mean nothing for a contract you call. `alkane-pandas` is an
NFT collection: `holders 1 / supply 10` is very likely an accurate answer about the collection
contract itself, and a useless answer about the collection. Gabe read it as inaccurate, which is the
correct reaction even if the number is technically what the upstream returned.

Fixing A alone is not enough: `alkane-pandas` would still show `HOLDERS 1 / SUPPLY 10`.

### 2. The short description and the Overview tab say the same thing

`EcosystemProfile.tsx:66` renders `p.description` in the header. `ProfileBody` then runs
`splitProfileSections(p.profile)`; the markdown before the first `##` becomes an "Overview" tab.
When a project has both, the reader gets the same paragraph twice, a few hundred pixels apart.

Inugami, from the screenshot:

- description: *"A coinbase message bounty: users escrow DIESEL against a message, and a miner claims
  it by writing that message into the block's coinbase. Powers the bounty mechanic in the ARBUZ game."*
- Overview intro: *"Inugami turns the Bitcoin coinbase into a message board with a price on it. A user
  escrows DIESEL against a specific message, ..."*

**Eight of 25 published projects** have both: `acai`, `alka-trade`, `arbuzino`, `aries`, `diesel`,
`fire`, `goji`, `inugami`.

`description` cannot simply be deleted: it is the copy on every directory card, and 17 projects have
no profile markdown at all.

### 3. "How many times the contract has been called" is not available

Gabe's suggested replacement metric was investigated and **rejected on evidence**, not on effort.

The scanner already records it in principle: each cached block carries
`nonDieselTargets: Record<"block:tx", count>`, and `contracts-daily.json` publishes a daily roll-up:

```json
{"date": "2026-07-20", "targets": {"4:65522": 39, "32:0": 28, "2:79320": 23, ...}}
```

But the daily scan samples one block in six. Across all of July it observed **50 distinct alkane IDs,
about 11 per day**. Every ecosystem project queried returns zero:

| id | project | calls in July |
|---|---|---:|
| `2:614` | Alkane Pandas | 0 |
| `2:25349` | ARBUZ | 0 |
| `2:77623` | FIRE | 0 |
| `4:777` | wunsch vault | 0 |
| `2:69834` | Inugami | 0 |

(`2:0`/DIESEL is zero by construction; the field counts *non*-DIESEL targets.)

Low-volume contracts essentially never land in a 1-in-6 sample. A truthful call count needs an
unsampled index of every protostone target. The metashrew census does not compute it either: its
eleven fields carry no per-target counts. This is new indexing infrastructure, not a display change,
and it is explicitly **out of scope**. Gabe should be told this rather than left expecting it.

---

## Design

### A. Plausibility guard in `StatHero` (bug fix, stands alone)

A generic card renders only when its value carries information:

- `holders` — render when `> 0`
- `supply` — render when it parses to a finite number `> 0`
- `priceUsd` — render when `> 0`

Zero and null both mean "we do not know", and neither earns a card. If every card is filtered out the
hero returns `null`, exactly as it already does when `stats` is missing.

This alone removes the `$0.0000` from five projects and removes `wunsch-vault`'s hero entirely.

Custom adapter stats are **not** filtered. They are hand-written per slug and a legitimate zero (a
jackpot that is empty right now) is real information.

### B. `showMarketStats` on `EcosystemProject`

New `Boolean @default(false)` column, surfaced as a checkbox in `/admin/ecosystem`. Generic
holders/supply/price render only when it is `true`. Custom stats ignore the flag.

Enabled for the four fungible, traded tokens: `diesel`, `fire`, `frbtc`, `arbuz`.

**Why an explicit flag rather than a heuristic.** The obvious derived signal is "does a price pool
resolve" — the same test `PriceChart` already uses. It fails on the data we have: `arbuz` is
unambiguously a token (257 holders, 2.5e13 supply, a working price chart via its derived pool) yet its
snapshot `priceUsd` is `0`, because the snapshot and the candles read different upstreams. Any
price-derived gate hides `arbuz` incorrectly. Category is no better: `arbuz` is filed under `Other`.

The flag also matches how `/ecosystem` already works. Category, status, featured, contracts and copy
are all curated by hand; a token/not-token judgement belongs in the same place. Default `false` means
a newly added project never shows market stats until someone deliberately says it is a market.

**Migration.** Additive and nullable-safe (`@default(false)`), so it follows the established pattern:
`ALTER TABLE "EcosystemProject" ADD COLUMN IF NOT EXISTS "showMarketStats" BOOLEAN NOT NULL DEFAULT false`
applied in-pod **before** the image rolls, so the old image (which never selects the column) and the
new one (which does) are both safe.

### C. Description renders only when there is no Overview

`splitProfileSections(p.profile)` currently runs inside `ProfileBody`. Lift the call into
`EcosystemProfile` and pass `intro`/`sections` down, so the header can ask whether an Overview exists:

- Overview present → header omits `p.description`; the Overview owns the prose.
- No Overview → header renders `p.description` as today.

Directory cards are untouched; `description` keeps its job there. No content is rewritten and nothing
is deleted from the database, so the change is fully reversible by reverting the component.

The eight duplicating projects lose the header paragraph. The other 17 are unaffected.

---

## Out of scope

- Contract call counts (see Problem 3).
- Rewriting any project's copy. This is a rendering change.
- The price chart, which already self-gates on pool resolution and behaves correctly.
- The directory grid and featured band.

---

## Testing

- The guard lives in a new `lib/ecosystem/stat-visibility.ts` as an exported pure function
  `isMeaningfulStat(value: number | string | null | undefined): boolean`, so it is testable without
  rendering. One signature covers all three fields, since the rule is identical ("parses to a finite
  number greater than zero"). `StatHero` imports it; it does not reimplement the rule inline. Unit
  tests: `0`, `"0"`, `null`, `undefined`, negative, non-numeric string, empty string, and valid
  number and numeric-string values.
- `StatHero` renders nothing when every generic value is filtered and `custom` is empty.
- `StatHero` still renders custom cards with a legitimate `0`, proving the guard did not leak into
  the curated path.
- A `showMarketStats: false` project with perfectly good generic numbers renders no generic cards.
- `EcosystemProfile` renders the description when `profile` is empty or starts with `##`, and omits it
  when an intro exists — the exact split `splitProfileSections` reports, so the two cannot disagree.
- Existing ecosystem suite stays green.

## Verification

Local rendering tests plus, after deploy, a check of the four affected page shapes in production:
`/ecosystem/alkane-pandas` (no hero at all), `/ecosystem/diesel` (hero intact, three cards, deltas
intact), `/ecosystem/inugami` (single prose block, no duplicate paragraph), `/ecosystem/frbtc`
(description still present, since it has no Overview).
