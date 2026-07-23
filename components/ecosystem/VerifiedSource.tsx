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
  // Number() drops a trailing .00, so a 100% match reads "100%" and 98.69 stays "98.69%".
  const match = `${Number(v.matchPct.toFixed(2))}%`

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
        href={`https://explorer.subfrost.io/alkane/${v.alkaneId}/source`}
        target="_blank" rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-1 rounded-[7px] border border-[color:var(--ed-hair)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)] hover:bg-[color:var(--ed-surface)]"
      >
        {copy.browseOnExplorer} ↗
      </a>
    </section>
  )
}
