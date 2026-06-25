"use client"

import { useState } from "react"

// Cover image for a homepage blog card. Falls back to the brand gradient when
// the article has no cover or the cover URL fails to load (e.g. a stale imgur
// album link), so a bad cover never renders a broken-image icon.
export function BlogCardCover({ coverImage }: { coverImage: string | null }) {
  const [failed, setFailed] = useState(false)

  if (!coverImage || failed) {
    return <div data-cover-fallback className="h-40 w-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-slate-900" />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverImage}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-40 w-full object-cover opacity-90"
    />
  )
}
