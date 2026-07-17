"use client"

import { useState } from "react"
import { CoverArt } from "./CoverArt"
import { pictureSources } from "@/lib/cms/image-srcset"

export function CmsCoverImage({
  src,
  className,
  fallbackVariant,
  priority = false,
}: {
  src: string | null
  className: string
  fallbackVariant: number | string
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return <CoverArt className={className} variant={fallbackVariant} priority={priority} />
  }

  const p = pictureSources(src)
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p ? p.fallback : src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
      className={`${className} ed-cms-cover`}
    />
  )
  if (!p) return img
  return (
    <picture>
      <source srcSet={p.avif} type="image/avif" />
      <source srcSet={p.webp} type="image/webp" />
      {img}
    </picture>
  )
}
