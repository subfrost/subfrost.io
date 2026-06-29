const DAY_MS = 86_400_000

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Sun-first weeks of UTC-midnight dates covering `month` (0-indexed). */
export function buildMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(Date.UTC(year, month, 1))
  const startOffset = first.getUTCDay() // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const weeksCount = Math.ceil((startOffset + daysInMonth) / 7)
  const gridStart = new Date(first.getTime() - startOffset * DAY_MS)
  const weeks: Date[][] = []
  let cursor = gridStart.getTime()
  for (let w = 0; w < weeksCount; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor += DAY_MS
    }
    weeks.push(week)
  }
  return weeks
}

export function bucketByDate<T>(items: T[], getDate: (x: T) => Date | null): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const d = getDate(it)
    if (!d) continue
    const key = toDateKey(d)
    const arr = map.get(key)
    if (arr) arr.push(it)
    else map.set(key, [it])
  }
  return map
}
