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
