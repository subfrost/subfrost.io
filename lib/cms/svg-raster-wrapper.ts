// Figma exports a raster logo as an SVG wrapper: a <rect> filled by a <pattern>
// whose content is an <image> carrying the bitmap as a base64 data URI, often
// reached through a <use>. Our SVG sanitizer drops <use> (not in its allowlist),
// which orphans the <pattern> and makes the logo render blank. When an SVG is
// nothing but such a wrapper we pull the embedded raster out and hand it to the
// normal image pipeline instead of storing the SVG.

export type RasterWrapper = { contentType: "image/png" | "image/jpeg" | "image/webp"; data: Buffer }

const SVG_RE = /<svg[\s>]/i
const SCAFFOLD_RE = /<(?:pattern|use)[\s>]/i
// Real drawing content means it is not a pure raster wrapper — rasterizing would
// silently drop this vector detail, so we refuse and let it stay an SVG.
const VECTOR_RE = /<(?:path|text|circle|ellipse|line|polyline|polygon|tspan|textPath)[\s>]/i
// Embedded raster on an <image> href / xlink:href. Non-greedy up to the matching
// quote so stray whitespace in the base64 payload doesn't over-match.
const RASTER_HREF_RE =
  /(?:xlink:)?href\s*=\s*("|')(data:image\/(png|jpe?g|webp);base64,[\s\S]*?)\1/gi

function normalizeType(subtype: string): RasterWrapper["contentType"] {
  const s = subtype.toLowerCase()
  if (s === "png") return "image/png"
  if (s === "webp") return "image/webp"
  return "image/jpeg" // jpg | jpeg
}

/**
 * If `svg` is nothing but a Figma-style wrapper around a single embedded raster,
 * return that raster (decoded) so it can go through the raster pipeline. Anything
 * that carries genuine vector content, lacks the wrapper scaffolding, or embeds
 * zero/multiple rasters returns null — the caller then sanitizes the SVG as usual.
 */
export function extractRasterWrapper(svg: string): RasterWrapper | null {
  if (!SVG_RE.test(svg)) return null
  if (!SCAFFOLD_RE.test(svg)) return null
  if (VECTOR_RE.test(svg)) return null

  const uris: { subtype: string; b64: string }[] = []
  for (const m of svg.matchAll(RASTER_HREF_RE)) {
    const uri = m[2]
    const b64 = uri.slice(uri.indexOf("base64,") + "base64,".length).replace(/\s+/g, "")
    uris.push({ subtype: m[3], b64 })
  }
  if (uris.length !== 1) return null // zero (no supported raster) or ambiguous multi-raster

  const data = Buffer.from(uris[0].b64, "base64")
  if (data.byteLength === 0) return null
  return { contentType: normalizeType(uris[0].subtype), data }
}
