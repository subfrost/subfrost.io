import { describe, it, expect, beforeEach } from "vitest"
import { serializeSelection, locateAnchor } from "@/lib/cms/annotation-anchor"

function mount(html: string): HTMLDivElement {
  const root = document.createElement("div")
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

/** Build a Range for the first occurrence of `quote` in a single-text-node p. */
function selectQuote(root: HTMLElement, quote: string): Range {
  const textNode = root.querySelector("p")!.firstChild as Text
  const idx = textNode.data.indexOf(quote)
  const range = document.createRange()
  range.setStart(textNode, idx)
  range.setEnd(textNode, idx + quote.length)
  return range
}

describe("annotation-anchor", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("serializes a selection into a quote + context anchor", () => {
    const root = mount("<p>The quick brown fox jumps over the lazy dog</p>")
    const anchor = serializeSelection(selectQuote(root, "brown fox"), root)
    expect(anchor.quote).toBe("brown fox")
    expect(anchor.prefix.endsWith("The quick ")).toBe(true)
    expect(anchor.suffix.startsWith(" jumps")).toBe(true)
    expect(anchor.blockIndex).toBe(0)
  })

  it("re-finds the quote unchanged", () => {
    const root = mount("<p>The quick brown fox jumps over the lazy dog</p>")
    const anchor = serializeSelection(selectQuote(root, "brown fox"), root)
    const located = locateAnchor(anchor, root)
    expect(located).not.toBeNull()
    expect(located!.toString()).toBe("brown fox")
  })

  it("re-finds the quote after surrounding text edits", () => {
    const original = mount("<p>The quick brown fox jumps over the lazy dog</p>")
    const anchor = serializeSelection(selectQuote(original, "brown fox"), original)

    // Edit words around the quote; the quote itself survives.
    const edited = mount("<p>A very quick brown fox leaps right over a lazy dog</p>")
    const located = locateAnchor(anchor, edited)
    expect(located).not.toBeNull()
    expect(located!.toString()).toBe("brown fox")
  })

  it("returns null (→ ORPHANED) when the quote is deleted", () => {
    const original = mount("<p>The quick brown fox jumps over the lazy dog</p>")
    const anchor = serializeSelection(selectQuote(original, "brown fox"), original)

    const edited = mount("<p>The quick red panda climbs a tall tree</p>")
    expect(locateAnchor(anchor, edited)).toBeNull()
  })

  it("disambiguates duplicate quotes by neighbourhood context", () => {
    const original = mount("<p>alpha target beta and gamma target delta</p>")
    const textNode = original.querySelector("p")!.firstChild as Text
    // Select the SECOND "target".
    const second = textNode.data.indexOf("target", textNode.data.indexOf("target") + 1)
    const range = document.createRange()
    range.setStart(textNode, second)
    range.setEnd(textNode, second + "target".length)
    const anchor = serializeSelection(range, original)

    const located = locateAnchor(anchor, original)
    expect(located).not.toBeNull()
    // The re-located range should sit at the second occurrence (after "gamma ").
    const before = original.querySelector("p")!.textContent!.slice(0, located!.startOffset)
    expect(before.endsWith("gamma ")).toBe(true)
  })
})
