const BUCKET = process.env.CMS_BUCKET || "subfrost-cms"
const HOST = `https://storage.googleapis.com/${BUCKET}/`
const OPT_RE = /\.opt\.(png|jpe?g|webp)$/i

export type PictureSources = { avif: string; webp: string; fallback: string }

export function pictureSources(src: string): PictureSources | null {
  if (!src.startsWith(HOST)) return null
  if (!OPT_RE.test(src)) return null
  const stem = src.replace(OPT_RE, ".opt")
  return { avif: `${stem}.avif`, webp: `${stem}.webp`, fallback: src }
}
