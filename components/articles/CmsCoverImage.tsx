"use client"

import { useState } from "react"
import { CoverArt } from "./CoverArt"

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

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
      className={`${className} ed-cms-cover`}
    />
  )
}
