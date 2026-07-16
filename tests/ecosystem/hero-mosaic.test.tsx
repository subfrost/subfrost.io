import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { HeroMosaic } from "@/components/ecosystem/HeroMosaic"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

const p = (over: Partial<PublicEcosystemProject>): PublicEcosystemProject => ({
  slug: "x", name: "X", logoUrl: null, bannerUrl: null, category: "DeFi", status: "Live",
  kind: "App", alkaneId: null, url: "https://x.io", xUrl: null, docsUrl: null,
  description: "d", featured: false, inMosaic: false, ...over,
})

describe("HeroMosaic", () => {
  it("renders only projects marked inMosaic", () => {
    const { container } = render(
      <HeroMosaic projects={[
        p({ slug: "a", inMosaic: true }),
        p({ slug: "b", inMosaic: false }),
        p({ slug: "c", inMosaic: true }),
      ]} />,
    )
    expect(container.querySelectorAll(".ec-hero-tile").length).toBe(2)
  })

  it("returns null when nothing is marked (no minimum-count fallback)", () => {
    const { container } = render(
      <HeroMosaic projects={[p({ slug: "a" }), p({ slug: "b" })]} />,
    )
    expect(container.querySelector(".ec-hero-mosaic")).toBeNull()
  })

  it("caps the mosaic at 16 marks", () => {
    const many = Array.from({ length: 20 }, (_, i) => p({ slug: `s${i}`, inMosaic: true }))
    const { container } = render(<HeroMosaic projects={many} />)
    expect(container.querySelectorAll(".ec-hero-tile").length).toBe(16)
  })
})
