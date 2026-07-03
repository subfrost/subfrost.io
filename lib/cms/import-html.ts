// Google Docs (and general rich clipboard) HTML -> the site's markdown dialect.
//
// Paired with lib/cms/editor-markdown.ts (markdown <-> editor HTML): the article editor
// pastes rich clipboard HTML through here to markdown, then feeds that markdown to
// markdownToEditorHtml() so imported content becomes byte-identical to what the editor
// produces natively (and so survives the save round-trip fixed in #175). Hand-rolled and
// DOM-only so it unit-tests under happy-dom. Intentionally NOT importing editor-markdown.ts.
//
// Covers the block/inline types Gabe's Google Docs produce: paragraphs, headings,
// unordered/ordered (and nested) lists, blockquotes, bold, italic, links, inline code.

const BLOCK_CHILD_TAGS = new Set([
  "p", "div", "section", "article", "ul", "ol", "blockquote", "figure", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
])

interface Ctx { bold: boolean; italic: boolean }
const ROOT_CTX: Ctx = { bold: false, italic: false }

export function htmlToMarkdown(html: string): string {
  if (!html) return ""
  const doc = new DOMParser().parseFromString(html, "text/html")
  return serializeBlocks(doc.body).trim()
}

/** True when clipboard HTML carries structure worth converting rather than a trivial
 *  wrapper around plain text (keeps the plain-text paste path unchanged for e.g. a
 *  terminal copy). */
export function isRichHtml(html: string): boolean {
  if (!html) return false
  const doc = new DOMParser().parseFromString(html, "text/html")
  // Keep this selector in lockstep with the tags blockToMarkdown/inlineToMarkdown
  // actually handle — add to both places together as the converter grows.
  return !!doc.body.querySelector(
    "h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,b,strong,i,em,a,code,[style*='font-weight'],[style*='font-style']",
  )
}

/** Convenience for the paste path: markdown for rich html, or null to fall back to
 *  the caller's plain-text handling. */
export function importedMarkdownFromClipboard(html: string): string | null {
  if (!isRichHtml(html)) return null
  const md = htmlToMarkdown(html).trim()
  return md || null
}

function serializeBlocks(node: Node): string {
  return Array.from(node.childNodes)
    .map((child) => blockToMarkdown(child))
    .filter((s) => s.trim() !== "")
    .join("\n\n")
}

function blockToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? ""
  if (!(node instanceof HTMLElement)) return ""

  const tag = node.tagName.toLowerCase()

  const heading = tag.match(/^h([1-6])$/)
  if (heading) {
    const level = Math.min(Number(heading[1]), 3)
    return `${"#".repeat(level)} ${inlineChildren(node).trim()}`
  }

  if (tag === "ul") return listToMarkdown(node, false, 0)
  if (tag === "ol") return listToMarkdown(node, true, 0)

  if (tag === "blockquote") {
    const body = serializeBlocks(node).trim() || inlineChildren(node).trim()
    return body
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n")
  }

  if (tag === "pre") return "```\n" + (node.textContent?.replace(/\n+$/, "") ?? "") + "\n```"

  // A container that wraps block children — Google Docs' outer
  // <b style="font-weight:normal" id="docs-internal-guid-…"> wrapper, or a <div>/<p>
  // holding a list. Descend so inner blocks and their line breaks survive.
  if (hasBlockChild(node)) return serializeBlocks(node)

  return inlineChildren(node).trim()
}

function hasBlockChild(node: HTMLElement): boolean {
  return Array.from(node.children).some((child) => BLOCK_CHILD_TAGS.has(child.tagName.toLowerCase()))
}

