// Geometric snowflake logomark (stand-in). Uses currentColor so it inherits the
// surrounding text color (Carbon on light chrome, Glacial on dark). Replace with
// the official brand SVG (public/brand/subfrost-snowflake.svg) once received.
export function SnowflakeMark({ size = 22, className }: { size?: number; className?: string }) {
  const arm = (
    <g>
      <line x1="12" y1="12" x2="12" y2="2.5" />
      <line x1="12" y1="5.3" x2="9.7" y2="3.5" />
      <line x1="12" y1="5.3" x2="14.3" y2="3.5" />
      <line x1="12" y1="8" x2="10.3" y2="6.6" />
      <line x1="12" y1="8" x2="13.6" y2="6.6" />
    </g>
  )
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 12)`}>
          {arm}
        </g>
      ))}
    </svg>
  )
}
