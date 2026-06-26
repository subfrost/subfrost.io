export const siteUrl = "https://subfrost.io"
export const siteName = "SUBFROST"
export const sharedUnfurlImagePath = "/brand/subfrost/Graphics/jpeg/banner_light.jpg"
export const sharedUnfurlImageUrl = absoluteUrl(sharedUnfurlImagePath)
export const sharedUnfurlImageWidth = 1794
export const sharedUnfurlImageHeight = 598

export function absoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`
}

export function absoluteUrlForHost(path: string, host: string | null, proto?: string | null) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path

  const normalizedHost = host?.split(",")[0]?.trim().toLowerCase() ?? ""
  const scheme = proto?.split(",")[0]?.trim() || (isLocalPreviewHost(normalizedHost) ? "http" : "https")
  const origin = isDeployPreviewHost(normalizedHost) || isLocalPreviewHost(normalizedHost)
    ? `${scheme}://${normalizedHost}`
    : siteUrl

  return `${origin}${path.startsWith("/") ? path : `/${path}`}`
}

export function articleUrl(slug: string, locale: "en" | "zh" = "en") {
  return absoluteUrl(locale === "zh" ? `/articles/${slug}?lang=zh` : `/articles/${slug}`)
}

export function authorUrl(id: string, locale: "en" | "zh" = "en") {
  return absoluteUrl(locale === "zh" ? `/authors/${id}?lang=zh` : `/authors/${id}`)
}

export function isDeployPreviewHost(host: string | null) {
  const normalized = host?.toLowerCase() ?? ""
  return Boolean(normalized.includes("deploy-preview-") && normalized.endsWith(".netlify.app"))
}

export function isLocalPreviewHost(host: string | null) {
  const normalized = host?.toLowerCase() ?? ""
  return (
    normalized.startsWith("localhost") ||
    normalized.startsWith("127.0.0.1") ||
    normalized.startsWith("[::1]") ||
    normalized.startsWith("::1")
  )
}

export function shouldUseArticlePreviewFallback(host: string | null) {
  return isDeployPreviewHost(host) || isLocalPreviewHost(host)
}
