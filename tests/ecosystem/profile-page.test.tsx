import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { EcosystemProfile, type ProfileCopy } from "@/components/ecosystem/EcosystemProfile"
import type { PublicEcosystemProfile } from "@/lib/ecosystem/public"

const copy: ProfileCopy = {
  back: "← Ecosystem", website: "Website", docs: "Docs",
  contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
  statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
}

const profile = (over: Partial<PublicEcosystemProfile>): PublicEcosystemProfile => ({
  slug: "arbuzino", name: "Arbuzino", logoUrl: null, category: "Gaming", status: "Live",
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
    expect(screen.getByRole("heading", { level: 2, name: "Products" })).toBeInTheDocument() // markdown rendered
    expect(screen.getByText("DIESEL")).toBeInTheDocument()
  })

  it("external links: website, X, main alkane badge to ordiscan", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "https://arbuzino.com")
    expect(screen.getByRole("link", { name: "2:25349 ↗" })).toHaveAttribute(
      "href", "https://ordiscan.com/alkane/Arbuzino/2:25349")
  })

  it("renders contracts table with espo.sh links", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.getByRole("heading", { name: "Contracts" })).toBeInTheDocument()
    expect(screen.getByText("Fireball game")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "4:257 ↗" })).toHaveAttribute("href", "https://espo.sh/alkane/4:257")
  })

  it("omits body and contracts sections when empty", () => {
    render(<EcosystemProfile p={profile({ profile: "", contracts: [] })} copy={copy} backHref="/ecosystem" />)
    expect(screen.queryByRole("heading", { name: "Contracts" })).toBeNull()
  })
})
