import { Fragment } from "react"
import matter from "gray-matter"
import {
  Document,
  Page,
  View,
  Text,
  Link,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"

// Server-side Markdown → printable PDF renderer.
//
// This is a *pure-JS* path: @react-pdf/renderer draws the PDF with its own
// layout engine and pdfkit — there is NO headless Chromium/Playwright involved,
// so it runs inside the Alpine standalone Next.js image with no extra system
// packages. It uses only the 14 built-in PDF fonts (Times/Helvetica/Courier),
// so no font files need to be bundled either.
//
// `renderMarkdownPdf(markdown, { title })` returns a real `Buffer` whose first
// bytes are the `%PDF` magic. The e-sign workstream can import this helper to
// turn a Markdown agreement into an `application/pdf` for signature — it is the
// single source of truth for "markdown → PDF" in the app.

export interface RenderMarkdownPdfOptions {
  /** Rendered as an H1-style title band at the top of the first page. */
  title?: string
}

// --- print-suitable styles (Letter, serif body, generous margins) ----------

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 64,
    fontFamily: "Times-Roman",
    fontSize: 11,
    lineHeight: 1.5,
    color: "#111111",
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    marginBottom: 16,
    color: "#000000",
  },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 18, marginTop: 16, marginBottom: 6 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 14, marginBottom: 6 },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 12, marginBottom: 4 },
  h4: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 10, marginBottom: 4 },
  h5: { fontFamily: "Helvetica-Oblique", fontSize: 11, marginTop: 8, marginBottom: 3 },
  h6: { fontFamily: "Helvetica-Oblique", fontSize: 10, marginTop: 8, marginBottom: 3, color: "#444444" },
  paragraph: { marginBottom: 8 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  listBullet: { width: 18, textAlign: "right", paddingRight: 6 },
  listContent: { flex: 1 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#cccccc",
    paddingLeft: 10,
    marginVertical: 6,
    color: "#444444",
    fontFamily: "Times-Italic",
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: "#f4f4f5",
    padding: 8,
    marginVertical: 6,
    borderRadius: 3,
    lineHeight: 1.4,
  },
  hr: { borderBottomWidth: 1, borderBottomColor: "#dddddd", marginVertical: 10 },
  code: { fontFamily: "Courier", fontSize: 9.5, backgroundColor: "#f4f4f5" },
  link: { color: "#1d4ed8", textDecoration: "underline" },
  table: { marginVertical: 8, borderWidth: 1, borderColor: "#cccccc" },
  tableRow: { flexDirection: "row" },
  tableCell: {
    flex: 1,
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: "#cccccc",
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    fontSize: 10,
  },
  tableHeadCell: { fontFamily: "Helvetica-Bold", backgroundColor: "#f0f0f0" },
})

// --- inline parsing (bold / italic / code / links) --------------------------

type Span =
  | { t: "text"; v: string; bold?: boolean; italic?: boolean; code?: boolean }
  | { t: "link"; v: string; href: string; bold?: boolean; italic?: boolean }

/** Tokenize a run of inline markdown into styled spans. Kept intentionally
 *  small: bold (**), italic (* or _), inline code (`), links [t](u). */
