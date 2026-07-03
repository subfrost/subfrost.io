const SEARCH = ["google.", "bing.", "duckduckgo.", "yahoo.", "baidu.", "yandex.", "ecosia."]
const SOCIAL = ["x.com", "t.co", "twitter.", "facebook.", "reddit.", "linkedin.", "lnkd.in", "youtube.", "youtu.be", "instagram.", "t.me", "telegram.", "discord.", "warpcast.", "farcaster."]

function host(referer: string): string {
  try { return new URL(referer).hostname.toLowerCase() } catch { return "" }
}

/** Coarse channel grouping from referer + utm. utm wins; then host heuristics. */
export function classifyChannel(referer: string | null, utmSource: string | null, utmMedium: string | null): string {
  if (utmMedium) return utmMedium.toLowerCase()
  if (utmSource) return `referral:${utmSource.toLowerCase()}`
  if (!referer) return "direct"
  const h = host(referer)
  if (!h) return "direct"
  if (SEARCH.some((s) => h.includes(s))) return "organic"
  if (SOCIAL.some((s) => h === s || h.includes(s))) return "social"
  return "referral"
}
