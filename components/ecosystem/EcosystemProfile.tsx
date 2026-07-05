import Link from "next/link"
import type { ReactNode } from "react"
import { Markdown } from "@/lib/cms/markdown"
import { Mark, StatusBadge, gradFor } from "@/components/ecosystem/visuals"
import { splitProfileSections } from "@/lib/ecosystem/profile-sections"
import type { PublicEcosystemProfile } from "@/lib/ecosystem/public"
import { ProfileTabs } from "./ProfileTabs"

export interface ProfileCopy {
  back: string
  website: string
  docs: string
  overview: string
  contractsTitle: string
  contractCol: string
  idCol: string
  notesCol: string
  statuses: Record<string, string>
}

const btnCls =
  "inline-flex items-center gap-1 rounded-[7px] border border-[color:var(--ed-hair)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)] hover:bg-[color:var(--ed-surface)]"

export function EcosystemProfile({ p, copy, backHref }: {
  p: PublicEcosystemProfile
  copy: ProfileCopy
  backHref: string
}) {
  return (
    <article>
      <Link href={backHref} className="font-mono text-[12px] text-[color:var(--ed-muted)] transition-colors hover:text-[color:var(--ed-accent)]">
        {copy.back}
      </Link>

      {p.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.bannerUrl} alt="" className="mt-5 h-[clamp(120px,22vw,240px)] w-full rounded-[14px] object-cover" />
      ) : (
        <div aria-hidden className="mt-5 h-[96px] w-full rounded-[14px]" style={{ background: gradFor(p.slug) }} />
      )}

      <header className="mt-6 flex flex-wrap items-start gap-5">
        <Mark p={p} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(26px,4vw,38px)] font-normal leading-[1.05] tracking-[-0.02em] text-[color:var(--ed-ink)]">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">{p.category}</span>
            <StatusBadge status={p.status} label={copy.statuses[p.status] ?? p.status} />
            {p.alkaneId ? (
              <a
                href={`https://ordiscan.com/alkane/${encodeURIComponent(p.name)}/${p.alkaneId}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 py-0.5 font-mono text-[11px] text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)]"
              >
                {p.alkaneId} ↗
              </a>
            ) : null}
          </div>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ed-body)]">{p.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className={btnCls}>{copy.website} ↗</a>
            {p.xUrl ? <a href={p.xUrl} target="_blank" rel="noopener noreferrer" className={btnCls}>𝕏</a> : null}
            {p.docsUrl ? <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className={btnCls}>{copy.docs}</a> : null}
          </div>
        </div>
      </header>

      <ProfileBody p={p} copy={copy} />
    </article>
  )
}

function ProfileBody({ p, copy }: { p: PublicEcosystemProfile; copy: ProfileCopy }) {
  const { intro, sections } = splitProfileSections(p.profile)
  const tabs: { key: string; label: string }[] = []
  const panels: ReactNode[] = []
  if (intro) {
    tabs.push({ key: "overview", label: copy.overview })
    panels.push(<Markdown variant="article">{intro}</Markdown>)
  }
  sections.forEach((s, i) => {
    tabs.push({ key: `s${i}`, label: s.title })
    panels.push(<Markdown variant="article">{s.body}</Markdown>)
  })
  if (p.contracts.length > 0) {
    tabs.push({ key: "contracts", label: copy.contractsTitle })
    panels.push(<ContractsTable contracts={p.contracts} copy={copy} />)
  }
  if (tabs.length === 0) return null
  if (tabs.length === 1) {
    return (
      <div className="mt-10 border-t border-[color:var(--ed-hair)] pt-8">
        {tabs[0].key === "contracts" ? (
          <>
            <h2 className="mb-4 text-[20px] font-medium tracking-[-0.012em] text-[color:var(--ed-ink)]">{copy.contractsTitle}</h2>
            {panels[0]}
          </>
        ) : (
          panels[0]
        )}
      </div>
    )
  }
  return (
    <div className="mt-10">
      <ProfileTabs tabs={tabs} panels={panels} />
    </div>
  )
}

function ContractsTable({ contracts, copy }: { contracts: PublicEcosystemProfile["contracts"]; copy: ProfileCopy }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-[color:var(--ed-hair)] font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">
            <th className="py-2 pr-4 font-medium">{copy.contractCol}</th>
            <th className="py-2 pr-4 font-medium">{copy.idCol}</th>
            <th className="py-2 font-medium">{copy.notesCol}</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={`${c.alkaneId}-${c.label}`} className="border-b border-[color:var(--ed-hair)] align-top">
              <td className="py-2.5 pr-4 text-[color:var(--ed-ink)]">{c.label}</td>
              <td className="py-2.5 pr-4">
                <a
                  href={`https://espo.sh/alkane/${c.alkaneId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[12.5px] text-[color:var(--ed-accent)] hover:underline"
                >
                  {c.alkaneId} ↗
                </a>
              </td>
              <td className="py-2.5 text-[color:var(--ed-body)]">{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
