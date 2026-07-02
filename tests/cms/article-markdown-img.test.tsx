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
