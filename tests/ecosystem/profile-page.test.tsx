import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EcosystemProfile, type ProfileCopy } from "@/components/ecosystem/EcosystemProfile"
import type { PublicEcosystemProfile } from "@/lib/ecosystem/public"
import type { VerifiedSourceCopy } from "@/components/ecosystem/VerifiedSource"
import type { VerifiedSource } from "@/lib/ecosystem/verified-source"

const sourceCopy: VerifiedSourceCopy = {
  verifiedSourceTitle: "Verified source",
  verdictReproducible: "Reproducible",
  verdictVerified: "Verified",
  verdictReproducibleNote: "The rebuilt wasm is byte-exact to the on-chain bytecode.",
  verdictVerifiedNote: "Logic and structure match, with a small host-dependent residual in build metadata.",
  matchLabel: "Byte match",
  reproducedFrom: "Reproduced from",
  commitLabel: "Commit",
  browseOnExplorer: "Browse the source on the explorer",
}

const copy: ProfileCopy = {
  back: "← Ecosystem", disclaimer: "Discovery only; not endorsed by SUBFROST.", website: "Website", docs: "Docs", overview: "Overview",
  contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
  stats: { holders: "Holders", supply: "Supply", price: "Price" },
  chart: { title: "Price (90d)" },
  sourceTab: "Source", source: sourceCopy,
}

const profile = (over: Partial<PublicEcosystemProfile>): PublicEcosystemProfile => ({
  slug: "arbuzino", name: "Arbuzino", logoUrl: null, bannerUrl: null, category: "Gaming", status: "Live",
  kind: "App", alkaneId: "2:25349", showMarketStats: true, url: "https://arbuzino.com", xUrl: "https://x.com/arbuzino",
  docsUrl: null, description: "Casino-themed on-chain games.", featured: false, inMosaic: false,
  profile: "## Products\n\nFully on-chain lottery paid in **DIESEL**.",
  // ids distintos do alkaneId principal (2:25349) — evita getByRole ambíguo
  contracts: [
    { label: "Fireball game", alkaneId: "4:257", note: "The lottery singleton" },
    { label: "Fee vault", alkaneId: "4:777", note: "Staker yield vault" },
  ],
  ...over,
})

describe("EcosystemProfile", () => {
  it("renders header, markdown body and back link", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("heading", { level: 1, name: "Arbuzino" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "← Ecosystem" })).toHaveAttribute("href", "/ecosystem")
    // The fixture's profile starts at `## Products`, so it has no intro — Products
    // and Contracts become tabs (no standalone single-flow body). The H2 title is
    // consumed as the tab label (splitProfileSections strips it from the body), so
    // click the tab and assert the markdown body renders, preserving the original intent.
    fireEvent.click(screen.getByRole("tab", { name: "Products" }))
    expect(screen.getByText("DIESEL")).toBeInTheDocument() // markdown rendered
  })

  it("external links: website, X, main alkane badge to the SUBFROST explorer", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "https://arbuzino.com")
    expect(screen.getByRole("link", { name: /Arbuzino on the SUBFROST explorer/ })).toHaveAttribute(
      "href", "https://explorer.subfrost.io/alkane/2:25349")
  })

  it("renders contracts table linking each row to the SUBFROST explorer", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    // Contracts is a tab label rather than a standalone heading: click it to reveal the table.
    fireEvent.click(screen.getByRole("tab", { name: "Contracts" }))
    expect(screen.getByText("Fireball game")).toBeInTheDocument()
    // Asserted on the href, not the link text: the id renders identically whatever the
    // destination, so a label-based assertion here would survive the destination changing.
    expect(screen.getByRole("link", { name: "4:257 ↗" })).toHaveAttribute(
      "href", "https://explorer.subfrost.io/alkane/4:257")
    expect(screen.getByRole("link", { name: "4:777 ↗" })).toHaveAttribute(
      "href", "https://explorer.subfrost.io/alkane/4:777")
  })

  it("omits body and contracts sections when empty", () => {
    render(<EcosystemProfile p={profile({ profile: "", contracts: [] })} copy={copy} backHref="/ecosystem" />)
    expect(screen.queryByRole("heading", { name: "Contracts" })).toBeNull()
  })
})

