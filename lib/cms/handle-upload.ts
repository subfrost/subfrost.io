import { sanitizeSvg } from "@/lib/cms/svg-sanitize"
import { processRaster, optBaseName } from "@/lib/cms/image-process"
import { uploadOptimizedSet, uploadSvg, uploadImage } from "@/lib/cms/gcs"

type Kind = "avatar" | "cover" | "inline"
const PREFIX: Record<Kind, "avatars" | "covers" | "inline"> = {
  avatar: "avatars", cover: "covers", inline: "inline",
}

// Orchestrates a single upload: SVG is sanitized and stored as-is; PNG/JPEG/WebP
// are transcoded into an avif/webp/fallback set; anything else (gif) is stored
// raw via the existing uploadImage path.
export async function handleUpload(
  kind: Kind, contentType: string, data: Buffer, idHint: string,
): Promise<{ url: string }> {
  if (data.byteLength > 8 * 1024 * 1024) {
    throw new Error("Image exceeds 8MB limit")
  }
  const prefix = PREFIX[kind]
  if (contentType === "image/svg+xml") {
    return uploadSvg(prefix, idHint, sanitizeSvg(data))
  }
  const set = await processRaster(contentType, data)
  if (set) return uploadOptimizedSet(prefix, optBaseName(idHint, data), set)
  return uploadImage(prefix, contentType, data, idHint) // gif etc. — raw
}
