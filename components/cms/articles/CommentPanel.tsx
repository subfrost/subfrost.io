"use client"

// WS5 — the mobile review bottom-sheet. Desktop uses <CommentGutter>; below lg
// this sheet lists every thread in document order (reusing <CommentCard>) and
// scrolls to the selected thread when it opens. Purely presentational — all
// mutations are delegated to callbacks owned by AnnotatedArticle.

import { useEffect, useRef } from "react"
import { CommentCard } from "./CommentCard"
import { orderThreadsByAnchor, type Thread } from "@/lib/cms/comment-layout"

export type { Thread }

export function CommentPanel({
  threads,
  selectedId,
  canComment,
  busy,
  onSelect,
  onReply,
  onResolve,
  onReopen,
  onClose,
}: {
  threads: Thread[]
  selectedId: string | null
  canComment: boolean
  busy: boolean
  onSelect: (id: string | null) => void
  onReply: (parentId: string, body: string) => void | Promise<void>
  onResolve: (id: string) => void
  onReopen: (id: string) => void
  onClose: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const ordered = orderThreadsByAnchor(threads)

  // When a thread is selected (e.g. tapping its highlight), scroll it into view.
  useEffect(() => {
    if (!selectedId) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-sheet-thread="${selectedId}"]`)
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" })
  }, [selectedId])

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col rounded-t-2xl border-t border-zinc-800 bg-zinc-950 shadow-2xl"
      aria-label="Review comments"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">
          Comments <span className="text-zinc-500">({threads.length})</span>
        </h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Close comments">✕</button>
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {ordered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-zinc-500">
            Select text in the article to leave a comment.
          </p>
        ) : null}

        {ordered.map((t) => (
          <div key={t.root.id} data-sheet-thread={t.root.id}>
            <CommentCard
              thread={t}
              focused={selectedId === t.root.id}
              dimmed={false}
              canComment={canComment}
              busy={busy}
              onFocus={() => onSelect(selectedId === t.root.id ? null : t.root.id)}
              onReply={onReply}
              onResolve={onResolve}
              onReopen={onReopen}
            />
          </div>
        ))}
      </div>
    </aside>
  )
}
