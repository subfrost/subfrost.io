// Pure geometry + ordering helpers for the Google-Docs-style review comment
// gutter. No DOM traversal, no React — unit-tested directly. The gutter feeds
// measured mark Ys + card heights in; these functions decide final card tops.

import type { CommentDTO } from "@/actions/cms/articles-review"

/** A root comment plus its replies. The single source for this shape. */
export interface Thread {
  root: CommentDTO
  replies: CommentDTO[]
}

/** A card's desired Y (mark top, relative to gutter top) and measured height. */
export interface DesiredCard {
  id: string
  top: number
  height: number
}

/**
 * Resolve final card tops so no two cards overlap (each separated by `gap`),
 * keeping every card as close to its desired Y as possible.
 *
 * - No focus: one top-down sweep — a card sits at its desired Y unless the card
 *   above forces it lower.
 * - With focus: the focused card is pinned at its exact desired Y; cards below
 *   sweep down from it, cards above sweep up (they cede space).
 *
 * O(n), two passes. `desired` MUST be pre-sorted in document order.
 */
export function layoutCards(
  desired: DesiredCard[],
  focusedId: string | null,
  gap: number,
): Map<string, number> {
  const out = new Map<string, number>()
  const n = desired.length
  if (n === 0) return out

  const f = focusedId ? desired.findIndex((d) => d.id === focusedId) : -1

  if (f === -1) {
    let minTop = -Infinity
    for (const d of desired) {
      const top = Math.max(d.top, minTop)
      out.set(d.id, top)
      minTop = top + d.height + gap
    }
    return out
  }

  // Pin the focused card, then sweep outward in both directions.
  out.set(desired[f].id, desired[f].top)

  let minTop = desired[f].top + desired[f].height + gap
  for (let i = f + 1; i < n; i++) {
    const top = Math.max(desired[i].top, minTop)
    out.set(desired[i].id, top)
    minTop = top + desired[i].height + gap
  }

  let ceiling = desired[f].top - gap
  for (let i = f - 1; i >= 0; i--) {
    const top = Math.min(desired[i].top, ceiling - desired[i].height)
    out.set(desired[i].id, top)
    ceiling = top - gap
  }

  return out
}

/** Sort root threads by anchor document position (createdAt tiebreak). Null or
 *  missing anchors sort last. */
export function orderThreadsByAnchor(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    const sa = a.root.anchor?.start ?? Number.MAX_SAFE_INTEGER
    const sb = b.root.anchor?.start ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    return a.root.createdAt.localeCompare(b.root.createdAt)
  })
}

/** Split threads by review status. open/resolved keep document order; orphaned
 *  keeps createdAt order (no reliable position). */
export function partitionThreads(threads: Thread[]): {
  open: Thread[]
  resolved: Thread[]
  orphaned: Thread[]
} {
  const open: Thread[] = []
  const resolved: Thread[] = []
  const orphaned: Thread[] = []
  for (const t of threads) {
    if (t.root.status === "RESOLVED") resolved.push(t)
    else if (t.root.status === "ORPHANED") orphaned.push(t)
    else open.push(t)
  }
  return {
    open: orderThreadsByAnchor(open),
    resolved: orderThreadsByAnchor(resolved),
    orphaned: [...orphaned].sort((a, b) => a.root.createdAt.localeCompare(b.root.createdAt)),
  }
}

/** True if `target` is contained by any of the given elements. Used by the
 *  pointerdown dismiss guard (the "element eats the click" fix, #202). */
export function isInsideAny(target: Node | null, els: (Node | null | undefined)[]): boolean {
  if (!target) return false
  return els.some((el) => el != null && el.contains(target))
}