function parseInline(src: string): Span[] {
  const spans: Span[] = []
  let i = 0
  let buf = ""
  const flush = () => {
    if (buf) spans.push({ t: "text", v: buf })
    buf = ""
  }
  while (i < src.length) {
    const rest = src.slice(i)
    // inline code — highest precedence, no nested formatting
    let m = rest.match(/^`([^`]+)`/)
    if (m) {
      flush()
      spans.push({ t: "text", v: m[1], code: true })
      i += m[0].length
      continue
    }
    // link [text](href)
    m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)[^)]*\)/)
    if (m) {
      flush()
      spans.push({ t: "link", v: m[1], href: m[2] })
      i += m[0].length
      continue
    }
    // bold **text** or __text__
    m = rest.match(/^(\*\*|__)(.+?)\1/)
    if (m) {
      flush()
      for (const s of parseInline(m[2])) spans.push({ ...s, bold: true })
      i += m[0].length
      continue
    }
    // italic *text* or _text_
    m = rest.match(/^(\*|_)(?!\s)(.+?)(?<!\s)\1/)
    if (m) {
      flush()
      for (const s of parseInline(m[2])) spans.push({ ...s, italic: true })
      i += m[0].length
      continue
    }
    buf += src[i]
    i += 1
  }
  flush()
  return spans
}

function spanFont(bold?: boolean, italic?: boolean): string {
  if (bold && italic) return "Times-BoldItalic"
  if (bold) return "Times-Bold"
  if (italic) return "Times-Italic"
  return "Times-Roman"
}

function InlineText({ src }: { src: string }) {
  const spans = parseInline(src)
  return (
    <Fragment>
      {spans.map((s, idx) => {
        if (s.t === "link") {
          return (
            <Link key={idx} src={s.href} style={[styles.link, { fontFamily: spanFont(s.bold, s.italic) }]}>
              {s.v}
            </Link>
          )
        }
        if (s.code) {
          return (
            <Text key={idx} style={styles.code}>
              {s.v}
            </Text>
          )
        }
        return (
          <Text key={idx} style={{ fontFamily: spanFont(s.bold, s.italic) }}>
            {s.v}
          </Text>
        )
      })}
    </Fragment>
  )
}

// --- block parsing ----------------------------------------------------------

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "hr" }
  | { type: "table"; header: string[]; rows: string[][] }

function splitRow(line: string): string[] {
  // drop leading/trailing pipe, split on unescaped pipes
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|").map((c) => c.trim())
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-")
}

/** Parse markdown source (frontmatter already stripped) into a flat block list. */
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // fenced code
    const fence = line.match(/^\s*(```|~~~)/)
    if (fence) {
      const marker = fence[1]
      i += 1
      const code: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        code.push(lines[i])
        i += 1
      }
      i += 1 // closing fence
      blocks.push({ type: "code", text: code.join("\n") })
      continue
    }

    // blank line
    if (line.trim() === "") {
      i += 1
      continue
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2].replace(/#+\s*$/, "").trim() })
      i += 1
      continue
    }

    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "hr" })
      i += 1
      continue
    }

    // table (header row + divider)
    if (line.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      blocks.push({ type: "table", header, rows })
      continue
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""))
        i += 1
      }
      blocks.push({ type: "blockquote", text: quote.join("\n") })
      continue
    }

    // list (grouped consecutive items)
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2])
      const items: string[] = []
      while (i < lines.length) {
        const lm = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
        if (!lm) break
        items.push(lm[3])
        i += 1
      }
      blocks.push({ type: "list", ordered, items })
      continue
    }

    // paragraph (accumulate until blank / block boundary)
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*(```|~~~)/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i += 1
    }
    blocks.push({ type: "paragraph", text: para.join(" ") })
  }
  return blocks
}

const HEADING_STYLE = [styles.h1, styles.h2, styles.h3, styles.h4, styles.h5, styles.h6]

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const style = HEADING_STYLE[block.level - 1] ?? styles.h6
      // minPresenceAhead keeps a heading from being orphaned at a page bottom.
      return (
        <Text style={style} minPresenceAhead={48} wrap={false}>
          <InlineText src={block.text} />
        </Text>
      )
    }
    case "paragraph":
      return (
        <Text style={styles.paragraph}>
          <InlineText src={block.text} />
        </Text>
      )
    case "code":
      return (
        <View style={styles.codeBlock}>
          <Text>{block.text}</Text>
        </View>
      )
    case "blockquote":
      return (
        <View style={styles.blockquote}>
          <Text>
            <InlineText src={block.text} />
          </Text>
        </View>
      )
    case "hr":
      return <View style={styles.hr} />
    case "list":
      return (
        <View style={{ marginBottom: 8 }}>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.listBullet}>{block.ordered ? `${idx + 1}.` : "•"}</Text>
              <Text style={styles.listContent}>
                <InlineText src={item} />
              </Text>
            </View>
          ))}
        </View>
      )
    case "table":
      return (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            {block.header.map((cell, idx) => (
              <Text key={idx} style={[styles.tableCell, styles.tableHeadCell]}>
                <InlineText src={cell} />
              </Text>
            ))}
          </View>
          {block.rows.map((row, r) => (
            <View key={r} style={styles.tableRow} wrap={false}>
              {block.header.map((_, c) => (
                <Text key={c} style={styles.tableCell}>
                  <InlineText src={row[c] ?? ""} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      )
  }
}

function MarkdownDocument({ blocks, title }: { blocks: Block[]; title?: string }) {
  return (
    <Document title={title}>
      <Page size="LETTER" style={styles.page}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {blocks.map((block, idx) => (
          <BlockView key={idx} block={block} />
        ))}
      </Page>
    </Document>
  )
}

/**
 * Render a Markdown string to a printable PDF `Buffer` (Letter, serif body,
 * styled headings/lists/tables/code). Pure JS — no headless browser.
 *
 * @param markdown  Raw markdown source (frontmatter is stripped automatically).
 * @param opts.title  Optional title band rendered at the top of page one.
 * @returns A PDF `Buffer` (starts with the `%PDF` magic).
 *
 * @example
 *   const pdf = await renderMarkdownPdf(agreementMd, { title: "NDA" })
 *   // pdf is application/pdf bytes — stream it, upload it, or feed e-sign.
 */
export async function renderMarkdownPdf(
  markdown: string,
  opts: RenderMarkdownPdfOptions = {},
): Promise<Buffer> {
  // Strip YAML frontmatter; if a title isn't supplied, fall back to its `title`.
  let body = markdown
  let title = opts.title
  try {
    const parsed = matter(markdown)
    body = parsed.content
    if (!title && typeof parsed.data?.title === "string") title = parsed.data.title
  } catch {
    // malformed frontmatter — render the raw source
  }
  const blocks = parseBlocks(body)
  return renderToBuffer(<MarkdownDocument blocks={blocks} title={title} />)
}
