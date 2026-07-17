export function isExternalHref(href?: string | null) {
  if (!href) return false
  return /^https?:\/\//i.test(href) || href.startsWith("//")
}

export function externalAnchorProps(href?: string | null) {
  return isExternalHref(href) ? { target: "_blank", rel: "noopener noreferrer" } : {}
}
