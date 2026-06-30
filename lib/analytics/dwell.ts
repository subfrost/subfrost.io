export interface SessionHit { path: string; ts: number } // ts = epoch ms
export interface DwellAccum { totalMs: number; count: number }

const ARTICLE = /^\/articles\/([^/?#]+)/
export function articleSlug(path: string): string | null {
  const m = ARTICLE.exec(path)
  return m ? m[1] : null
}

/** Per session (hits sorted asc by ts), an article pageview's dwell is the gap
 *  to the next hit in the same session, clamped to maxDwellMs. The last hit of
 *  a session has no next hit (bounce) and is skipped. Accumulated per slug. */
export function dwellBySlug(sessions: SessionHit[][], maxDwellMs = 1_800_000): Map<string, DwellAccum> {
  const out = new Map<string, DwellAccum>()
  for (const hits of sessions) {
    const sorted = [...hits].sort((a, b) => a.ts - b.ts)
    for (let i = 0; i < sorted.length - 1; i++) {
      const slug = articleSlug(sorted[i].path)
      if (!slug) continue
      const gap = Math.min(sorted[i + 1].ts - sorted[i].ts, maxDwellMs)
      if (gap <= 0) continue
      const acc = out.get(slug) ?? { totalMs: 0, count: 0 }
      acc.totalMs += gap
      acc.count += 1
      out.set(slug, acc)
    }
  }
  return out
}
