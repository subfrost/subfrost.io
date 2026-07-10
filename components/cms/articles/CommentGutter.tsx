"use client"

// The desktop review rail: comment cards absolutely positioned at the Y of
// their highlighted text, in document order, with two-pass collision. Lives in
// the same scroll container as the article (no own overflow). Resolved cards are
// hidden behind a toggle; orphaned / unlocatable cards sit in a fixed top
// section outside the collision algorithm.

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { CommentCard } from "./CommentCard"
import { layoutCards, partitionThreads, type DesiredCard, type Thread } from "@/lib/cms/comment-layout"

const GAP = 12

export function CommentGutter({
  threads,
  focusedId,
  showResolved,
  onToggleResolved,
  measureTop,
  reflowKey,
  canComment,
  busy,
  onFocus,
  onReply,
  onResolve,
  onReopen,
}: {
  threads: Thread[]
  focusedId: string | null
  showResolved: boolean
  onToggleResolved: () => void
  measureTop: (id: string) => number | null
  reflowKey: number
  canComment: boolean
  busy: boolean
  onFocus: (id: string | null) => void
  onReply: (parentId: string, body: string) => void | Promise<void>
  onResolve: (id: string) => void
  onReopen: (id: string) => void
}) {
  const { open, resolved, orphaned } = partitionThreads(threads)

  const [heights, setHeights] = useState<Map<string, number>>(new Map())
  const [tops, setTops] = useState<Map<string, number>>(new Map())
  const wrapRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Which open threads can we currently measure a Y for?
  const measured: DesiredCard[] = []
  const unlocated: Thread[] = []
  for (const t of open) {
    const top = measureTop(t.root.id)
    if (top == null) { unlocated.push(t); continue }
    measured.push({ id: t.root.id, top, height: heights.get(t.root.id) ?? 0 })
  }
  const openKey = open.map((t) => t.root.id).join(",")
  const measuredKey = measured.map((d) => `${d.id}:${d.top}`).join(",")

  // Run the collision layout whenever inputs change.
  useLayoutEffect(() => {
    setTops(layoutCards(measured, focusedId, GAP))
    // measuredKey folds in ids + desired tops; heights/reflowKey trigger re-measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuredKey, focusedId, heights, reflowKey])

  // Track live card heights (reply expansion, font swap) and re-layout.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      setHeights((prev) => {
        const next = new Map(prev)
        let changed = false
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.cardWrap
          if (!id) continue
          const h = (e.target as HTMLElement).offsetHeight
          if (next.get(id) !== h) { next.set(id, h); changed = true }
        }
        return changed ? next : prev
      })
    })
    for (const el of wrapRefs.current.values()) ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, focusedId])

  const positioned = open.filter((t) => tops.has(t.root.id))
  const topSection = [...orphaned, ...unlocated]

  function cardFor(t: Thread) {
    return (
      <CommentCard
        thread={t}
        focused={focusedId === t.root.id}
        dimmed={focusedId != null && focusedId !== t.root.id}
        canComment={canComment}
        busy={busy}
        onFocus={() => onFocus(focusedId === t.root.id ? null : t.root.id)}
        onReply={onReply}
        onResolve={onResolve}
        onReopen={onReopen}
      />
    )
  }

  return (
    <div className="relative h-full w-full text-left">
      <div className="mb-3 flex items-center justify-between px-1 text-xs">
        <span className="font-semibold text-zinc-300">Comments ({open.length})</span>
        {resolved.length > 0 ? (
          <button className="text-zinc-500 hover:text-zinc-200" onClick={onToggleResolved}>
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </button>
        ) : null}
      </div>

      {topSection.length > 0 ? (
        <div data-testid="gutter-unanchored" className="mb-3 space-y-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-2">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">Unanchored</p>
          {topSection.map((t) => <div key={t.root.id}>{cardFor(t)}</div>)}
        </div>
      ) : null}

      {/* Absolutely positioned open cards. Height comes from the article, so the
          rail needs an explicit min-height to hold the lowest card. */}
      <div className="relative" style={{ minHeight: maxBottom(tops, heights) }}>
        {positioned.map((t) => (
          <div
            key={t.root.id}
            ref={(el) => {
              if (el) wrapRefs.current.set(t.root.id, el)
              else wrapRefs.current.delete(t.root.id)
            }}
            data-card-wrap={t.root.id}
            className="absolute left-0 right-0 transition-[top] duration-200 ease-out motion-reduce:transition-none"
            style={{ top: tops.get(t.root.id) ?? 0 }}
          >
            {cardFor(t)}
          </div>
        ))}
      </div>

      {showResolved && resolved.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Resolved</p>
          {resolved.map((t) => <div key={t.root.id}>{cardFor(t)}</div>)}
        </div>
      ) : null}
    </div>
  )
}

/** Bottom of the lowest positioned card, so the absolute container reserves height. */
function maxBottom(tops: Map<string, number>, heights: Map<string, number>): number {
  let max = 0
  for (const [id, top] of tops) max = Math.max(max, top + (heights.get(id) ?? 120))
  return max
}