describe("EcosystemProfile v2 — banner + tabs", () => {
  const md = "Intro paragraph.\n\n## Products\n\nProducts body.\n\n## On-chain\n\nData body."

  it("renders banner img when bannerUrl is set, gradient band when not", () => {
    const { container, rerender } = render(
      <EcosystemProfile p={profile({ bannerUrl: "https://cdn.x/banner.png" })} copy={copy} backHref="/ecosystem" />,
    )
    expect(container.querySelector('img[src="https://cdn.x/banner.png"]')).toBeTruthy()
    rerender(<EcosystemProfile p={profile({ bannerUrl: null })} copy={copy} backHref="/ecosystem" />)
    expect(container.querySelector('img[src="https://cdn.x/banner.png"]')).toBeNull()
  })

  it("renders tabs from H2 sections plus Overview and Contracts", () => {
    render(<EcosystemProfile p={profile({ profile: md })} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Products" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "On-chain" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Contracts" })).toBeInTheDocument()
    expect(screen.getByText("Intro paragraph.")).toBeInTheDocument() // Overview ativo
    expect(screen.queryByText("Products body.")).toBeNull()
    fireEvent.click(screen.getByRole("tab", { name: "Contracts" }))
    expect(screen.getByText("Fireball game")).toBeInTheDocument() // tabela virou painel
  })

  it("thin profile (≤1 panel) keeps the v1 layout without a tablist", () => {
    render(
      <EcosystemProfile
        p={profile({ profile: "Just a short blurb.", contracts: [] })}
        copy={copy}
        backHref="/ecosystem"
      />,
    )
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByText("Just a short blurb.")).toBeInTheDocument()
  })

  it("suppresses both market slots on a contract page", () => {
    // Gabe, 2026-07-23, with a screenshot of /ecosystem/fire: "I think we still need to drop
    // these stats from contract pages". The shot framed all four, the three stat cards and the
    // 90d chart. The upstream numbers were also wrong there (FIRE read SUPPLY 5845.6B, frBTC
    // 10.1B for an asset pegged 1:1 to BTC), which is the "inaccurate info" he first flagged.
    render(
      <EcosystemProfile
        p={profile({ kind: "Contract" })}
        copy={copy}
        backHref="/ecosystem"
        statHero={<div data-testid="stat-hero-slot" />}
        priceChart={<div data-testid="price-chart-slot" />}
      />,
    )
    expect(screen.queryByTestId("stat-hero-slot")).toBeNull()
    expect(screen.queryByTestId("price-chart-slot")).toBeNull()
  })

  it("keeps both market slots on an app page", () => {
    // The other half of the guard: without this, deleting the whole slot render would still
    // leave the test above green.
    render(
      <EcosystemProfile
        p={profile({ kind: "App" })}
        copy={copy}
        backHref="/ecosystem"
        statHero={<div data-testid="stat-hero-slot" />}
        priceChart={<div data-testid="price-chart-slot" />}
      />,
    )
    expect(screen.getByTestId("stat-hero-slot")).toBeInTheDocument()
    expect(screen.getByTestId("price-chart-slot")).toBeInTheDocument()
  })

  it("renders the priceChart slot after the header", () => {
    render(
      <EcosystemProfile
        p={profile({})}
        copy={copy}
        backHref="/ecosystem"
        priceChart={<div data-testid="price-chart-slot" />}
      />,
    )
    expect(screen.getByTestId("price-chart-slot")).toBeInTheDocument()
  })
})

