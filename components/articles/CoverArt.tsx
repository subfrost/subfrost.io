// Geometric "frost" cover used when an article has no cover image. The angled
// shards echo the SUBFROST glacier mark; `label` prints a small Fraunces marker
// (typically the article's primary tag).
export function CoverArt({
  label,
  className,
}: {
  label?: string | null
  className?: string
}) {
  return (
    <div className={`ed-cover ${className ?? ""}`}>
      <span className="a" />
      <span className="b" />
      {label ? (
        <span className="mk font-display" style={{ fontSize: 18 }}>
          {label}
        </span>
      ) : null}
    </div>
  )
}
