import { alkaneExplorerUrl } from "@/lib/ecosystem/constants"
import { repoShortName, type VerifiedSource } from "@/lib/ecosystem/verified-source"

export interface VerifiedSourceCopy {
  verifiedSourceTitle: string
  verdictReproducible: string
  verdictVerified: string
  verdictReproducibleNote: string
  verdictVerifiedNote: string
  matchLabel: string
  reproducedFrom: string
  commitLabel: string
  browseOnExplorer: string
}

const dtCls = "font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]"
const monoCls = "font-mono text-[12.5px] text-[color:var(--ed-ink)]"

/**
 * Formats a 0-100 match percentage by truncating (never rounding) to at most two decimals,
 * then trimming genuine trailing zeros. Rounding is the wrong operation here: `toFixed(2)`
 * on 99.996 rounds up to "100.00", which would print a byte-exact claim the number does not
 * support (100% is reserved for a verdict-backed exact match, not a rounding artifact).
 * `toFixed(10)` sidesteps the binary floating-point noise a direct `* 100` would carry (e.g.
 * 98.6 stored as 98.59999999999999) before the string is cut, so a genuine 100 still prints
 * "100" and 98.6 prints "98.6" rather than "98.60".
 */
function formatMatchPct(pct: number): string {
  const [whole, frac = ""] = pct.toFixed(10).split(".")
  const truncated = frac.slice(0, 2).replace(/0+$/, "")
  return truncated ? `${whole}.${truncated}` : whole
}

/**
 * The explorer's attestation for one alkane. A server component on purpose: static markup,
 * no state, no handlers. Verifying is an interactive feature and stays in the explorer
 * (flex: "On subfrost.io I don't want user interactive features").
 *
 * Owns its <h2> so it renders correctly both as a tab panel and as a lone panel on the
 * profiles that have no other tabs.
 */
export function VerifiedSourcePanel({ v, copy }: { v: VerifiedSource; copy: VerifiedSourceCopy }) {
  const isRepro = v.verdict === "reproducible"
  const verdictLabel = isRepro ? copy.verdictReproducible : copy.verdictVerified
  const verdictNote = isRepro ? copy.verdictReproducibleNote : copy.verdictVerifiedNote
  // Same greens and ambers as STATUS_COLOR in components/ecosystem/visuals.tsx.
  const color = isRepro ? "#178a4c" : "#b7791f"
  const short = repoShortName(v.repo)
  const match = `${formatMatchPct(v.matchPct)}%`

  return (
    <section>
      <h2 className="text-[20px] font-medium tracking-[-0.012em] text-[color:var(--ed-ink)]">
        {copy.verifiedSourceTitle}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]"
          style={{ color }}
        >
          <i className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
          {verdictLabel}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">
          {copy.matchLabel} {match}
        </span>
      </div>

      <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-[color:var(--ed-body)]">
        {verdictNote}
      </p>

      <dl className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
        <dt className={dtCls}>{copy.reproducedFrom}</dt>
        <dd>
          {v.origin === "github" ? (
            <a
              href={v.repo}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-[12.5px] text-[color:var(--ed-accent)] hover:underline"
            >
              {short} ↗
            </a>
          ) : (
            <span className={monoCls}>{short}</span>
          )}
        </dd>
        <dt className={dtCls}>{copy.commitLabel}</dt>
        <dd><span className={monoCls}>{v.commit.slice(0, 8)}</span></dd>
      </dl>

      <a
        href={`${alkaneExplorerUrl(v.alkaneId)}/source`}
        target="_blank" rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-1 rounded-[7px] border border-[color:var(--ed-hair)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)] hover:bg-[color:var(--ed-surface)]"
      >
        {copy.browseOnExplorer} ↗
      </a>
    </section>
  )
}
