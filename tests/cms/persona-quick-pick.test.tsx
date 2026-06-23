import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"
import { PersonaQuickPick } from "@/components/cms/PersonaQuickPick"

const ALL = ["articles.write", "articles.edit_any", "articles.publish"]

beforeEach(() => cleanup())

describe("PersonaQuickPick", () => {
  it("renders a button per persona", () => {
    const { getByText } = render(<PersonaQuickPick value={[]} onChange={() => {}} grantable={ALL} />)
    expect(getByText("Articles editor")).toBeTruthy()
    expect(getByText("Articles superuser")).toBeTruthy()
  })

  it("clicking 'Articles superuser' grants edit_any (+ implied write)", () => {
    const onChange = vi.fn()
    const { getByText } = render(<PersonaQuickPick value={[]} onChange={onChange} grantable={ALL} />)
    fireEvent.click(getByText("Articles superuser"))
    const next = onChange.mock.calls[0][0] as string[]
    expect(next).toContain("articles.edit_any")
    expect(next).toContain("articles.write")
  })

  it("disables a persona whose privilege isn't grantable", () => {
    const onChange = vi.fn()
    // actor can only grant articles.write → superuser persona is not grantable
    const { getByText } = render(<PersonaQuickPick value={[]} onChange={onChange} grantable={["articles.write"]} />)
    const btn = getByText("Articles superuser").closest("button")!
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onChange).not.toHaveBeenCalled()
  })
})
