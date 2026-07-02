import { ImageResponse } from "next/og"
import { getPublishedArticle } from "@/lib/cms/articles"

export const alt = "SUBFROST Article"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = await getPublishedArticle(slug, "en", { previewFallback: true }).catch(() => null)
  const cover = a?.coverImage
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#05070d" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={1200} height={630} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: "#eaf2ff", fontSize: 64, fontWeight: 600 }}>SUBFROST</div>
        )}
      </div>
    ),
    { ...size },
  )
}
