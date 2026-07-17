import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, fireEvent } from "@testing-library/react"
import { LOCALE_COOKIE } from "@/lib/i18n/cookie"

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
    vi.useRealTimers()
  })

  it("renders the 文 glyph", () => {
    const { getByRole } = render(<LocaleToggle />)
    expect(getByRole("button").textContent).toContain("文")
  })

  it("toggles en→zh by pushing ?lang=zh", () => {
    vi.useFakeTimers()
    search = ""
    const { getByRole } = render(<LocaleToggle />)
    fireEvent.click(getByRole("button"))
    act(() => vi.advanceTimersByTime(200))
    expect(push).toHaveBeenCalledWith("/articles/foo?lang=zh", { scroll: false })
  })

  it("toggles zh→en by pushing ?lang=en", () => {
    vi.useFakeTimers()
    search = "lang=zh"
    const { getByRole } = render(<LocaleToggle />)
    fireEvent.click(getByRole("button"))
    act(() => vi.advanceTimersByTime(200))
    expect(push).toHaveBeenCalledWith("/articles/foo?lang=en", { scroll: false })
  })

  it("persists the locale cookie when toggling to zh", () => {
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`
    search = ""
    const { getByRole } = render(<LocaleToggle />)
    fireEvent.click(getByRole("button"))
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=zh`)
  })
})
