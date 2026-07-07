import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EcosystemDirectory, type DirectoryCopy } from "@/components/ecosystem/EcosystemDirectory"
import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

const copy: DirectoryCopy = {
  filterAll: "All",
  featuredTag: "Featured",
  website: "Website",
  docs: "Docs",
  tabApps: "Apps",
  tabContracts: "Contracts",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
}

const p = (over: Partial<PublicEcosystemProject>): PublicEcosystemProject => ({
  slug: "x", name: "X", logoUrl: null, bannerUrl: null, category: "DeFi", status: "Live",
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

const withContracts = [
  ...projects,
  p({ slug: "diesel", name: "DIESEL", kind: "Contract", alkaneId: "2:0", category: "DeFi" }),
  p({ slug: "wunsch", name: "wunsch vault", kind: "Contract", alkaneId: "4:777", category: "DeFi" }),
]

describe("EcosystemDirectory — kind tabs", () => {
  it("defaults to the Apps tab and hides contracts", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    expect(screen.getByRole("tab", { name: /Apps/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText("DIESEL")).toBeNull()
  })
  it("switches to Contracts and shows the alkaneId badge linking to Ordiscan", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    expect(screen.getByText("DIESEL")).toBeInTheDocument()
    expect(screen.queryByText("SUBFROST")).toBeNull()
    const badge = screen.getByRole("link", { name: /DIESEL on Ordiscan/ })
    expect(badge).toHaveAttribute("href", "https://ordiscan.com/alkane/DIESEL/2:0")
  })
  it("scopes category chips to the active tab and resets selection on switch", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("button", { name: /Tooling/ })) // Apps-only category
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    expect(screen.queryByRole("button", { name: /Tooling/ })).toBeNull() // no Tooling contracts
    expect(screen.getByText("DIESEL")).toBeInTheDocument() // selection reset to All
  })
  it("shows no badge for a contract without an alkaneId", () => {
    render(<EcosystemDirectory projects={[p({ slug: "fm", name: "Free Mint Factory", kind: "Contract" })]} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    expect(screen.getByText("Free Mint Factory")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /on Ordiscan/ })).toBeNull()
  })
})

describe("EcosystemDirectory — internal profile links", () => {
  it("card overlay links to the internal profile page", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    const overlay = screen.getByRole("link", { name: "Bound" })
    expect(overlay).toHaveAttribute("href", "/ecosystem/bound")
    expect(overlay).not.toHaveAttribute("target")
  })

  it("featured card overlay also links internally, Website button stays external", () => {
    render(<EcosystemDirectory projects={projects} featuredBandEnabled copy={copy} />)
    expect(screen.getByRole("link", { name: "SUBFROST" })).toHaveAttribute("href", "/ecosystem/subfrost")
    const websites = screen.getAllByRole("link", { name: /Website/ })
    for (const w of websites) expect(w).toHaveAttribute("target", "_blank")
  })

  // The stretched-link overlay sits at z-0; anything raised above it (z-10)
  // swallows clicks. Only elements that actually contain interactive targets
  // (Website/X/docs anchors, the Ordiscan badge) may be raised — the title,
  // logo, description and category/status rows must stay below the overlay so
  // clicking them navigates to the profile.
  it("only interactive card content is raised above the stretched-link overlay", () => {
    const { container } = render(
      <EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />,
    )
    const raised = Array.from(container.querySelectorAll('[class*="z-10"]'))
    expect(raised.length).toBeGreaterThan(0)
    for (const el of raised) {
      const interactive = el.matches("a, button") || el.querySelector("a, button") !== null
      expect(interactive, `non-interactive element raised above card overlay: <${el.tagName.toLowerCase()} class="${el.getAttribute("class")}">`).toBe(true)
    }
  })
})
