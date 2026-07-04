"use client"

import { useMemo, useState } from "react"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

export interface DirectoryCopy {
  filterAll: string
  featuredTag: string
  website: string
  docs: string
  statuses: Record<string, string>
}

const STATUS_COLOR: Record<string, string> = {
  Live: "#178a4c",
  Beta: "#b7791f",
  Building: "var(--ed-muted)",
}

const GRADS = [
  "linear-gradient(135deg,#11294a,#1a3c66)",
  "linear-gradient(135deg,#1a4d8f,#5b9cff)",
  "linear-gradient(135deg,#0a1628,#1a4d8f)",
  "linear-gradient(135deg,#1a3c66,#5b9cff)",
  "linear-gradient(135deg,#11294a,#5b9cff)",
]

function gradFor(slug: string) {
  let h = 0
  for (const ch of slug) h = (h + ch.charCodeAt(0)) % GRADS.length
  return GRADS[h]
}

function initials(name: string) {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 1).toUpperCase()
}

function Mark({ p, size }: { p: PublicEcosystemProject; size: number }) {
  if (p.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.logoUrl} alt="" width={size} height={size} className="rounded-[10px] object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-[10px] font-semibold text-white"
      style={{ width: size, height: size, background: gradFor(p.slug), fontSize: size * 0.38 }}
    >
      {initials(p.name)}
    </span>
  )
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.Building
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color }}>
      <i className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
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

export function EcosystemDirectory({
  projects,
  featuredBandEnabled,
  copy,
}: {
  projects: PublicEcosystemProject[]
  featuredBandEnabled: boolean
  copy: DirectoryCopy
}) {
  const [cat, setCat] = useState<string>("__all__")

  const cats = useMemo(() => {
    const seen = new Map<string, number>()
    for (const p of projects) seen.set(p.category, (seen.get(p.category) ?? 0) + 1)
    return [...seen.entries()]
  }, [projects])

  const visible = cat === "__all__" ? projects : projects.filter((p) => p.category === cat)
  const showBand = featuredBandEnabled && cat === "__all__" ? visible.some((p) => p.featured) : false
  const featured = showBand ? visible.filter((p) => p.featured) : []
  const grid = showBand ? visible.filter((p) => !p.featured) : visible

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-[color:var(--ed-hair)] px-6 py-5 sm:px-10" role="group">
        <Chip active={cat === "__all__"} onClick={() => setCat("__all__")} label={copy.filterAll} count={projects.length} />
        {cats.map(([c, n]) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)} label={c} count={n} />
        ))}
      </div>

      {featured.length > 0 ? (
        <div className="grid gap-5 px-6 pt-7 sm:grid-cols-2 sm:px-10">
          {featured.map((p) => (
            <div key={p.slug}
              className="relative flex flex-col gap-3 rounded-[14px] border border-[color:var(--ed-hair)] bg-gradient-to-b from-[color:var(--ed-surface)] to-[color:var(--ed-canvas)] p-6 transition-colors hover:border-[color:var(--ed-ice)]">
              {/* Stretched-link overlay: makes the whole card clickable to the project url
                  while keeping LinksRow's real anchors (website/X/docs) as non-nested,
                  independently-clickable siblings above it (z-10). */}
              <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} — ${copy.website}`} className="absolute inset-0 z-0 rounded-[14px]" />
              <div className="relative z-10 flex items-center gap-3.5">
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
              <p className="relative z-10 text-[14.5px] leading-relaxed text-[color:var(--ed-body)]">{p.description}</p>
              <div className="relative z-10">
                <LinksRow p={p} copy={copy} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3.5 px-6 py-6 sm:grid-cols-2 sm:px-10 lg:grid-cols-3 xl:grid-cols-4">
        {grid.map((p) => (
          <a key={p.slug} href={p.url} target="_blank" rel="noopener noreferrer"
            className="flex flex-col gap-2.5 rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] p-[18px] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[color:var(--ed-ice)] motion-reduce:hover:translate-y-0">
            <div className="flex items-center gap-2.5">
              <Mark p={p} size={34} />
              <h3 className="text-[15px] font-medium text-[color:var(--ed-ink)]">{p.name}</h3>
            </div>
            <p className="text-[12.8px] leading-snug text-[color:var(--ed-muted)]">{p.description}</p>
            <div className="mt-auto flex items-center justify-between pt-1">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">{p.category}</span>
              <StatusBadge status={p.status} label={copy.statuses[p.status] ?? p.status} />
            </div>
          </a>
        ))}
      </div>
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
