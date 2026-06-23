import { render } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

// geist/font uses next/font internally, which can't load in the test runtime —
// mock the variable strings so the component under test can render.
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "__geist_sans" } }))
vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "__geist_mono" } }))

import { EditorialThemeScope } from "@/components/articles/EditorialThemeScope"

describe("EditorialThemeScope", () => {
  it("scopes children under data-ed-theme=light so the --ed-* vars resolve", () => {
    const { container } = render(
      <EditorialThemeScope>
        <p>article body</p>
      </EditorialThemeScope>,
    )
    const scope = container.querySelector("[data-ed-theme]") as HTMLElement | null
    expect(scope).not.toBeNull()
    // The whole point of the fix: the wrapper carries the editorial theme so the
    // ArticleView's var(--ed-ink)/var(--ed-muted) resolve instead of inheriting
    // the admin theme (which left the text invisible).
    expect(scope!.getAttribute("data-ed-theme")).toBe("light")
    // Editorial canvas background (white in light) — fixes the "blank/white" display.
    expect(scope!.getAttribute("style") ?? "").toContain("var(--ed-canvas)")
    expect(scope).toHaveTextContent("article body")
  })

  it("appends the caller's className alongside the font variables", () => {
    const { container } = render(
      <EditorialThemeScope className="flex-1">
        <span>x</span>
      </EditorialThemeScope>,
    )
    const scope = container.querySelector("[data-ed-theme]") as HTMLElement
    expect(scope.className).toContain("flex-1")
    expect(scope.className).toContain("__geist_sans")
  })
})
