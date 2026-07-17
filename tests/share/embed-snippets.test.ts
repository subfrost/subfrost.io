import { describe, it, expect } from "vitest"
import { embedSnippets } from "@/lib/share"

const IMG = "https://subfrost.io/metrics/card/opreturn?metric=alkanesOfOpReturnShare&window=avg7&theme=dark"

describe("embedSnippets", () => {
  it("markdown wraps alt + url in image syntax", () => {
    const { markdown } = embedSnippets({ imageUrl: IMG, alt: "Alkanes share of OP_RETURN" })
    expect(markdown).toBe(`![Alkanes share of OP_RETURN](${IMG})`)
  })

  it("html escapes & in the src so the tag stays valid", () => {
    const { html } = embedSnippets({ imageUrl: IMG, alt: "Alkanes share of OP_RETURN" })
    // raw & from the querystring must become &amp; inside an attribute
    expect(html).toContain('src="https://subfrost.io/metrics/card/opreturn?metric=alkanesOfOpReturnShare&amp;window=avg7&amp;theme=dark"')
    expect(html).toContain('alt="Alkanes share of OP_RETURN"')
    expect(html).toContain('width="600"')
    expect(html).not.toContain("&window") // no un-escaped ampersand
  })

  it("html escapes quotes and angle brackets in the alt", () => {
    const { html } = embedSnippets({ imageUrl: "https://x/y", alt: 'a "b" <c>' })
    expect(html).toContain('alt="a &quot;b&quot; &lt;c&gt;"')
  })

  it("markdown strips brackets from the alt so it can't break the ![] syntax", () => {
    const { markdown } = embedSnippets({ imageUrl: "https://x/y", alt: "a [b] c" })
    expect(markdown).toBe("![a b c](https://x/y)")
  })

  it("url is the image url verbatim", () => {
    const { url } = embedSnippets({ imageUrl: IMG, alt: "whatever" })
    expect(url).toBe(IMG)
  })
})
