// Deterministic per-author highlight color. Same author id → same hue across
// the annotation highlights, the comment panel, and the review timeline.

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function authorHue(authorId: string): number {
  return hash(authorId) % 360
}

/** Translucent fill for the inline highlight <mark>. */
export function highlightColor(authorId: string): string {
  return `hsla(${authorHue(authorId)}, 85%, 55%, 0.28)`
}

/** Saturated fill for the focused/hovered highlight <mark>. */
export function highlightColorStrong(authorId: string): string {
  return `hsla(${authorHue(authorId)}, 85%, 55%, 0.5)`
}

/** Solid dot/border color for panel + timeline chips. */
export function accentColor(authorId: string): string {
  return `hsl(${authorHue(authorId)}, 70%, 45%)`
}
