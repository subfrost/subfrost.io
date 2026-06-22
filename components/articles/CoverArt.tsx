// Frost cover used when an article has no CMS-provided cover image. `label`
// prints the article's primary category in the top-right corner.
export function CoverArt({
  label,
  className,
}: {
  label?: string | null
  className?: string
}) {
  return (
    <div className={`ed-cover ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/articles/subfrost-featured.png" alt="" />
      {label ? (
        <span className="mk font-display">
          {label}
        </span>
      ) : null}
    </div>
  )
}