describe("EcosystemProfile — description vs. Overview dedup", () => {
  it("omits the header description when the profile opens with an Overview", () => {
    // Inugami in production: the short description and the Overview intro say the same thing,
    // a few hundred pixels apart.
    render(
      <EcosystemProfile
        p={profile({
          description: "A coinbase message bounty: users escrow DIESEL against a message.",
          profile: "Inugami turns the Bitcoin coinbase into a message board with a price on it.\n\n## Functions\n\nDetails.",
        })}
        copy={copy}
        backHref="/ecosystem"
      />
    )
    expect(screen.queryByText(/users escrow DIESEL against a message/)).not.toBeInTheDocument()
    expect(screen.getByText(/message board with a price on it/)).toBeInTheDocument()
  })

  it("keeps the header description when there is no profile markdown", () => {
    render(
      <EcosystemProfile
        p={profile({ description: "Bitcoin NFT collection deployed on Alkanes.", profile: "" })}
        copy={copy}
        backHref="/ecosystem"
      />
    )
    expect(screen.getByText("Bitcoin NFT collection deployed on Alkanes.")).toBeInTheDocument()
  })

  it("keeps the header description when the profile starts straight at an H2", () => {
    // No intro means no Overview tab, so the description is the only prose on the page.
    render(
      <EcosystemProfile
        p={profile({ description: "Free mint factory.", profile: "## Functions\n\nDetails." })}
        copy={copy}
        backHref="/ecosystem"
      />
    )
    expect(screen.getByText("Free mint factory.")).toBeInTheDocument()
  })
})

describe("EcosystemProfile — first-party disclaimer suppression", () => {
  it("shows the disclaimer for a third-party project", () => {
    render(<EcosystemProfile p={profile({ slug: "arbuzino" })} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByText("Discovery only; not endorsed by SUBFROST.")).toBeInTheDocument()
  })
  // Hardcoded list (not imported from FIRST_PARTY_SLUGS) so that dropping or mistyping any of
  // the slugs in the source set is caught here — that profile would start showing the
  // third-party disclaimer again, which is exactly the regression this asserts against.
  it.each(["diesel", "frbtc", "fire", "subfrost", "pair-equality-predicate"])(
    "hides the disclaimer for first-party %s",
    (slug) => {
      render(<EcosystemProfile p={profile({ slug })} copy={copy} backHref="/ecosystem" />)
      expect(screen.queryByText("Discovery only; not endorsed by SUBFROST.")).toBeNull()
    },
  )
})

describe("EcosystemProfile — Verified source tab", () => {
  const verified: VerifiedSource = {
    alkaneId: "2:25349", verdict: "verified", matchPct: 98.84, origin: "github",
    repo: "https://github.com/Misha-btc/Acai", commit: "6fe96cb1234567890",
  }

  it("adds a Source tab when the alkane has a verified source", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" verified={verified} />)
    fireEvent.click(screen.getByRole("tab", { name: "Source" }))
    expect(screen.getByRole("heading", { name: "Verified source" })).toBeInTheDocument()
    expect(screen.getByText(/98\.84%/)).toBeInTheDocument()
  })

  it("omits the Source tab entirely when there is no verified source", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" verified={null} />)
    expect(screen.queryByRole("tab", { name: "Source" })).toBeNull()
    expect(screen.queryByText("Verified source")).toBeNull()
  })

  it("omits the Source tab when the prop is not passed at all", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.queryByRole("tab", { name: "Source" })).toBeNull()
  })

  it("renders the panel with its own heading when Source is the only tab", () => {
    // frBTC in production: no profile markdown and no contract rows, so Source is its
    // first and only tab and ProfileBody renders it through the no-tablist branch.
    render(
      <EcosystemProfile
        p={profile({ profile: "", contracts: [] })}
        copy={copy}
        backHref="/ecosystem"
        verified={verified}
      />,
    )
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByRole("heading", { name: "Verified source" })).toBeInTheDocument()
  })
})
