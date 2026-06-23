const coverSources: { base: string; largest: 1536 | 1254 }[] = [
  { base: "subfrost-cover-2", largest: 1536 },
  { base: "subfrost-cover-3", largest: 1536 },
  { base: "subfrost-cover-1", largest: 1536 },
  { base: "subfrost-cover-5", largest: 1536 },
  { base: "subfrost-cover-4", largest: 1536 },
  { base: "subfrost-cover-7", largest: 1536 },
  { base: "subfrost-cover-8", largest: 1536 },
  { base: "subfrost-cover-6", largest: 1536 },
  { base: "subfrost-cover-9", largest: 1254 },
]

function coverIndex(variant: number | string | undefined) {
  if (typeof variant === "number") return Math.abs(variant) % coverSources.length
  if (!variant) return 0

  let hash = 0
  for (let i = 0; i < variant.length; i += 1) {
    hash = (hash * 31 + variant.charCodeAt(i)) >>> 0
  }
  return hash % coverSources.length
}

// Frost cover used when an article has no CMS-provided cover image.
export function CoverArt({
  className,
  priority = false,
  sizes = "(min-width: 1024px) 35vw, (min-width: 768px) 50vw, 100vw",
  variant,
}: {
  className?: string
  priority?: boolean
  sizes?: string
  variant?: number | string
}) {
  const cover = coverSources[coverIndex(variant)]
  const webpSrcSet = [
    `/articles/${cover.base}-480.webp 480w`,
    `/articles/${cover.base}-960.webp 960w`,
    `/articles/${cover.base}-${cover.largest}.webp ${cover.largest}w`,
  ].join(", ")

  return (
    <div className={`ed-cover ${className ?? ""}`}>
      <picture>
        <source
          srcSet={webpSrcSet}
          sizes={sizes}
          type="image/webp"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/articles/${cover.base}.png`}
          alt=""
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          loading={priority ? "eager" : "lazy"}
        />
      </picture>
    </div>
  )
}
