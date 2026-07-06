// Synchronous, context-agnostic: the async fetch/sanitize happened on the server (buildInlineSvgMap).
// color:var(--ed-ink) makes the SVG's currentColor ink follow the article theme (incl. toggle).
export function InlineFigure({ svg, alt = "" }: { svg: string; alt?: string }) {
  return (
    <figure
      className="ed-figure"
      role="img"
      aria-label={alt}
      style={{ color: "var(--ed-ink)" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
