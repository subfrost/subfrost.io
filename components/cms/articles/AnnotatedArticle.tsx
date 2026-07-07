"use client"

// WS5 — the annotation layer over the rendered article preview. Wraps the
// server-rendered <ArticleView> (passed as children); on text selection it shows
// a "Comment" popover that anchors a comment to the selection (W3C TextQuote
// selector via lib/cms/annotation-anchor), re-renders existing comments as
// color-coded highlights (per author), and opens threads in a side panel
// (bottom sheet on mobile). Also renders the review timeline.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  serializeSelection,
  locateAnchor,
  type TextAnchor,
} from "@/lib/cms/annotation-anchor"
import {
  addComment,
  resolveComment,
  reopenComment,
  type CommentDTO,
  type VersionDTO,
  type TimelineEntry,
} from "@/actions/cms/articles-review"
import { highlightColor } from "./comment-color"
import { CommentPanel, type Thread } from "./CommentPanel"
import { ReviewTimeline } from "./ReviewTimeline"

type Locale = "en" | "zh"

interface PendingSelection {
  anchor: TextAnchor
  top: number
  left: number
  /** Render below the selection when there is no room above it in the viewport. */
  below: boolean
}

/** Vertical room (px) the popover needs to render above a selection. */
const POPOVER_CLEARANCE = 180

/** Group flat comments into root threads + replies (roots keep DB order). */
function buildThreads(comments: CommentDTO[]): Thread[] {
  const roots = comments.filter((c) => !c.parentId)
  const byParent = new Map<string, CommentDTO[]>()
  for (const c of comments) {
    if (!c.parentId) continue
    const arr = byParent.get(c.parentId) ?? []
    arr.push(c)
    byParent.set(c.parentId, arr)
  }
  return roots.map((root) => ({ root, replies: byParent.get(root.id) ?? [] }))
}

