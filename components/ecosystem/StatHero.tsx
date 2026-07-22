import type { ProjectStats } from "@/lib/ecosystem/stats-types"
import { computeStatDeltas, type StatDelta } from "@/lib/ecosystem/stat-deltas"
import { isMeaningfulStat } from "@/lib/ecosystem/stat-visibility"

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

const DELTA_COLOR: Record<StatDelta["direction"], string> = {
  up: "#3fb950",
  down: "#f85149",
  flat: "var(--ed-muted)",
}
const DELTA_ARROW: Record<StatDelta["direction"], string> = { up: "↑", down: "↓", flat: "–" }

function StatDeltaRow({ delta, periodLabel }: { delta: StatDelta; periodLabel: string | null }) {
  const pct = (Math.abs(delta.deltaPct) * 100).toFixed(1)
  const period = periodLabel ?? "period"
  return (
    <p
      data-testid="stat-delta"
      data-direction={delta.direction}
      className="mt-1 font-mono text-[11px]"
      style={{ color: DELTA_COLOR[delta.direction], fontVariantNumeric: "tabular-nums" }}
      aria-label={`${delta.direction} ${pct}% over ${period}`}
    >
      {DELTA_ARROW[delta.direction]} {pct}%
      {periodLabel ? <span className="ml-1" style={{ color: "var(--ed-muted)" }}>{periodLabel}</span> : null}
    </p>
  )
}

export function StatHero({ stats, baseline, mainAlkaneId, copy, locale, periodLabel }: {
  stats: ProjectStats | null
  baseline?: ProjectStats | null
  mainAlkaneId: string | null
  copy: StatHeroCopy
  locale: "en" | "zh"
  periodLabel?: string | null
}) {
  if (!stats) return null
  const cards: { k: string; label: string; value: string }[] = []
  for (const c of stats.custom) {
    if (cards.length >= 4) break
    cards.push({
      k: `custom-${c.key}`,
      label: locale === "zh" && c.labelZh ? c.labelZh : c.label,
      value: c.unit ? `${formatCompact(c.value)} ${c.unit}` : c.value,
    })
  }
  const g = mainAlkaneId ? stats.generic[mainAlkaneId] : undefined
  if (g) {
    if (cards.length < 4 && isMeaningfulStat(g.holders)) {
      cards.push({ k: "generic-holders", label: copy.holders, value: formatCompact(String(g.holders)) })
    }
    if (cards.length < 4 && isMeaningfulStat(g.supply)) {
      cards.push({ k: "generic-supply", label: copy.supply, value: formatCompact(g.supply as string) })
    }
    if (cards.length < 4 && isMeaningfulStat(g.priceUsd)) {
      const price = g.priceUsd as number
      cards.push({ k: "generic-price", label: copy.price, value: `$${price < 1 ? price.toFixed(4) : price.toFixed(2)}` })
    }
  }
  if (cards.length === 0) return null
  const deltas = computeStatDeltas(stats, baseline ?? null, mainAlkaneId)
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.slice(0, 4).map((c) => (
        <div key={c.k} className="rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-4 py-3.5">
          <p data-testid="stat-label" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">{c.label}</p>
          <p className="mt-1 text-[22px] font-medium tracking-[-0.015em] text-[color:var(--ed-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{c.value}</p>
          {deltas[c.k] ? <StatDeltaRow delta={deltas[c.k]} periodLabel={periodLabel ?? null} /> : null}
        </div>
      ))}
    </div>
  )
}
