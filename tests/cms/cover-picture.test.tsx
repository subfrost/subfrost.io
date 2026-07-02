import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { CmsCoverImage } from "@/components/articles/CmsCoverImage"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("CmsCoverImage", () => {
  it("uses <picture> with avif for an .opt. cover", () => {
    const { container } = render(<CmsCoverImage src={`${B}/covers/c-ab12cd34.opt.png`} className="x" fallbackVariant="s" />)
    expect(container.querySelector("picture source[type='image/avif']")).not.toBeNull()
  })
  it("keeps a plain <img> for a non-.opt. cover", () => {
    const { container } = render(<CmsCoverImage src={`${B}/covers/old-16394.png`} className="x" fallbackVariant="s" />)
    expect(container.querySelector("picture")).toBeNull()
    expect(container.querySelector("img.ed-cms-cover")).not.toBeNull()
  })
})
