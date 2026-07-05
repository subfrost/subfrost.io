Bitcoin mainnet (L1) — everything runs on the **ALKANES metaprotocol** (WASM smart contracts indexed by metashrew; state changes are committed via OP_RETURN "protostones" in ordinary Bitcoin transactions).

A casino-themed suite of fully on-chain Bitcoin games: the ARBUZ token mint, Magic Arbuz Cards (on-chain generative tarot NFTs), and **Arbuzino Fireball — an immutable pari-mutuel Powerball-style lottery paid in DIESEL**.

## Products

### 1. ARBUZ token mint
Free-mint alkane on Bitcoin with a twist: the mint transaction carries a Protostone calling **opcode 77** on `2:25349` through the **Acai** contract, which validates that the including block was mined by an approved pool (AntPool, WhitePool, Binance Pool, Mining Squared, BTC.com, Braiins, ULTIMUSPOOL, Poolin). Mint in a non-approved block = tx confirms but the mint is SPOILED. Users choose **public mempool** (cheap, ~60% success) or **Rebar Shield** private routing to partner pools (~80% success). Every ARBUZ mint simultaneously mints DIESEL. Successful mint = 100 ARBUZ.

### 2. Magic Arbuz Cards
Burn **100 ARBUZ → 1 card NFT** on the card factory `2:69849`. Minting is only possible in **clock-in windows every 144 blocks (~24h)** starting from block 907,205. Card traits (background, type, symbols, border/glow, a unique text prediction) are derived deterministically from **SHA-256 of the card's sequential index** — generated fully on-chain (view opcode 1000), no off-chain metadata, no IPFS. Rarity: **Classic** (22 major-arcana tarot), **Glitch** ~13/256 (8 alkanes-ecosystem parody cards, gold border), **Absolute** <1/256 (Fartane / Arbuz).

### 3. Arbuzino Fireball — the on-chain lottery
Powerball-style, **fully pari-mutuel, immutable** (no proxy, no upgrade path, no admin withdraw). Bets are in DIESEL.

- **Pick 6 distinct numbers from [0..63]**; ticket price is fixed at **0.069 DIESEL** (6,900,000 base units).
- Each ticket mints a **position NFT** (`arbuzino-{round}-{ticket}` / symbol `AZ-{round}-{ticket}`) to the buyer — the ticket IS the claim right, freely transferable.
- Rounds last **1008 blocks (~1 week)** of ticket sale, then the draw: **6 balls from 6 distinct block hashes** (permissionless `RecordBall`, one per block; the caller earns a keeper reward). The 6th ball finalizes the draw and auto-opens the next round.
- **Every bet is split (immutable):**

| Share | Destination |
|---|---|
| 10% | Tier-3 pool (match 3) |
| 8% | Tier-4 pool (match 4) |
| **67%** | **Tier-5 pool (match 5+, top prize — a 6-match folds in)** |
| 1% | Keeper pool (RecordBall callers, 1/6 per ball) |
| 14% | Protocol fee → swept permissionlessly into the share vault `4:777` (staker yield; no admin path) |

- **Payouts are pari-mutuel:** `payout = pool_snapshot × your_bet / winners_total_bet` — with the fixed ticket price this is an equal split per winning ticket. If a tier has no winners its pool is **not drained — it rolls over indefinitely** (mega-jackpot mechanic, especially tier 5).
- **Odds (hypergeometric, C(64,6) = 74,974,368):** match 3 = 1 in 121.5 · match 4 = 1 in 3,024 · match 5+ = **1 in 214,826** · perfect 6 = 1 in 74,974,368 (paid from tier 5).

### 4. Inugami
DIESEL bounty (`2:69834`) claimable by any miner who writes the exact phrase `🍉MAGIC ARBUZ🔮` into their coinbase scriptSig.

---

## Reading on-chain data

Everything is readable with a single JSON-RPC method — **`alkanes_simulate`** — against any Sandshrew/metashrew mainnet endpoint. Request template:

```json
{
  "jsonrpc": "2.0", "id": 1, "method": "alkanes_simulate",
  "params": [{
    "alkanes": [], "transaction": "0x", "block": "0x",
    "height": "20000", "txindex": 0, "pointer": 0, "refundPointer": 0, "vout": 0,
    "target": { "block": "4", "tx": "257" },
    "inputs": ["103"]
  }]
}
```

`target` = the contract, `inputs[0]` = the view opcode (+ args). The response's `execution.data` is hex; all numbers are **little-endian u128**, amounts in DIESEL base units (8 decimals). Batch arrays are supported.

### Fireball game `4:257` — view opcodes

| Opcode | View | Returns |
|---|---|---|
| 100 | ViewRound | current round: `(round_id, start_height, lock_height, bank, draw_finalized, keeper_pool)` |
| 101 | ViewBalls | current round: 6 bytes, one per drawn ball |
| 102 | ViewWinners | current round: `(pool_snap, winners_bet)` × tiers 3/4/5 |
| **103** | **ViewPools** | **global prize pools: `(pool_3, pool_4, pool_5, fee_accumulator)` — this is the headline "current jackpot / TVL" read** |
| 104/105/106 | ViewRoundOf / BallsOf / WinnersOf | same as 100/101/102 but for an explicit `round_id` arg (finished rounds) |
| 107 | ViewConfig | `(ticket_price, round_duration, current_round)` |
| **108** | **ViewTickets** | **`(tickets_this_round, tickets_all_time)` — volume metric** |
| 109 | ViewTicketResult | `(round_id, packed_ticket, bet)` → `(match_count, tier, payout)` — score any pick without the NFT |

Write opcodes (for completeness): 1 BuyTicket (6 numbers, DIESEL in), 2 RecordBall (permissionless, pays keeper), 3 Claim (surrender NFT), 5 Donate (sweeten a tier pool), 6 DonateFeesToVault (permissionless fee sweep).

### Fee vault `4:777`
Opcode **101 ViewVault** → `(total_shares, fee_pool, total_redeemed)`; the accumulated DIESEL `fee_pool` is the vault TVL.

### Position NFTs (tickets, at `2:N`)
Opcode 99 GetName → `arbuzino-{round}-{ticket}`, 100 GetSymbol → `AZ-{round}-{ticket}`, 1000 ViewPosition → `(round_id, packed_ticket, bet, ticket_index)` (ticket numbers are packed 6 bits each, low slot first).

### Card factory `2:69849`
Opcode 101 → total cards minted; opcode 1000 → full on-chain card art/traits. ARBUZ `2:25349`: opcodes 102/103 → cap / minted.

**Example — current top prize in DIESEL:** call op 103 on `4:257`, take the 3rd u128 (`pool_5`), divide by 1e8.
