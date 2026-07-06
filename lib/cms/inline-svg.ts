import { sanitizeSvg } from "./svg-sanitize"
import { isChartSvg } from "./image-srcset"

// Successes are immutable per URL — cache them in-process to avoid re-fetch/re-sanitize on every
// render. Failures are NOT cached (a transient bucket blip should retry next render).
const cache = new Map<string, string>()
// Soft cap: the keyspace is the set of published chart-SVG URLs (small), so a coarse
// clear-at-cap is fine — no need for LRU bookkeeping.
const CACHE_CAP = 256

const SVG_RE = /<svg[\s>]/i
const IMG_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g

/** Distinct chart-SVG URLs referenced by markdown image syntax. */
export function extractChartSvgUrls(md: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of md.matchAll(IMG_RE)) {
    const url = m[1]
    if (isChartSvg(url) && !seen.has(url)) { seen.add(url); out.push(url) }
  }
  return out
}

/** Fetch + sanitize a chart SVG for inline embedding. Returns null → caller renders <img>. */
export async function prepareInlineSvg(src: string): Promise<string | null> {
  const hit = cache.get(src)
  if (hit !== undefined) return hit
  try {
    const res = await fetch(src, { cache: "force-cache" })
    if (!res.ok) return null
    const text = await res.text()
    if (!SVG_RE.test(text)) return null
    const clean = sanitizeSvg(text)
    if (!SVG_RE.test(clean)) return null
    if (cache.size >= CACHE_CAP) cache.clear()
    cache.set(src, clean)
    return clean
  } catch {
    return null
  }
}

/** Resolve every chart-SVG URL in the markdown to sanitized inline markup. */
export async function buildInlineSvgMap(md: string): Promise<Map<string, string>> {
  const urls = extractChartSvgUrls(md)
  const map = new Map<string, string>()
  await Promise.all(
    urls.map(async (url) => {
      const svg = await prepareInlineSvg(url)
      if (svg) map.set(url, svg)
    }),
  )
  return map
}
