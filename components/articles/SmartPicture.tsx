import { pictureSources } from "@/lib/cms/image-srcset"

export function SmartPicture({
  src, alt = "", className, loading = "lazy", fetchPriority = "auto",
}: {
  src: string; alt?: string; className?: string
  loading?: "lazy" | "eager"; fetchPriority?: "auto" | "high" | "low"
}) {
  const p = pictureSources(src)
  if (!p) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} loading={loading} decoding="async" fetchPriority={fetchPriority} />
  }
  return (
    <picture>
      <source srcSet={p.avif} type="image/avif" />
      <source srcSet={p.webp} type="image/webp" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.fallback} alt={alt} className={className} loading={loading} decoding="async" fetchPriority={fetchPriority} />
    </picture>
  )
}