export function AnnotatedArticle({
  articleId,
  locale,
  versionId,
  canComment,
  initialComments,
  versions,
  children,
}: {
  articleId: string
  locale: Locale
  versionId: string | null
  canComment: boolean
  initialComments: CommentDTO[]
  versions: VersionDTO[]
  children: React.ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [comments, setComments] = useState<CommentDTO[]>(initialComments)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  const threads = useMemo(() => buildThreads(comments), [comments])

  // Re-locate every root comment's anchor in the rendered DOM and wrap it in a
  // color-coded <mark>. Runs after render and whenever comments change.
  const applyHighlights = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    // Clear previous marks (unwrap + coalesce text).
    root.querySelectorAll("mark[data-comment-thread]").forEach((m) => {
      const parent = m.parentNode
      if (!parent) return
      while (m.firstChild) parent.insertBefore(m.firstChild, m)
      parent.removeChild(m)
      parent.normalize()
    })

    for (const { root: c } of threads) {
      if (c.status === "RESOLVED") continue
      const range = locateAnchor(c.anchor, root)
      if (!range) continue
      const nodes = textNodesInRange(range)
      for (const node of nodes) {
        const s = node === range.startContainer ? range.startOffset : 0
        const e = node === range.endContainer ? range.endOffset : node.data.length
        if (e <= s) continue
        let target = node
        if (s > 0) target = target.splitText(s)
        if (e - s < target.data.length) target.splitText(e - s)
        const mark = root.ownerDocument.createElement("mark")
        mark.dataset.commentThread = c.id
        mark.style.background = highlightColor(c.author.id)
        mark.style.borderRadius = "2px"
        mark.style.cursor = "pointer"
        mark.style.color = "inherit"
        target.parentNode?.insertBefore(mark, target)
        mark.appendChild(target)
      }
    }
  }, [threads])

  useEffect(() => {
    applyHighlights()
  }, [applyHighlights])

  // Show the "Comment" popover when the user selects text inside the article.
  useEffect(() => {
    if (!canComment) return
    function onSelect(ev: MouseEvent | TouchEvent) {
      // Pressing a mouse button inside the popover (textarea, Comment/Cancel)
      // collapses the article selection before mouseup fires; dismissing the
      // popover here would unmount its buttons before their click can land.
      if (ev.target instanceof Node && popoverRef.current?.contains(ev.target)) return
      const sel = window.getSelection()
      const root = rootRef.current
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) {
        setPending(null)
        return
      }
      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer) || range.toString().trim().length === 0) {
        setPending(null)
        return
      }
      const anchor = serializeSelection(range, root)
      const rect = range.getBoundingClientRect()
      // Selections near the top of the viewport (first lines under the sticky
      // header) have no room for the popover above them — it would render
      // off-screen and look like nothing happened. Flip it below the selection,
      // and keep it horizontally inside the viewport (popover is w-64 = 256px).
      const below = rect.top < POPOVER_CLEARANCE
      const mid = rect.left + rect.width / 2
      const left = Math.min(Math.max(mid, 140), Math.max(140, window.innerWidth - 140))
      setPending({
        anchor,
        top: below ? Math.min(rect.bottom + 8, window.innerHeight - 8) : rect.top - 8,
        left,
        below,
      })
      setDraft("")
    }
    document.addEventListener("mouseup", onSelect)
    document.addEventListener("touchend", onSelect)
    return () => {
      document.removeEventListener("mouseup", onSelect)
      document.removeEventListener("touchend", onSelect)
    }
  }, [canComment])

  // Clicking a highlight opens its thread in the panel.
  function onRootClick(ev: React.MouseEvent) {
    const el = (ev.target as HTMLElement).closest?.("mark[data-comment-thread]") as HTMLElement | null
    if (el?.dataset.commentThread) {
      setSelectedId(el.dataset.commentThread)
      setPanelOpen(true)
    }
  }

  async function submitComment() {
    if (!pending || !draft.trim()) return
    setBusy(true)
    try {
      const res = await addComment({ articleId, versionId, locale, anchor: pending.anchor, body: draft.trim() })
      if (res.ok) {
        setComments((prev) => [...prev, res.comment])
        setPending(null)
        setDraft("")
        setSelectedId(res.comment.id)
        setPanelOpen(true)
        window.getSelection()?.removeAllRanges()
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitReply(parentId: string, body: string) {
    const parent = comments.find((c) => c.id === parentId)
    if (!parent) return
    setBusy(true)
    try {
      const res = await addComment({ articleId, versionId, locale, anchor: parent.anchor, body, parentId })
      if (res.ok) setComments((prev) => [...prev, res.comment])
    } finally {
      setBusy(false)
    }
  }

  async function doResolve(id: string) {
    setBusy(true)
    try {
      const res = await resolveComment(id)
      if (res.ok) setComments((prev) => prev.map((c) => (c.id === id ? res.comment : c)))
    } finally {
      setBusy(false)
    }
  }

  async function doReopen(id: string) {
    setBusy(true)
    try {
      const res = await reopenComment(id)
      if (res.ok) setComments((prev) => prev.map((c) => (c.id === id ? res.comment : c)))
    } finally {
      setBusy(false)
    }
  }

  // Live review timeline = version bumps interleaved with current comments.
  const timeline = useMemo<TimelineEntry[]>(() => {
    const versionEntries: TimelineEntry[] = versions.map((v) => ({ kind: "version", at: v.createdAt, ...v }))
    const commentEntries: TimelineEntry[] = comments.map((c) => ({ kind: "comment", at: c.createdAt, ...c }))
    return [...versionEntries, ...commentEntries].sort((a, b) => a.at.localeCompare(b.at))
  }, [versions, comments])

  return (
    <div className="flex flex-col sm:flex-row">
      <div className="min-w-0 flex-1">
        <div ref={rootRef} onClick={onRootClick}>
          {children}
        </div>

        <div className="mx-auto max-w-[680px] px-6 pb-16 sm:px-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Review timeline</h2>
          <ReviewTimeline entries={timeline} />
        </div>
      </div>

      {/* Desktop side panel is always mounted; on mobile it's a toggled sheet. */}
      <div className={panelOpen ? "" : "hidden sm:block"}>
        <CommentPanel
          threads={threads}
          selectedId={selectedId}
          canComment={canComment}
          busy={busy}
          onSelect={setSelectedId}
          onReply={submitReply}
          onResolve={doResolve}
          onReopen={doReopen}
          onClose={() => setPanelOpen(false)}
        />
      </div>

      {/* Mobile FAB to open the panel. */}
      {!panelOpen ? (
        <button
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-4 right-4 z-20 rounded-full bg-zinc-800 px-4 py-2 text-sm text-white shadow-lg sm:hidden"
        >
          Comments ({threads.length})
        </button>
      ) : null}

      {/* Selection → comment popover. */}
      {pending ? (
        <div
          ref={popoverRef}
          data-below={pending.below || undefined}
          className={`fixed z-40 w-64 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-xl ${pending.below ? "" : "-translate-y-full"}`}
          style={{ top: pending.top, left: pending.left }}
        >
          <p className="mb-1 line-clamp-2 text-[11px] italic text-zinc-500">“{pending.anchor.quote}”</p>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <div className="mt-1 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button size="sm" disabled={busy || !draft.trim()} onClick={submitComment}>Comment</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Text nodes intersecting a Range (whose boundaries are text nodes). */
function textNodesInRange(range: Range): Text[] {
  const rootNode = range.commonAncestorContainer
  const scope = (rootNode.nodeType === 1 ? rootNode : rootNode.parentNode) as Node
  const doc = scope.ownerDocument!
  const walker = doc.createTreeWalker(scope, 0x4 /* SHOW_TEXT */)
  const out: Text[] = []
  let n: Node | null
  let started = false
  while ((n = walker.nextNode())) {
    const t = n as Text
    if (t === range.startContainer) started = true
    if (started) out.push(t)
    if (t === range.endContainer) break
  }
  // Single-node selection where start === end container is handled above.
  if (out.length === 0 && range.startContainer.nodeType === 3) out.push(range.startContainer as Text)
  return out
}
