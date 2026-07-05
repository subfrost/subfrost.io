import type { ProjectStats } from "@/lib/ecosystem/stats-types"

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

export function StatHero({ stats, mainAlkaneId, copy, locale }: {
  stats: ProjectStats | null
  mainAlkaneId: string | null
  copy: StatHeroCopy
  locale: "en" | "zh"
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
    if (cards.length < 4 && g.holders != null) cards.push({ k: "generic-holders", label: copy.holders, value: formatCompact(String(g.holders)) })
    if (cards.length < 4 && g.supply) cards.push({ k: "generic-supply", label: copy.supply, value: formatCompact(g.supply) })
    if (cards.length < 4 && g.priceUsd != null) cards.push({ k: "generic-price", label: copy.price, value: `$${g.priceUsd < 1 ? g.priceUsd.toFixed(4) : g.priceUsd.toFixed(2)}` })
  }
  if (cards.length === 0) return null
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.slice(0, 4).map((c) => (
        <div key={c.k} className="rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-4 py-3.5">
          <p data-testid="stat-label" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">{c.label}</p>
          <p className="mt-1 text-[22px] font-medium tracking-[-0.015em] text-[color:var(--ed-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}
