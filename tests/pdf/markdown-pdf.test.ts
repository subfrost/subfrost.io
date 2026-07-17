import { describe, it, expect } from "vitest"
import { renderMarkdownPdf } from "@/lib/pdf/markdown-pdf"

const SAMPLE = `---
title: Frontmatter Title
---

# Heading One

Some **bold** and *italic* and \`inline code\` plus a [link](https://example.com).

## Lists

- one
- two
- three

1. first
2. second

## Table

| Name | Role |
| ---- | ---- |
| Alice | Admin |
| Bob | User |

> A blockquote line.

\`\`\`ts
const x = 1
console.log(x)
\`\`\`

---

Final paragraph.
`

describe("renderMarkdownPdf", () => {
  it("produces a non-empty Buffer that starts with the %PDF magic", async () => {
    const pdf = await renderMarkdownPdf(SAMPLE, { title: "Test Doc" })
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.byteLength).toBeGreaterThan(0)
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF")
  })

  it("renders even with no options and empty-ish input", async () => {
    const pdf = await renderMarkdownPdf("# Just a heading")
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-")
    expect(pdf.byteLength).toBeGreaterThan(100)
  })
})
