import { Mark } from "./visuals"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

/**
 * Decorative constellation of project logomarks for the ecosystem hero (lg+ only).
 * Reuses the same Mark rendered in cards, masked to fade into the background at the
 * edges so it reads as "the ecosystem" rather than a hard grid. Purely ornamental
 * (aria-hidden, pointer-events-none) — the real, clickable projects live in the grid below.
 */
export function HeroMosaic({ projects }: { projects: Pick<PublicEcosystemProject, "slug" | "name" | "logoUrl" | "inMosaic">[] }) {
  // Curated: only the projects the admin marked for the mosaic. Cap at 16 to keep the 4-wide
  // grid tidy; hide entirely when none are marked (curation replaces the old minimum-count guard).
  const marks = projects.filter((p) => p.inMosaic).slice(0, 16)
  if (marks.length === 0) return null
  return (
    <div aria-hidden className="ec-hero-mosaic pointer-events-none relative hidden select-none justify-self-end lg:block">
      <div className="grid grid-cols-4 gap-3.5">
        {marks.map((p, i) => (
          <div key={p.slug} className="ec-hero-tile" style={{ animationDelay: `${90 + i * 45}ms` }}>
            <Mark p={p} size={58} />
          </div>
        ))}
      </div>
    </div>
  )
}
