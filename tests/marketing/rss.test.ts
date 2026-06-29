import { describe, it, expect } from "vitest"
import { buildRssXml, type RssItem } from "@/lib/cms/rss"

const channel = { title: "SUBFROST", link: "https://subfrost.io", description: "Updates", selfUrl: "https://subfrost.io/feed.xml" }
const base: RssItem = {
  title: "Hello", link: "https://subfrost.io/articles/hello", guid: "a1",
  pubDate: new Date("2026-06-27T00:00:00.000Z"), description: "An intro", contentHtml: null,
}

describe("buildRssXml", () => {
  it("emits a well-formed RSS 2.0 document", () => {
    const xml = buildRssXml(channel, [base])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain("<title>SUBFROST</title>")
    expect(xml).toContain("<link>https://subfrost.io/articles/hello</link>")
    expect(xml).toContain("Sat, 27 Jun 2026 00:00:00 GMT")
  })

  it("escapes XML special characters in titles", () => {
    const xml = buildRssXml(channel, [{ ...base, title: 'A & B <c> "d"' }])
    expect(xml).toContain("A &amp; B &lt;c&gt; &quot;d&quot;")
    expect(xml).not.toContain("<c>")
  })

  it("wraps contentHtml in CDATA via content:encoded", () => {
    const xml = buildRssXml(channel, [{ ...base, contentHtml: "<p>Body & more</p>" }])
    expect(xml).toContain("<content:encoded><![CDATA[<p>Body & more</p>]]></content:encoded>")
  })

  it("omits content:encoded when contentHtml is null", () => {
    const xml = buildRssXml(channel, [base])
    expect(xml).not.toContain("content:encoded")
  })
})
