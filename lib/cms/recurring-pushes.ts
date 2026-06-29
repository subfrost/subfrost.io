import type { PushFrequency } from "@prisma/client"

const DAY_MS = 86_400_000

export interface RecurrenceRule {
  frequency: PushFrequency
  dayOfWeek: number          // 0=Sun..6=Sat (WEEKLY/BIWEEKLY)
  dayOfMonth?: number | null // MONTHLY
  startDate: Date
  endDate?: Date | null
  active: boolean
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Occurrence dates (UTC midnight) within [rangeStart, rangeEnd] inclusive. Pure + deterministic. */
export function expandOccurrences(rule: RecurrenceRule, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!rule.active) return []
  const start = utcMidnight(rangeStart)
  const end = utcMidnight(rangeEnd)
  if (end < start) return []
  const ruleStart = utcMidnight(rule.startDate)
  const ruleEnd = rule.endDate ? utcMidnight(rule.endDate) : null
  const lowerBound = ruleStart > start ? ruleStart : start
  const out: Date[] = []

  if (rule.frequency === "MONTHLY") {
    const dom = rule.dayOfMonth ?? ruleStart.getUTCDate()
    let y = lowerBound.getUTCFullYear()
    let m = lowerBound.getUTCMonth()
    while (true) {
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      const occ = new Date(Date.UTC(y, m, Math.min(dom, daysInMonth)))
      if (occ > end) break
      if (occ >= lowerBound && occ >= ruleStart && (!ruleEnd || occ <= ruleEnd)) out.push(occ)
      m += 1
      if (m > 11) { m = 0; y += 1 }
    }
    return out
  }

  const step = rule.frequency === "BIWEEKLY" ? 14 : 7
  const firstDelta = (rule.dayOfWeek - ruleStart.getUTCDay() + 7) % 7
  let occ = new Date(ruleStart.getTime() + firstDelta * DAY_MS)
  if (occ < lowerBound) {
    const gap = Math.ceil((lowerBound.getTime() - occ.getTime()) / (step * DAY_MS))
    occ = new Date(occ.getTime() + gap * step * DAY_MS)
  }
  while (occ <= end) {
    if (occ >= ruleStart && (!ruleEnd || occ <= ruleEnd)) out.push(new Date(occ))
    occ = new Date(occ.getTime() + step * DAY_MS)
  }
  return out
}
