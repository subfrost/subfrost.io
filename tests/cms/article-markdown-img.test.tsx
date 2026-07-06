import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { Markdown } from "@/lib/cms/markdown"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("Markdown inline images", () => {
  it("renders body images through SmartPicture (<picture> for .opt.)", () => {
    const { container } = render(<Markdown>{`![c](${B}/inline/f-ab12cd34.opt.png)`}</Markdown>)
    expect(container.querySelector("picture source[type='image/avif']")).not.toBeNull()
  })
  it("keeps a plain <img> with lazy loading for external images", () => {
    const { container } = render(<Markdown>{`![c](https://imgur.com/x.png)`}</Markdown>)
    expect(container.querySelector("picture")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy")
  })
})

const B2 = "https://storage.googleapis.com/subfrost-cms"
const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="currentColor">hi</text></svg>'

describe("Markdown inline chart SVGs", () => {
  it("inlines an our-bucket .svg when a map entry exists", () => {
    const map = new Map([[`${B2}/inline/c.svg`, SAMPLE]])
    const { container } = render(
      <Markdown inlinedSvgs={map}>{`![chart](${B2}/inline/c.svg)`}</Markdown>,
    )
    expect(container.querySelector("figure.ed-figure svg")).not.toBeNull()
    expect(container.querySelector("figure.ed-figure")?.getAttribute("aria-label")).toBe("chart")
    expect(container.querySelector("img")).toBeNull()
  })
  it("falls back to <img> for a chart .svg with no map entry (client context)", () => {
    const { container } = render(<Markdown>{`![c](${B2}/inline/c.svg)`}</Markdown>)
    expect(container.querySelector("figure.ed-figure")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(`${B2}/inline/c.svg`)
  })
})
