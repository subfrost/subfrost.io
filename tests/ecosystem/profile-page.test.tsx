import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EcosystemProfile, type ProfileCopy } from "@/components/ecosystem/EcosystemProfile"
import type { PublicEcosystemProfile } from "@/lib/ecosystem/public"

const copy: ProfileCopy = {
  back: "← Ecosystem", website: "Website", docs: "Docs", overview: "Overview",
  contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
  stats: { holders: "Holders", supply: "Supply", price: "Price" },
}

const profile = (over: Partial<PublicEcosystemProfile>): PublicEcosystemProfile => ({
  slug: "arbuzino", name: "Arbuzino", logoUrl: null, bannerUrl: null, category: "Gaming", status: "Live",
  kind: "App", alkaneId: "2:25349", url: "https://arbuzino.com", xUrl: "https://x.com/arbuzino",
  docsUrl: null, description: "Casino-themed on-chain games.", featured: false,
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

  it("external links: website, X, main alkane badge to ordiscan", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "https://arbuzino.com")
    expect(screen.getByRole("link", { name: "2:25349 ↗" })).toHaveAttribute(
      "href", "https://ordiscan.com/alkane/Arbuzino/2:25349")
  })

  it("renders contracts table with espo.sh links", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    // Contracts is now a tab label rather than a standalone heading — click it
    // to reveal the table, preserving the original intent of this test.
    expect(screen.getByRole("tab", { name: "Contracts" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "Contracts" }))
    expect(screen.getByText("Fireball game")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "4:257 ↗" })).toHaveAttribute("href", "https://espo.sh/alkane/4:257")
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
})
