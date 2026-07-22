"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"
import { Mark, StatusBadge } from "./visuals"

export interface DirectoryCopy {
  filterAll: string
  featuredTag: string
  website: string
  docs: string
  tabApps: string
  tabContracts: string
  comingSoon: string
  statuses: Record<string, string>
}

function LinksRow({ p, copy }: { p: PublicEcosystemProject; copy: DirectoryCopy }) {
  return (
    <div className="mt-auto flex gap-1.5">
      <a
        href={p.url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-[7px] border border-[color:var(--ed-hair)] px-2.5 py-1 text-[12.5px] font-medium text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)] hover:bg-[color:var(--ed-surface)]"
      >
        {copy.website} ↗
      </a>
      {p.xUrl ? (
        <a href={p.xUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-[color:var(--ed-muted)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-accent)]">𝕏</a>
      ) : null}
      {p.docsUrl ? (
        <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-[color:var(--ed-muted)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-accent)]">{copy.docs}</a>
      ) : null}
    </div>
  )
}

function AlkaneBadge({ p }: { p: PublicEcosystemProject }) {
  if (!p.alkaneId) return null
  return (
    <a
      href={`https://ordiscan.com/alkane/${encodeURIComponent(p.name)}/${p.alkaneId}`}
      target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on Ordiscan`}
      className="relative z-10 inline-flex w-fit items-center gap-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 py-0.5 font-mono text-[11px] text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)]"
    >
      {p.alkaneId} ↗
    </a>
  )
}

// Compact X / Docs links for the grid card footer. Raised above the stretched-link
// overlay (z-10) so they stay independently clickable; the card itself navigates to
// the internal profile. Nothing renders when the project exposes neither link.
function GridLinks({ p, copy }: { p: PublicEcosystemProject; copy: DirectoryCopy }) {
  if (!p.xUrl && !p.docsUrl) return null
  return (
    <div className="relative z-10 flex items-center gap-2.5">
      {p.xUrl ? (
        <a href={p.xUrl} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on X`}
          className="text-[13px] font-medium leading-none text-[color:var(--ed-muted)] transition-colors hover:text-[color:var(--ed-accent)]">𝕏</a>
      ) : null}
      {p.docsUrl ? (
        <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} docs`}
          className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[color:var(--ed-muted)] transition-colors hover:text-[color:var(--ed-accent)]">{copy.docs}</a>
      ) : null}
    </div>
  )
}

export function EcosystemDirectory({
  projects,
  featuredBandEnabled,
  copy,
}: {
  projects: PublicEcosystemProject[]
  featuredBandEnabled: boolean
  copy: DirectoryCopy
}) {
  const [kind, setKind] = useState<"App" | "Contract">("App")
  const [cat, setCat] = useState<string>("__all__")

  const ofKind = useMemo(() => projects.filter((p) => (p.kind ?? "App") === kind), [projects, kind])
  const counts = useMemo(() => ({
    App: projects.filter((p) => (p.kind ?? "App") === "App").length,
    // Contract is unused while the tab shows the "Coming soon" placeholder (no count
    // rendered next to its label). Intentionally retained: Contracts is coming back
    // this week and the count returns with it — don't delete this as dead code.
    Contract: projects.filter((p) => p.kind === "Contract").length,
  }), [projects])

  const cats = useMemo(() => {
    const seen = new Map<string, number>()
    for (const p of ofKind) seen.set(p.category, (seen.get(p.category) ?? 0) + 1)
    return [...seen.entries()]
  }, [ofKind])

  const visible = cat === "__all__" ? ofKind : ofKind.filter((p) => p.category === cat)
  const showBand = featuredBandEnabled && cat === "__all__" ? visible.some((p) => p.featured) : false
  const featured = showBand ? visible.filter((p) => p.featured) : []
  const grid = showBand ? visible.filter((p) => !p.featured) : visible

  return (
    <div>
      <div role="tablist" aria-label="Project kind" className="flex gap-6 border-b border-[color:var(--ed-hair)] px-6 pt-5 sm:px-10">
        {(["App", "Contract"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={kind === k}
            onClick={() => { setKind(k); setCat("__all__") }}
            className={"-mb-px border-b-2 pb-3 font-mono text-[12.5px] font-medium tracking-[0.04em] transition-colors " +
              (kind === k
                ? "border-[color:var(--ed-ink)] text-[color:var(--ed-ink)]"
                : "border-transparent text-[color:var(--ed-muted)] hover:text-[color:var(--ed-accent)]")}>
            {k === "App" ? copy.tabApps : copy.tabContracts}
            {k === "App" ? (
              <span className="ml-1.5 opacity-60" style={{ fontVariantNumeric: "tabular-nums" }}>{counts[k]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {kind === "Contract" ? (
        <div className="px-6 py-16 text-center sm:px-10">
          <p className="text-[14.5px] text-[color:var(--ed-muted)]">{copy.comingSoon}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-[color:var(--ed-hair)] px-6 py-5 sm:px-10" role="group">
            <Chip active={cat === "__all__"} onClick={() => setCat("__all__")} label={copy.filterAll} count={ofKind.length} />
            {cats.map(([c, n]) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)} label={c} count={n} />
            ))}
          </div>

          {featured.length > 0 ? (
            <div className="grid gap-5 px-6 pt-7 sm:grid-cols-2 sm:px-10">
              {featured.map((p) => (
                <div key={p.slug}
                  className="relative flex flex-col gap-3 rounded-[14px] border border-[color:var(--ed-hair)] bg-gradient-to-b from-[color:var(--ed-surface)] to-[color:var(--ed-canvas)] p-6 transition-colors hover:border-[color:var(--ed-ice)]">
                  {/* Stretched-link overlay: makes the whole card clickable to the project's internal
                      profile page. Only LinksRow's real anchors (website/X/docs) and the AlkaneBadge
                      are raised above it (z-10) — everything else must stay below the overlay or it
                      swallows the click instead of navigating. */}
                  <Link href={`/ecosystem/${p.slug}`} aria-label={p.name} className="absolute inset-0 z-0 rounded-[14px]" />
                  <div className="flex items-center gap-3.5">
                    <Mark p={p} size={52} />
                    <div>
                      <h3 className="text-[20px] font-medium tracking-[-0.012em] text-[color:var(--ed-ink)]">{p.name}</h3>
                      <div className="mt-0.5 flex items-center gap-3">
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">{p.category}</span>
                        <StatusBadge status={p.status} label={copy.statuses[p.status] ?? p.status} />
                      </div>
                    </div>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ed-flare)]">{copy.featuredTag}</span>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-[color:var(--ed-body)]">{p.description}</p>
                  <AlkaneBadge p={p} />
                  <div className="relative z-10">
                    <LinksRow p={p} copy={copy} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3.5 px-6 py-6 sm:grid-cols-2 sm:px-10 lg:grid-cols-3 xl:grid-cols-4">
            {grid.map((p) => (
              <div key={p.slug}
                className="ec-card relative flex flex-col rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] p-[18px] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[color:var(--ed-ice)] motion-reduce:hover:translate-y-0">
                {/* Stretched-link overlay: navigates to the internal profile page. Only the
                    GridLinks (X/docs) and AlkaneBadge — real external anchors — are raised above
                    it; the name, logo, category, status and description stay below the overlay so
                    clicking the card navigates instead of swallowing the click (see #202). The
                    description reveal is CSS-only (.ec-card / .ec-card-desc in globals.css):
                    hover-in on desktop, hidden with no reserved space on touch. The description
                    MUST keep pointer-events-none: its opacity:0 (idle) creates a stacking context
                    that paints above the z-0 overlay (later in DOM) and would otherwise swallow the
                    click over its reserved band — a subtler #202 than a raised z-index. */}
                <Link href={`/ecosystem/${p.slug}`} aria-label={p.name} className="absolute inset-0 z-0 rounded-[11px]" />
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-medium leading-tight text-[color:var(--ed-ink)]">{p.name}</h3>
                  <span className="shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">{p.category}</span>
                </div>
                <div className="flex flex-1 items-center justify-center py-6">
                  <Mark p={p} size={56} />
                </div>
                <div className="flex items-center gap-2.5">
                  <GridLinks p={p} copy={copy} />
                  <AlkaneBadge p={p} />
                  <div className="ml-auto">
                    <StatusBadge status={p.status} label={copy.statuses[p.status] ?? p.status} />
                  </div>
                </div>
                <p className="ec-card-desc pointer-events-none mt-2.5 text-[12.5px] leading-snug text-[color:var(--ed-muted)]">{p.description}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3.5 py-1.5 font-mono text-[11.5px] font-medium transition-colors " +
        (active
          ? "border-[color:var(--ed-ink)] bg-[color:var(--ed-ink)] text-[color:var(--ed-canvas)]"
          : "border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] text-[color:var(--ed-body)] hover:border-[color:var(--ed-ice)] hover:text-[color:var(--ed-accent)]")
      }
    >
      {label}
      <span className={"ml-1.5 " + (active ? "text-[color:var(--ed-canvas)] opacity-60" : "text-[color:var(--ed-muted)]")}>{count}</span>
    </button>
  )
}
