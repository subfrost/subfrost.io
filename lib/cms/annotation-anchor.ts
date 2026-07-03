// WS5 — W3C-TextQuoteSelector-style anchoring for inline review comments. Pure
// DOM + string logic (no React), so it is unit-testable under happy-dom.
//
// An anchor records the selected `quote` plus a `prefix`/`suffix` of surrounding
// text and coarse position hints (`blockIndex`, global `start`/`end` char
// offsets within the rendered root). `locateAnchor` re-finds the range after the
// article text is edited: it tries an exact prefix+quote+suffix match, then a
// fuzzy match scoring each `quote` occurrence by how well its neighbourhood and
// position match, and returns null when the quote is gone (caller → ORPHANED).

export interface TextAnchor {
  quote: string
  prefix: string
  suffix: string
  /** Index of the top-level block element containing the selection start. */
  blockIndex: number
  /** Global char offset of the selection within the root's text. */
  start: number
  end: number
}

/** Chars of context captured on each side of the quote. */
const CONTEXT = 32

function textNodesUnder(root: Node): Text[] {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, 0x4 /* NodeFilter.SHOW_TEXT */)
  const nodes: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) nodes.push(n as Text)
  return nodes
}

/** Concatenated text of the root — the coordinate space anchors index into. */
export function rootText(root: Node): string {
  return textNodesUnder(root).map((n) => n.data).join("")
}

/** Resolve a (container, offset) boundary to a global text offset within root. */
function boundaryOffset(nodes: Text[], container: Node, offset: number): number {
  // Text-node boundary — the common case for user selections.
  if (container.nodeType === 3) {
    let acc = 0
    for (const n of nodes) {
      if (n === container) return acc + offset
      acc += n.data.length
    }
    return acc + offset
  }
  // Element boundary: the position sits before childNodes[offset]. Sum the length
  // of every text node that precedes that child in document order.
  const child = container.childNodes[offset] ?? null
  let acc = 0
  for (const n of nodes) {
    if (child == null) { acc += n.data.length; continue }
    if (n === child) break
    const pos = child.compareDocumentPosition(n)
    // n precedes child (either before it, or contained-and-earlier)
    if (pos & 0x2 /* PRECEDING */) acc += n.data.length
    else if (!(pos & 0x8) /* not CONTAINS */) break
    else acc += n.data.length
  }
  return acc
}

const BLOCK_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE",
  "UL", "OL", "DIV", "TABLE", "TR", "TD", "TH", "FIGURE",
])

function blockIndexOf(root: Element, node: Node): number {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>([...BLOCK_TAGS].join(",")))
  let el: Node | null = node.nodeType === 1 ? node : node.parentNode
  while (el && el !== root) {
    const i = blocks.indexOf(el as HTMLElement)
    if (i !== -1) return i
    el = el.parentNode
  }
  return -1
}

/** Serialize a DOM Range (relative to `root`) into a portable text anchor. */
export function serializeSelection(range: Range, root: Element): TextAnchor {
  const nodes = textNodesUnder(root)
  const start = boundaryOffset(nodes, range.startContainer, range.startOffset)
  const end = boundaryOffset(nodes, range.endContainer, range.endOffset)
  const text = nodes.map((n) => n.data).join("")
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    blockIndex: blockIndexOf(root, range.startContainer),
    start,
    end,
  }
}

/** Build a DOM Range from global start/end char offsets within root. */
function rangeFromOffsets(root: Element, start: number, end: number): Range | null {
  const nodes = textNodesUnder(root)
  const doc = root.ownerDocument!
  const range = doc.createRange()
  let acc = 0
  let startSet = false
  for (const n of nodes) {
    const len = n.data.length
    if (!startSet && start <= acc + len) {
      range.setStart(n, start - acc)
      startSet = true
    }
    if (startSet && end <= acc + len) {
      range.setEnd(n, end - acc)
      return range
    }
    acc += len
  }
  return null
}

function commonPrefixLen(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function commonSuffixLen(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

function allOccurrences(text: string, quote: string): number[] {
  if (!quote) return []
  const out: number[] = []
  let from = 0
  for (;;) {
    const i = text.indexOf(quote, from)
    if (i === -1) break
    out.push(i)
    from = i + Math.max(1, quote.length)
  }
  return out
}

/** Re-find the anchored range in the (possibly edited) root, or null if the
 *  quote can no longer be located — the caller then marks the comment ORPHANED. */
export function locateAnchor(anchor: TextAnchor, root: Element): Range | null {
  const text = rootText(root)
  if (!anchor.quote) return null

  // 1) Exact: unique prefix+quote+suffix neighbourhood survived intact.
  const withCtx = anchor.prefix + anchor.quote + anchor.suffix
  const exact = text.indexOf(withCtx)
  if (exact !== -1) {
    const s = exact + anchor.prefix.length
    return rangeFromOffsets(root, s, s + anchor.quote.length)
  }

  // 2) Fuzzy: score every occurrence of the bare quote by neighbourhood overlap
  //    and proximity to the recorded position; require some evidence it's the
  //    right one when the quote is short/ambiguous.
  const occ = allOccurrences(text, anchor.quote)
  if (occ.length === 0) return null

  let best = occ[0]
  let bestScore = -Infinity
  for (const i of occ) {
    const pre = text.slice(Math.max(0, i - anchor.prefix.length), i)
    const suf = text.slice(i + anchor.quote.length, i + anchor.quote.length + anchor.suffix.length)
    const neighbourhood = commonSuffixLen(anchor.prefix, pre) + commonPrefixLen(anchor.suffix, suf)
    const proximity = -Math.abs(i - anchor.start) * 0.001
    const score = neighbourhood + proximity
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return rangeFromOffsets(root, best, best + anchor.quote.length)
}
