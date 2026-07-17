// Which request paths count as a public pageview worth capturing. Excludes the
// admin CMS, API routes, Next internals, broadcast, and static assets.
const SKIP_PREFIXES = ["/admin", "/api", "/_next", "/broadcast", "/favicon"]
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|txt|xml|json|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i

export function isCapturablePageview(pathname: string): boolean {
  if (!pathname) return false
  for (const p of SKIP_PREFIXES) if (pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p)) return false
  if (ASSET_EXT.test(pathname)) return false
  return true
}
