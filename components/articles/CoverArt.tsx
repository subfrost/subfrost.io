const coverSources = [
  "/articles/subfrost-cover-2.png",
  "/articles/subfrost-cover-3.png",
  "/articles/subfrost-cover-1.png",
  "/articles/subfrost-cover-5.png",
  "/articles/subfrost-cover-4.png",
  "/articles/subfrost-cover-7.png",
  "/articles/subfrost-cover-8.png",
  "/articles/subfrost-cover-6.png",
  "/articles/subfrost-cover-9.png",
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
  variant,
}: {
  className?: string
  variant?: number | string
}) {
  const src = coverSources[coverIndex(variant)]

  return (
    <div className={`ed-cover ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
    </div>
  )
}
