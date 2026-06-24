import type { DateRange } from "@/lib/analytics/source"

export const RANGE_PRESETS = ["7d", "28d", "90d"] as const

const PRESET_DAYS: Record<string, number> = { "7d": 7, "28d": 28, "90d": 90 }
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Resolve a `?range=` value to a GA4 DateRange. Presets map to relative
 *  GA4 strings ("28daysAgo".."today"); "custom:START..END" takes ISO dates.
 *  Anything unrecognized falls back to 28d. Never throws. */
export function parseRange(preset?: string): DateRange {
  if (preset && preset.startsWith("custom:")) {
    const [start, end] = preset.slice("custom:".length).split("..")
    if (ISO.test(start ?? "") && ISO.test(end ?? "")) return { start, end, preset: "custom" }
    return { start: "28daysAgo", end: "today", preset: "28d" }
  }
  const days = preset && PRESET_DAYS[preset]
  if (days) return { start: `${days}daysAgo`, end: "today", preset }
  return { start: "28daysAgo", end: "today", preset: "28d" }
}

/** Cache-key fragment for a range. */
export function rangeKey(r: DateRange): string {
  return `${r.start}_${r.end}`
}
