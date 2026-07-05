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
