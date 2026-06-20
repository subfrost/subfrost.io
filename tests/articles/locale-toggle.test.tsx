import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"

const push = vi.fn()
let search = ""
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/articles/foo",
  useSearchParams: () => new URLSearchParams(search),
}))

import { LocaleToggle } from "@/components/articles/LocaleToggle"

describe("LocaleToggle", () => {
  beforeEach(() => {
    push.mockClear()
    search = ""
  })

  it("renders the 文 glyph", () => {
    const { getByRole } = render(<LocaleToggle />)
    expect(getByRole("button").textContent).toContain("文")
  })

  it("toggles en→zh by pushing ?lang=zh", () => {
    search = ""
    const { getByRole } = render(<LocaleToggle />)
    fireEvent.click(getByRole("button"))
    expect(push).toHaveBeenCalledWith("/articles/foo?lang=zh")
  })

  it("toggles zh→en by pushing ?lang=en", () => {
    search = "lang=zh"
    const { getByRole } = render(<LocaleToggle />)
    fireEvent.click(getByRole("button"))
    expect(push).toHaveBeenCalledWith("/articles/foo?lang=en")
  })
})