function listToMarkdown(list: HTMLElement, ordered: boolean, depth: number): string {
  const indent = "  ".repeat(depth)
  const lines: string[] = []
  let index = 1
  for (const li of Array.from(list.children)) {
    if (li.tagName.toLowerCase() !== "li") continue
    const marker = ordered ? `${index}.` : "-"
    const sublists: string[] = []
    const inlineParts: string[] = []
    for (const child of Array.from(li.childNodes)) {
      const childTag = child instanceof HTMLElement ? child.tagName.toLowerCase() : ""
      if (childTag === "ul" || childTag === "ol") {
        sublists.push(listToMarkdown(child as HTMLElement, childTag === "ol", depth + 1))
      } else {
        inlineParts.push(inlineToMarkdown(child, ROOT_CTX))
      }
    }
    lines.push(`${indent}${marker} ${inlineParts.join("").trim()}`)
    for (const sub of sublists) lines.push(sub)
    index += 1
  }
  return lines.join("\n")
}

function inlineChildren(node: Node, ctx: Ctx = ROOT_CTX): string {
  return Array.from(node.childNodes).map((c) => inlineToMarkdown(c, ctx)).join("")
}

function inlineToMarkdown(node: ChildNode, ctx: Ctx): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (!(node instanceof HTMLElement)) return ""

  const tag = node.tagName.toLowerCase()
  if (tag === "br") return "\n"
  if (tag === "img") return "" // bulk-paste images are out of scope for v1

  if (isMonospace(node)) {
    const text = node.textContent ?? ""
    return text ? `\`${text}\`` : ""
  }

  if (tag === "a") {
    const inner = inlineChildren(node, ctx)
    const href = unwrapDocsHref(node.getAttribute("href") || "")
    if (!href) return inner
    return isSafeHref(href) ? `[${inner}](${href})` : inner
  }

  const bold = resolveWeight(node, ctx.bold)
  const italic = resolveStyle(node, ctx.italic)
  let inner = inlineChildren(node, { bold, italic })

  // Emit a marker only on the transition from parent context to this element, so nested
  // spans that each restate font-weight:700 (a Google Docs habit) don't double-wrap.
  if (inner.trim() !== "") {
    if (italic && !ctx.italic) inner = `*${inner}*`
    if (bold && !ctx.bold) inner = `**${inner}**`
  }
  return inner
}

function styleProp(el: HTMLElement, prop: string): string {
  const fromStyle = el.style?.getPropertyValue(prop)
  if (fromStyle) return fromStyle.toLowerCase().trim()
  const attr = el.getAttribute("style") || ""
  const m = attr.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i"))
  return m ? m[1].toLowerCase().trim() : ""
}

function resolveWeight(el: HTMLElement, inherited: boolean): boolean {
  const weight = styleProp(el, "font-weight")
  if (weight) {
    // The outer Google Docs wrapper is <b style="font-weight:normal"> — an explicit
    // normal/<600 overrides the tag and means NOT bold.
    if (weight === "normal" || (Number(weight) > 0 && Number(weight) < 600)) return false
    if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) return true
  }
  const tag = el.tagName.toLowerCase()
  if (tag === "b" || tag === "strong") return true
  return inherited
}

function resolveStyle(el: HTMLElement, inherited: boolean): boolean {
  const style = styleProp(el, "font-style")
  if (style) return style === "italic" || style === "oblique"
  const tag = el.tagName.toLowerCase()
  if (tag === "i" || tag === "em") return true
  return inherited
}

function isMonospace(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === "code" || tag === "tt" || tag === "kbd") return true
  return /courier|consolas|monaco|monospace/.test(styleProp(el, "font-family"))
}

// Assumes the inner q= value is URI-encoded, which is true for real Google Docs output;
// decodeURIComponent is already try/caught below for anything that isn't.
function unwrapDocsHref(href: string): string {
  const match = href.match(/^https?:\/\/www\.google\.com\/url\?q=([^&]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }
  return href
}

/** Allowlist for link hrefs emitted into markdown: http(s)/mailto/tel, plus relative
 *  and anchor links on our own origin. Rejects everything else (e.g. `javascript:`,
 *  `data:`) so a pasted link can't smuggle a live script/data URI into the editor. */
function isSafeHref(href: string): boolean {
  const h = href.trim().toLowerCase()
  if (h === "") return false
  if (h.startsWith("/") || h.startsWith("#") || h.startsWith("./") || h.startsWith("../")) return true
  return /^(https?|mailto|tel):/.test(h)
}
