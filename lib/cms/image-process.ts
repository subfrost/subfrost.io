import sharp from "sharp"
import { createHash } from "node:crypto"

export const MAX_WIDTH = 1920
export const AVIF_QUALITY = 60
export const WEBP_QUALITY = 85

export type RasterSet = { ext: "png" | "jpg" | "webp"; fallback: Buffer; avif: Buffer; webp: Buffer }

const EXT_BY_TYPE: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function optBaseName(idHint: string, data: Buffer): string {
  const safe = idHint.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "img"
  const hash = createHash("sha1").update(data).digest("hex").slice(0, 8)
  return `${safe}-${hash}`
}

export async function processRaster(contentType: string, data: Buffer): Promise<RasterSet | null> {
  const ext = EXT_BY_TYPE[contentType]
  if (!ext) return null // gif/svg/unknown are not transcoded here
  const base = sharp(data).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true })
  const [avif, webp, fallback] = await Promise.all([
    base.clone().avif({ quality: AVIF_QUALITY }).toBuffer(),
    base.clone().webp({ quality: WEBP_QUALITY }).toBuffer(),
    ext === "jpg"
      ? base.clone().jpeg({ quality: 90 }).toBuffer()
      : ext === "webp"
        ? base.clone().webp({ quality: WEBP_QUALITY }).toBuffer()
        : base.clone().png({ compressionLevel: 9 }).toBuffer(),
  ])
  return { ext, fallback, avif, webp }
}
