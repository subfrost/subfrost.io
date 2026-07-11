/**
 * Visible notice block for the ecosystem directory + profiles. Promotes the old
 * grey one-liner disclaimer to a bordered block with an info icon, so the "these
 * are independent third-party projects" boundary reads clearly without looking
 * like a danger warning. Theme-aware via the editorial --ed-* tokens.
 */
export function EcosystemNotice({ text, className = "" }: { text: string; className?: string }) {
  return (
    <aside
      role="note"
      className={`flex items-start gap-3 rounded-[10px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-4 py-3 ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="mt-[1px] h-[17px] w-[17px] shrink-0 text-[color:var(--ed-muted)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="10" cy="10" r="8.25" />
        <path d="M10 9.25v4.4" strokeLinecap="round" />
        <circle cx="10" cy="6.3" r="0.55" fill="currentColor" stroke="none" />
      </svg>
      <p className="text-[12.5px] leading-[1.55] text-[color:var(--ed-body)]">{text}</p>
    </aside>
  )
}
