import type { ProjectStats } from "@/lib/ecosystem/stats-types"

export type StatDirection = "up" | "down" | "flat"
export interface StatDelta { deltaPct: number; direction: StatDirection }

/** null/undefined/"" → NaN (não comparável); resto → Number(). Evita Number(null)===0. */
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN
  return Number(v)
}

/** Direção + fração de variação; null se não comparável (não-finito ou base 0). */
function delta(cur: number, base: number): StatDelta | null {
  if (!Number.isFinite(cur) || !Number.isFinite(base) || base === 0) return null
  const rawPct = (cur - base) / base
  // Arredonda pra 3 casas de fração (=0.1% de resolução) — estabiliza o display e os testes.
  const deltaPct = Math.round(rawPct * 1000) / 1000
  const direction: StatDirection = cur > base ? "up" : cur < base ? "down" : "flat"
  return { deltaPct, direction }
}

/**
 * Delta por card entre o snapshot atual e o baseline, keyed pela MESMA chave que o
 * StatHero usa: "generic-holders" | "generic-supply" | "generic-price" | "custom-<key>".
 * Só inclui chaves onde ambos os valores são numéricos finitos e a base != 0.
 */
export function computeStatDeltas(
  current: ProjectStats,
  baseline: ProjectStats | null,
  mainAlkaneId: string | null,
): Record<string, StatDelta> {
  const out: Record<string, StatDelta> = {}
  if (!baseline) return out

  const gCur = mainAlkaneId ? current.generic[mainAlkaneId] : undefined
  const gBase = mainAlkaneId ? baseline.generic[mainAlkaneId] : undefined
  if (gCur && gBase) {
    const pairs: [string, unknown, unknown][] = [
      ["generic-holders", gCur.holders, gBase.holders],
      ["generic-supply", gCur.supply, gBase.supply],
      ["generic-price", gCur.priceUsd, gBase.priceUsd],
    ]
    for (const [k, cur, base] of pairs) {
      const d = delta(num(cur), num(base))
      if (d) out[k] = d
    }
  }

  for (const c of current.custom) {
    const b = baseline.custom.find((x) => x.key === c.key)
    if (!b) continue
    const d = delta(num(c.value), num(b.value))
    if (d) out[`custom-${c.key}`] = d
  }
  return out
}

/**
 * Rótulo do período entre o snapshot atual e o baseline: "24h" quando ≥23h,
 * senão "<n>h" (bootstrap, <24h de histórico). null quando não há baseline.
 */
export function computePeriodLabel(currentAt: Date, baselineAt: Date | null): string | null {
  if (!baselineAt) return null
  const hours = Math.round((currentAt.getTime() - baselineAt.getTime()) / 3_600_000)
  return hours >= 23 ? "24h" : `${Math.max(hours, 1)}h`
}
