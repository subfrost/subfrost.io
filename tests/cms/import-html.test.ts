import { describe, it, expect } from "vitest"
import { htmlToMarkdown, isRichHtml, importedMarkdownFromClipboard } from "@/lib/cms/import-html"

// Minimal reproductions of the HTML Google Docs actually puts on the clipboard.
const gdocsWrap = (inner: string) =>
  `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc">${inner}</b>`

describe("htmlToMarkdown — blocks", () => {
  it("converts paragraphs separated by blank lines", () => {
    const html = gdocsWrap(`<p dir="ltr"><span>First para.</span></p><p dir="ltr"><span>Second para.</span></p>`)
    expect(htmlToMarkdown(html)).toBe("First para.\n\nSecond para.")
  })

  it("maps headings and clamps below h3 to ###", () => {
    const html = gdocsWrap(`<h1><span>Title</span></h1><h2><span>Sub</span></h2><h4><span>Deep</span></h4>`)
    expect(htmlToMarkdown(html)).toBe("# Title\n\n## Sub\n\n### Deep")
  })

  it("converts unordered and ordered lists", () => {
    const html = gdocsWrap(`<ul><li><span>one</span></li><li><span>two</span></li></ul>`)
    expect(htmlToMarkdown(html)).toBe("- one\n- two")
    const ol = gdocsWrap(`<ol><li><span>a</span></li><li><span>b</span></li></ol>`)
    expect(htmlToMarkdown(ol)).toBe("1. a\n2. b")
  })

  it("indents a nested list", () => {
    const html = gdocsWrap(`<ul><li><span>parent</span><ul><li><span>child</span></li></ul></li></ul>`)
    expect(htmlToMarkdown(html)).toBe("- parent\n  - child")
  })

  it("converts a blockquote", () => {
    const html = gdocsWrap(`<blockquote><p><span>quoted line</span></p></blockquote>`)
    expect(htmlToMarkdown(html)).toBe("> quoted line")
  })
})

describe("htmlToMarkdown — inline & Google Docs quirks", () => {
  it("treats font-weight:700 spans as bold but NOT the normal-weight wrapper", () => {
    const html = gdocsWrap(`<p><span>plain </span><span style="font-weight:700">bold</span></p>`)
    expect(htmlToMarkdown(html)).toBe("plain **bold**")
  })

  it("does not double-wrap nested equal-weight spans", () => {
    const html = gdocsWrap(`<p><span style="font-weight:700"><span style="font-weight:700">x</span></span></p>`)
    expect(htmlToMarkdown(html)).toBe("**x**")
  })

  it("treats font-style:italic as italic", () => {
    const html = gdocsWrap(`<p><span style="font-style:italic">em</span></p>`)
    expect(htmlToMarkdown(html)).toBe("*em*")
  })

  it("combines bold+italic", () => {
    const html = gdocsWrap(`<p><span style="font-weight:700;font-style:italic">both</span></p>`)
    expect(htmlToMarkdown(html)).toBe("***both***")
  })

  it("unwraps the Google redirect from links", () => {
    const href = "https://www.google.com/url?q=https://subfrost.io/data&sa=D&source=editors"
    const html = gdocsWrap(`<p><a href="${href}"><span>data</span></a></p>`)
    expect(htmlToMarkdown(html)).toBe("[data](https://subfrost.io/data)")
  })

  it("keeps a plain href untouched", () => {
    const html = gdocsWrap(`<p><a href="https://subfrost.io"><span>site</span></a></p>`)
    expect(htmlToMarkdown(html)).toBe("[site](https://subfrost.io)")
  })
})

describe("isRichHtml / importedMarkdownFromClipboard", () => {
  it("returns false for empty or trivial html", () => {
    expect(isRichHtml("")).toBe(false)
    expect(isRichHtml("<div>just text</div>")).toBe(false)
    expect(importedMarkdownFromClipboard("")).toBeNull()
    expect(importedMarkdownFromClipboard("<div>just text</div>")).toBeNull()
  })

  it("returns markdown for rich Google Docs html", () => {
    const html = gdocsWrap(`<p><span style="font-weight:700">Hi</span></p>`)
    expect(isRichHtml(html)).toBe(true)
    expect(importedMarkdownFromClipboard(html)).toBe("**Hi**")
  })
})
