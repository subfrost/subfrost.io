import { readFile } from "fs/promises"
import { join } from "path"

// Shared asset loaders for every ImageResponse producer (articles OG,
// admin stat-card renderer, public /data cards). fs.readFile, not fetch:
// these run on the nodejs runtime and must not depend on network/self-HTTP.

export async function loadOgLogomark(): Promise<string> {
  const svg = await readFile(join(process.cwd(), "public", "brand", "subfrost", "Logos", "svg", "logomark", "logomark.svg"))
  return `data:image/svg+xml;base64,${svg.toString("base64")}`
}

export async function loadOgFont(): Promise<ArrayBuffer> {
  const font = await readFile(join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans", "Geist-Medium.ttf"))
  return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer
}
