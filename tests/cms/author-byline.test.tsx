import { describe, it, expect, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { AuthorByline } from "@/components/articles/AuthorByline"

beforeEach(() => cleanup())

const author = { id: "u1", name: "Vitor", avatarUrl: null, bio: null, twitter: null }
const gabe = { id: "u2", name: "Gabe", avatarUrl: null, bio: null, twitter: null }

describe("AuthorByline — coAuthors", () => {
  it("renders only the primary author when there are no coAuthors", () => {
    const { container, getByText } = render(
      <AuthorByline author={author} publishedAt={null} readingMinutes={3} />,
    )
    expect(getByText("Vitor")).toBeTruthy()
    expect(container.querySelectorAll('a[href^="/authors/"]').length).toBe(1)
  })

  it("renders both authors, each linking to its author page", () => {
    const { container, getByText } = render(
      <AuthorByline author={author} coAuthors={[gabe]} publishedAt={null} readingMinutes={3} />,
    )
    expect(getByText("Vitor")).toBeTruthy()
    expect(getByText("Gabe")).toBeTruthy()
    expect(container.querySelector('a[href="/authors/u1"]')).toBeTruthy()
    expect(container.querySelector('a[href="/authors/u2"]')).toBeTruthy()
  })

  it("does not link names when linkAuthor is false (card context)", () => {
    const { container, getByText } = render(
      <AuthorByline author={author} coAuthors={[gabe]} publishedAt={null} readingMinutes={3} variant="compact" linkAuthor={false} />,
    )
    expect(getByText("Gabe")).toBeTruthy()
    expect(container.querySelector('a[href^="/authors/"]')).toBeNull()
  })
})
