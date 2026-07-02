import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { SmartPicture } from "@/components/articles/SmartPicture"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("SmartPicture", () => {
  it("emits <picture> with avif+webp for an .opt. url", () => {
    const { container } = render(<SmartPicture src={`${B}/inline/f-ab12cd34.opt.png`} alt="" />)
    const sources = container.querySelectorAll("source")
    expect(sources[0].getAttribute("type")).toBe("image/avif")
    expect(sources[0].getAttribute("srcset")).toContain(".opt.avif")
    expect(sources[1].getAttribute("type")).toBe("image/webp")
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy")
  })
  it("emits a plain <img> for a non-.opt. url", () => {
    const { container } = render(<SmartPicture src={`${B}/inline/old-16394.png`} alt="" />)
    expect(container.querySelector("picture")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toContain("old-16394.png")
  })
})
