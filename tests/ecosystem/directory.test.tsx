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
  kind: "App", alkaneId: null, showMarketStats: false,
  url: "https://x.io", xUrl: null, docsUrl: null, description: "d", featured: false, inMosaic: false, ...over,
})

const projects = [
  p({ slug: "subfrost", name: "SUBFROST", featured: true }),
  p({ slug: "oyl", name: "Oyl Wallet", category: "Wallet", featured: true }),
  p({ slug: "bound", name: "Bound", category: "DeFi", xUrl: "https://x.com/bound", docsUrl: "https://docs.bound.io" }),
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

describe("EcosystemDirectory — alkaneId badge", () => {
  it("shows the alkaneId badge linking to the SUBFROST explorer for a project with an alkaneId", () => {
    render(<EcosystemDirectory projects={[p({ slug: "diesel", name: "DIESEL", alkaneId: "2:0" })]} featuredBandEnabled={false} copy={copy} />)
    const badge = screen.getByRole("link", { name: /DIESEL on the SUBFROST explorer/ })
    // Colon unescaped: the explorer's own canonical URL is /alkane/2:0, and a
    // percent-encoded id would be a different (uglier) link to the same page.
    expect(badge).toHaveAttribute("href", "https://explorer.subfrost.io/alkane/2:0")
  })
  it("shows no badge for a project without an alkaneId", () => {
    render(<EcosystemDirectory projects={[p({ slug: "fm", name: "Free Mint Factory" })]} featuredBandEnabled={false} copy={copy} />)
    expect(screen.getByText("Free Mint Factory")).toBeInTheDocument()
    // Matched on the explorer href, not on the accessible name: keying this to the
    // badge's label is what made it vacuous when the label changed, since a query
    // for a name nothing renders passes whether or not the badge is there.
    expect(document.querySelector('a[href^="https://explorer.subfrost.io/alkane/"]')).toBeNull()
  })
})

const withContracts = [
  ...projects,
  p({ slug: "diesel", name: "DIESEL", kind: "Contract", alkaneId: "2:0", category: "DeFi" }),
  // category differs from every App-kind entry above (DeFi/Wallet/Tooling) so it can prove
  // category chips are scoped to the active tab's kind (see the test below).
  p({ slug: "wunsch", name: "wunsch vault", kind: "Contract", alkaneId: "4:777", category: "Launchpad" }),
]

describe("EcosystemDirectory — kind tabs", () => {
  it("defaults to the Apps tab and hides contracts", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    expect(screen.getByRole("tab", { name: /Apps/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText("DIESEL")).toBeNull()
  })
  it("category chips are scoped to the active tab's kind", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />) // Apps is the default tab
    // Launchpad only exists on the Contract-kind "wunsch" fixture; if cats were derived
    // from all projects instead of ofKind, it would leak into the Apps chip row.
    expect(screen.queryByRole("button", { name: /Launchpad/ })).toBeNull()
  })
  it("resets the category filter when switching kind and back", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("button", { name: /Tooling/ })) // Apps-only category
    expect(screen.queryByText("Bound")).toBeNull() // filtered out by Tooling
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    fireEvent.click(screen.getByRole("tab", { name: /Apps/ }))
    expect(screen.getByText("Bound")).toBeInTheDocument() // selection reset back to All
  })
  it("both tabs carry their own count", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    const appsTab = screen.getByRole("tab", { name: /Apps/ })
    const contractsTab = screen.getByRole("tab", { name: /Contracts/ })
    // withContracts has 4 App-kind entries (projects) + 2 Contract-kind entries (diesel, wunsch).
    // Asserted on the full textContent rather than on presence of the tab: a count rendered
    // for the wrong kind, or dropped entirely, both show up here.
    expect(appsTab.textContent).toBe(copy.tabApps + "4")
    expect(contractsTab.textContent).toBe(copy.tabContracts + "2")
  })
  it("switching to Contracts renders contract cards and its own chip row", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    expect(screen.getByRole("tab", { name: /Contracts/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("DIESEL")).toBeInTheDocument()
    expect(screen.getByText("wunsch vault")).toBeInTheDocument()
    expect(screen.queryByText("SUBFROST")).toBeNull() // App-kind stays out
    // Launchpad exists only on the Contract-kind "wunsch" fixture, so its presence here
    // proves the chip row is scoped to the active kind rather than to every project.
    expect(screen.getByRole("button", { name: /Launchpad/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /All/ })).toBeInTheDocument()
  })
  it("filters contracts by category, and the cards link to their profiles", () => {
    render(<EcosystemDirectory projects={withContracts} featuredBandEnabled copy={copy} />)
    fireEvent.click(screen.getByRole("tab", { name: /Contracts/ }))
    // Exact name, not /DIESEL/: the card renders two links whose names contain it, the
    // stretched-link overlay ("DIESEL") and the alkane badge ("DIESEL on the SUBFROST
    // explorer"). Only the overlay carries the internal profile href asserted here.
    expect(screen.getByRole("link", { name: "DIESEL" })).toHaveAttribute("href", "/ecosystem/diesel")
    fireEvent.click(screen.getByRole("button", { name: /Launchpad/ }))
    expect(screen.getByText("wunsch vault")).toBeInTheDocument()
    expect(screen.queryByText("DIESEL")).toBeNull() // filtered out by Launchpad
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
  // (Website/X/docs anchors, the alkane id badge) may be raised — the title,
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

describe("EcosystemDirectory — grid card redesign (logo-forward + hover-reveal)", () => {
  it("grid card exposes X and Docs as external social links when present", () => {
    render(
      <EcosystemDirectory
        projects={[p({ slug: "orca", name: "Orca", xUrl: "https://x.com/orca", docsUrl: "https://docs.orca.io" })]}
        featuredBandEnabled={false}
        copy={copy}
      />,
    )
    const x = screen.getByRole("link", { name: /Orca on X/ })
    expect(x).toHaveAttribute("href", "https://x.com/orca")
    expect(x).toHaveAttribute("target", "_blank")
    expect(x).toHaveAttribute("rel", "noopener noreferrer")
    const docs = screen.getByRole("link", { name: /Orca docs/ })
    expect(docs).toHaveAttribute("href", "https://docs.orca.io")
    expect(docs).toHaveAttribute("target", "_blank")
  })

  it("grid card omits social links when the project has no xUrl/docsUrl", () => {
    render(<EcosystemDirectory projects={[p({ slug: "bare", name: "Bare" })]} featuredBandEnabled={false} copy={copy} />)
    expect(screen.queryByRole("link", { name: /on X/ })).toBeNull()
    expect(screen.queryByRole("link", { name: /docs/i })).toBeNull()
  })

  it("grid card description carries the reveal class and stays below the overlay (not z-10)", () => {
    render(<EcosystemDirectory projects={[p({ slug: "bound", name: "Bound", description: "trade tokens" })]} featuredBandEnabled={false} copy={copy} />)
    const desc = screen.getByText("trade tokens")
    expect(desc).toHaveClass("ec-card-desc")
    expect(desc.className).not.toContain("z-10")
    // The idle description has opacity:0, which creates a stacking context that paints
    // above the z-0 stretched-link overlay and would swallow the card click over its
    // reserved band (a subtler #202). pointer-events-none lets the click fall through.
    expect(desc).toHaveClass("pointer-events-none")
  })

  it("grid card root carries ec-card so the hover-reveal CSS can target it", () => {
    render(<EcosystemDirectory projects={[p({ slug: "bound", name: "Bound" })]} featuredBandEnabled={false} copy={copy} />)
    const overlay = screen.getByRole("link", { name: "Bound" })
    expect(overlay.parentElement).toHaveClass("ec-card")
  })

  it("featured card keeps its description always visible (no reveal gating)", () => {
    render(
      <EcosystemDirectory
        projects={[p({ slug: "subfrost", name: "SUBFROST", featured: true, description: "the source" })]}
        featuredBandEnabled
        copy={copy}
      />,
    )
    const desc = screen.getByText("the source")
    expect(desc).not.toHaveClass("ec-card-desc")
  })
})
