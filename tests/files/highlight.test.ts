import { describe, it, expect } from "vitest"
import { highlightSnippet } from "@/components/cms/files/util"

describe("highlightSnippet", () => {
  it("converts %%HL%% sentinels to <mark>", () => {
    const out = highlightSnippet("a %%HL%%SAFE%%EH%% deal")
    expect(out).toContain("<mark")
    expect(out).toContain("SAFE</mark>")
    expect(out).not.toContain("%%HL%%")
    expect(out).not.toContain("%%EH%%")
  })

  it("escapes attacker-controlled HTML in document text (no injection)", () => {
    const out = highlightSnippet('before <img src=x onerror=alert(1)> and %%HL%%hit%%EH%%')
    expect(out).not.toContain("<img")
    expect(out).toContain("&lt;img")
    // the only real tag emitted is the highlight mark
    expect(out).toContain("<mark")
    expect(out).toContain("hit</mark>")
  })

  it("escapes ampersands and angle brackets", () => {
    expect(highlightSnippet("A & B < C > D")).toBe("A &amp; B &lt; C &gt; D")
  })

  it("is a no-op on plain text with no sentinels", () => {
    expect(highlightSnippet("just text")).toBe("just text")
  })
})
