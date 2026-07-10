"use client"

// WS5 — the annotation layer over the rendered article preview. Wraps the
// server-rendered <ArticleView> (children); on text selection it shows a
// "Comment" popover anchoring a comment to the selection, re-renders existing
// comments as per-author <mark> highlights, and lays out comment cards in a
// right-side gutter at the Y of their text (Google-Docs style). Mobile keeps a
// bottom-sheet. Also renders the review timeline.

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
import { highlightColor, highlightColorStrong } from "./comment-color"
import { isInsideAny, type Thread } from "@/lib/cms/comment-layout"
import { CommentGutter } from "./CommentGutter"
import { CommentPanel } from "./CommentPanel"
import { ReviewTimeline } from "./ReviewTimeline"

type Locale = "en" | "zh"

interface PendingSelection {
  anchor: TextAnchor
  top: number
  left: number
  below: boolean
}

const POPOVER_CLEARANCE = 180

/** Group flat comments into root threads + replies (roots keep DB order; the
 *  gutter re-sorts by document position). */
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
  const gutterRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [comments, setComments] = useState<CommentDTO[]>(initialComments)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reflowKey, setReflowKey] = useState(0)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  const threads = useMemo(() => buildThreads(comments), [comments])

  // Re-locate every root comment's anchor and wrap it in a per-author <mark>.
  const applyHighlights = useCallback(() => {
    const root = rootRef.current
    if (!root) return
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

  // Apply highlights after render / when comments change, then trigger a reflow.
  useEffect(() => {
    applyHighlights()
    setReflowKey((k) => k + 1)
  }, [applyHighlights])

  // Saturate the focused comment's marks; reset the rest.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>("mark[data-comment-thread]").forEach((m) => {
      const cid = m.dataset.commentThread
      if (!cid) return
      const author = comments.find((c) => c.id === cid)?.author.id ?? cid
      const on = cid === focusedId
      m.style.background = on ? highlightColorStrong(author) : highlightColor(author)
      m.style.outline = on ? "1px solid rgba(255,255,255,0.35)" : "none"
    })
  }, [focusedId, comments])

  // Reflow the gutter on container resize + lazy image loads.
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === "undefined") return
    const bump = () => setReflowKey((k) => k + 1)
    const ro = new ResizeObserver(bump)
    ro.observe(root)
    const imgs = Array.from(root.querySelectorAll("img"))
    imgs.forEach((img) => { if (!img.complete) img.addEventListener("load", bump) })
    return () => {
      ro.disconnect()
      imgs.forEach((img) => img.removeEventListener("load", bump))
    }
  }, [comments])

  // Measure a comment's first mark Y, relative to the gutter's top. null when the
  // mark is absent (anchor drifted) — the gutter then treats it as unanchored.
  const measureTop = useCallback((id: string): number | null => {
    const gutter = gutterRef.current
    const root = rootRef.current
    if (!gutter || !root) return null
    const mark = root.querySelector<HTMLElement>(`mark[data-comment-thread="${id}"]`)
    if (!mark) return null
    const rects = mark.getClientRects()
    if (rects.length === 0) return null
    return rects[0].top - gutter.getBoundingClientRect().top
  }, [])

  // Show the "Comment" popover on text selection inside the article.
  useEffect(() => {
    if (!canComment) return
    function onSelect(ev: MouseEvent | TouchEvent) {
      if (ev.target instanceof Node && popoverRef.current?.contains(ev.target)) return
      const sel = window.getSelection()
      const root = rootRef.current
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) { setPending(null); return }
      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer) || range.toString().trim().length === 0) { setPending(null); return }
      const anchor = serializeSelection(range, root)
      const rect = range.getBoundingClientRect()
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

  // Defocus when a pointer goes down outside the gutter / sheet / popover / a mark.
  // pointerdown + containment (never click/mouseup — the #202 "eats the click" bug).
  useEffect(() => {
    function onDown(ev: PointerEvent) {
      const t = ev.target as Node | null
      if (isInsideAny(t, [gutterRef.current, sheetRef.current, popoverRef.current])) return
      if (t instanceof HTMLElement && t.closest("mark[data-comment-thread]")) return
      setFocusedId(null)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [])

  // Click a highlight → focus its card. The document does NOT scroll.
  function onRootClick(ev: React.MouseEvent) {
    const el = (ev.target as HTMLElement).closest?.("mark[data-comment-thread]") as HTMLElement | null
    if (el?.dataset.commentThread) {
      setFocusedId(el.dataset.commentThread)
      setSheetOpen(true) // mobile: reveal the sheet on the tapped thread
    }
  }

  // Click a card → focus it and gently scroll the article to the trecho.
  function focusFromCard(id: string | null) {
    setFocusedId(id)
    if (!id) return
    const mark = rootRef.current?.querySelector<HTMLElement>(`mark[data-comment-thread="${id}"]`)
    mark?.scrollIntoView({ block: "center", behavior: "smooth" })
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
        setFocusedId(res.comment.id)
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

  const timeline = useMemo<TimelineEntry[]>(() => {
    const versionEntries: TimelineEntry[] = versions.map((v) => ({ kind: "version", at: v.createdAt, ...v }))
    const commentEntries: TimelineEntry[] = comments.map((c) => ({ kind: "comment", at: c.createdAt, ...c }))
    return [...versionEntries, ...commentEntries].sort((a, b) => a.at.localeCompare(b.at))
  }, [versions, comments])

  return (
    <div className="relative">
      {/* Article + timeline. On desktop, reserve the right band for the gutter. */}
      <div className="min-w-0 lg:pr-[340px]">
        <div ref={rootRef} onClick={onRootClick}>
          {children}
        </div>

        <div className="mx-auto max-w-[680px] px-6 pb-16 sm:px-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Review timeline</h2>
          <ReviewTimeline entries={timeline} />
        </div>
      </div>

      {/* Desktop gutter: absolutely positioned in the shared scroll container. */}
      <div ref={gutterRef} className="absolute right-4 top-0 hidden h-full w-[300px] lg:block">
        <CommentGutter
          threads={threads}
          focusedId={focusedId}
          showResolved={showResolved}
          onToggleResolved={() => setShowResolved((s) => !s)}
          measureTop={measureTop}
          reflowKey={reflowKey}
          canComment={canComment}
          busy={busy}
          onFocus={focusFromCard}
          onReply={submitReply}
          onResolve={doResolve}
          onReopen={doReopen}
        />
      </div>

      {/* Mobile bottom-sheet (Task 5 upgrades this to CommentCard + doc order). */}
      <div ref={sheetRef} className={`lg:hidden ${sheetOpen ? "" : "hidden"}`}>
        <CommentPanel
          threads={threads}
          selectedId={focusedId}
          canComment={canComment}
          busy={busy}
          onSelect={setFocusedId}
          onReply={submitReply}
          onResolve={doResolve}
          onReopen={doReopen}
          onClose={() => setSheetOpen(false)}
        />
      </div>

      {!sheetOpen ? (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-4 right-4 z-20 rounded-full bg-zinc-800 px-4 py-2 text-sm text-white shadow-lg lg:hidden"
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
  if (out.length === 0 && range.startContainer.nodeType === 3) out.push(range.startContainer as Text)
  return out
}
