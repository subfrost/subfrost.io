// Markdown <-> contentEditable-HTML bridge for the /admin article editor.
//
// The editor body is a contentEditable surface. On load we render the stored
// markdown to HTML (markdownToEditorHtml); on every keystroke we serialize the
// live DOM back to markdown (editorDomToMarkdown). Keeping both directions here,
// pure and DOM-only, lets us unit-test the round-trip without React or a browser.
//
// These are intentionally small hand-rolled converters — not a full markdown
// engine — covering the block types the toolbar can produce: paragraphs,
// headings (h1-h3), blockquotes, unordered/ordered lists, code fences and images,
// plus inline bold/italic/code/links.

/** Tags whose presence as a child means an element wraps real block content
 *  rather than inline text. Chromium's `execCommand("insertUnorderedList")` on a
 *  multi-paragraph selection nests the new `<ul>` inside a `<p>` (or `<div>`); a
 *  serializer that only recognises top-level lists would otherwise collapse such a
 *  list to run-on text with no line breaks. See editor-markdown.test.ts. */
const BLOCK_CHILD_TAGS = new Set([
  "p", "div", "section", "article",
  "ul", "ol", "blockquote", "figure", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
])

export function markdownToEditorHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const html: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }

    const image = line.match(/^!\[(.*?)]\((.*?)\)\s*$/)
    if (image) {
      html.push(`<figure data-md-image="true"><img src="${escapeAttribute(image[2])}" alt="${escapeAttribute(image[1])}"><figcaption>${escapeHtml(image[1])}</figcaption></figure>`)
      i += 1
      continue
    }

    if (line.startsWith("```")) {
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i])
        i += 1
      }
      i += lines[i]?.startsWith("```") ? 1 : 0
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`)
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      html.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`)
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""))
        i += 1
      }
      html.push(`<blockquote>${formatInlineMarkdown(quote.join("<br>"))}</blockquote>`)
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${formatInlineMarkdown(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join("")}</ul>`)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${formatInlineMarkdown(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`)
        i += 1
      }
      html.push(`<ol>${items.join("")}</ol>`)
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(!\[.*?]\(.*?\)|```|#{1,3}\s+|>\s?|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])
    ) {
      para.push(lines[i])
      i += 1
    }
    html.push(`<p>${formatInlineMarkdown(para.join("<br>"))}</p>`)
  }

  return html.join("") || "<p><br></p>"
}

export function editorDomToMarkdown(root: HTMLElement) {
  return serializeChildBlocks(root)
}

/** Serialize an element's child nodes as top-level markdown blocks, separated by
 *  blank lines. Shared by the root walk and by wrapper descent. */
function serializeChildBlocks(node: Node): string {
  return Array.from(node.childNodes)
    .map((child) => blockNodeToMarkdown(child))
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

/** True when `node` wraps at least one block-level child element (a list,
 *  heading, blockquote, nested paragraph, ...) — i.e. it is a container, not an
 *  inline paragraph. */
function hasBlockChild(node: HTMLElement): boolean {
  return Array.from(node.children).some((child) => BLOCK_CHILD_TAGS.has(child.tagName.toLowerCase()))
}

function blockNodeToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? ""
  if (!(node instanceof HTMLElement)) return ""

  const tag = node.tagName.toLowerCase()

  if (tag === "figure") {
    const img = node.querySelector("img")
    if (!img) return ""
    const alt = img.getAttribute("alt") || node.querySelector("figcaption")?.textContent?.trim() || "image"
    return `![${escapeMarkdownText(alt)}](${img.getAttribute("src") || ""})`
  }

  if (tag === "img") {
    return `![${escapeMarkdownText(node.getAttribute("alt") || "image")}](${node.getAttribute("src") || ""})`
  }

  if (tag === "h1") return `# ${inlineNodeToMarkdown(node).trim()}`
  if (tag === "h2") return `## ${inlineNodeToMarkdown(node).trim()}`
  if (tag === "h3") return `### ${inlineNodeToMarkdown(node).trim()}`
  if (tag === "blockquote") {
    return inlineNodeToMarkdown(node)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
      .trim()
  }
  if (tag === "ul") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((li) => `- ${inlineNodeToMarkdown(li).trim()}`)
      .join("\n")
  }
  if (tag === "ol") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((li, index) => `${index + 1}. ${inlineNodeToMarkdown(li).trim()}`)
      .join("\n")
  }
  if (tag === "pre") return `\`\`\`\n${node.textContent?.replace(/\n+$/, "") ?? ""}\n\`\`\``

  // A wrapper element (typically a <p> or <div>) that contains block-level
  // children — most often a list the browser nested inside a paragraph while
  // editing. Descend and serialize the inner blocks so their line breaks survive,
  // instead of flattening to inline text and gluing the list items together.
  if (hasBlockChild(node)) return serializeChildBlocks(node)

  return inlineNodeToMarkdown(node).trim()
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (!(node instanceof HTMLElement)) return ""

  const tag = node.tagName.toLowerCase()
  if (tag === "br") return "\n"
  if (tag === "strong" || tag === "b") return `**${childrenToMarkdown(node)}**`
  if (tag === "em" || tag === "i") return `*${childrenToMarkdown(node)}*`
  if (tag === "code") return `\`${node.textContent ?? ""}\``
  if (tag === "a") return `[${childrenToMarkdown(node)}](${node.getAttribute("href") || ""})`
  if (tag === "img") return `![${escapeMarkdownText(node.getAttribute("alt") || "image")}](${node.getAttribute("src") || ""})`
  return childrenToMarkdown(node)
}

function childrenToMarkdown(node: Node) {
  return Array.from(node.childNodes).map((child) => inlineNodeToMarkdown(child)).join("")
}

function formatInlineMarkdown(value: string) {
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>")
  html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, text: string, href: string) => `<a href="${escapeAttribute(href)}">${escapeHtml(text)}</a>`)
  return html
}

export function plainTextToEditorHtml(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

export function imageAltFromFile(file: File) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "image"
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;")
}

function escapeMarkdownText(value: string) {
  return value.replace(/]/g, "\\]")
}
