import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EcosystemDirectory, type DirectoryCopy } from "@/components/ecosystem/EcosystemDirectory"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

const copy: DirectoryCopy = {
  filterAll: "All",
  featuredTag: "Featured",
  website: "Website",
  docs: "Docs",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
}

const p = (over: Partial<PublicEcosystemProject>): PublicEcosystemProject => ({
  slug: "x", name: "X", logoUrl: null, category: "DeFi", status: "Live",
  kind: "App", alkaneId: null,
  url: "https://x.io", xUrl: null, docsUrl: null, description: "d", featured: false, ...over,
})

const projects = [
  p({ slug: "subfrost", name: "SUBFROST", featured: true }),
  p({ slug: "oyl", name: "Oyl Wallet", category: "Wallet", featured: true }),
  p({ slug: "bound", name: "Bound", category: "DeFi" }),
  p({ slug: "ordiscan", name: "Ordiscan", category: "Tooling" }),
]

describe("EcosystemDirectory", () => {
  it("renders featured band when enabled", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    expect(screen.getAllByText("Featured").length).toBe(2)
  })

  it("hides featured band when disabled — featured projects fall into the grid", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled={false} copy={copy} />)
    expect(screen.queryByText("Featured")).toBeNull()
    expect(screen.getByText("SUBFROST")).toBeInTheDocument()
  })

  it("filters by category chip", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("button", { name: /Tooling/ }))
    expect(screen.getByText("Ordiscan")).toBeInTheDocument()
    expect(screen.queryByText("Bound")).toBeNull()
    expect(screen.queryByText("SUBFROST")).toBeNull() // featured filtered too
  })

  it("chips only show categories present plus All", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    expect(screen.queryByRole("button", { name: /Gaming/ })).toBeNull()
    expect(screen.getByRole("button", { name: /All/ })).toBeInTheDocument()
  })

  it("renders monogram fallback when no logo", () => {
    render(<EcosystemDirectory projects={[p({ slug: "bound", name: "Bound" })]} featuredBandEnabled={false} copy={copy} />)
    expect(screen.getByText("B")).toBeInTheDocument()
  })
})
