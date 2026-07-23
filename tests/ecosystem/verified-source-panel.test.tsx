import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { VerifiedSourcePanel, type VerifiedSourceCopy } from "@/components/ecosystem/VerifiedSource"
import type { VerifiedSource } from "@/lib/ecosystem/verified-source"

const copy: VerifiedSourceCopy = {
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

const frbtc: VerifiedSource = {
  alkaneId: "32:0", verdict: "verified", matchPct: 98.69, origin: "db",
  repo: "https://github.com/subfrost/subfrost-alkanes",
  commit: "0748786d1eede608b56ecf1331fe9e1a7c65d463",
}

const goji: VerifiedSource = {
  alkaneId: "2:10663", verdict: "reproducible", matchPct: 100, origin: "github",
  repo: "https://github.com/Misha-btc/Goji", commit: "6fe96cb1234567890",
}

describe("VerifiedSourcePanel", () => {
  it("renders its own heading, the match and the short commit", () => {
    render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByRole("heading", { name: "Verified source" })).toBeInTheDocument()
    expect(screen.getByText(/98\.69%/)).toBeInTheDocument()
    expect(screen.getByText("0748786d")).toBeInTheDocument()
    expect(screen.queryByText(frbtc.commit)).toBeNull() // the full 40-char sha is not printed
  })

  it("renders the repo as plain text when the explorer serves it from its own database", () => {
    const { container } = render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByText("subfrost/subfrost-alkanes")).toBeInTheDocument()
    // subfrost/subfrost-alkanes 404s on GitHub even authenticated: linking it would ship
    // the reader to an error page.
    expect(container.querySelector('a[href="https://github.com/subfrost/subfrost-alkanes"]')).toBeNull()
  })

  it("links the repo to GitHub when the explorer lists it live, which proves it is public", () => {
    render(<VerifiedSourcePanel v={goji} copy={copy} />)
    expect(screen.getByRole("link", { name: /Misha-btc\/Goji/ })).toHaveAttribute(
      "href", "https://github.com/Misha-btc/Goji")
  })

  it("always links out to the explorer's source browser for that alkane", () => {
    render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByRole("link", { name: /Browse the source on the explorer/ })).toHaveAttribute(
      "href", "https://explorer.subfrost.io/alkane/32:0/source")
  })

  it("shows the verdict label and note that belong to each outcome", () => {
    const { rerender } = render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByText("Verified")).toBeInTheDocument()
    expect(screen.getByText(/host-dependent residual/)).toBeInTheDocument()
    expect(screen.queryByText(/byte-exact/)).toBeNull()

    rerender(<VerifiedSourcePanel v={goji} copy={copy} />)
    expect(screen.getByText("Reproducible")).toBeInTheDocument()
    expect(screen.getByText(/byte-exact/)).toBeInTheDocument()
    expect(screen.queryByText(/host-dependent residual/)).toBeNull()
  })

  it("renders a whole-number match without a trailing .00 lie about precision", () => {
    render(<VerifiedSourcePanel v={goji} copy={copy} />)
    expect(screen.getByText(/100%/)).toBeInTheDocument()
  })

  it("truncates a near-100 match instead of rounding it up to a false 100%", () => {
    render(<VerifiedSourcePanel v={{ ...frbtc, matchPct: 99.996 }} copy={copy} />)
    expect(screen.queryByText(/100%/)).toBeNull()
    expect(screen.getByText(/99\.99%/)).toBeInTheDocument()
  })

  it("trims a trailing zero without rounding a two-decimal match", () => {
    render(<VerifiedSourcePanel v={{ ...frbtc, matchPct: 98.6 }} copy={copy} />)
    expect(screen.getByText(/98\.6%/)).toBeInTheDocument()
    expect(screen.queryByText(/98\.60%/)).toBeNull()
  })
})
