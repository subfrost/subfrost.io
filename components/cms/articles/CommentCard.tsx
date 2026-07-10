"use client"

// One review thread rendered as a card: quote, author row, body, replies, and
// (when focused) a reply/resolve composer. Presentational — all mutations are
// delegated to callbacks owned by AnnotatedArticle. Used by both the desktop
// CommentGutter and the mobile bottom-sheet.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { CommentDTO } from "@/actions/cms/articles-review"
import type { Thread } from "@/lib/cms/comment-layout"
import { accentColor } from "./comment-color"

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function CommentRow({ c }: { c: CommentDTO }) {
  return (
    <div className="flex gap-2">
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ background: accentColor(c.author.id) }}
        title={c.author.name}
      >
        {initials(c.author.name)}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-zinc-100">{c.author.name}</span>
          <span className="text-[10px] text-zinc-500">{timeLabel(c.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{c.body}</p>
      </div>
    </div>
  )
}

export function CommentCard({
  thread,
  focused,
  dimmed,
  canComment,
  busy,
  onFocus,
  onReply,
  onResolve,
  onReopen,
}: {
  thread: Thread
  focused: boolean
  dimmed: boolean
  canComment: boolean
  busy: boolean
  onFocus: () => void
  onReply: (parentId: string, body: string) => void | Promise<void>
  onResolve: (id: string) => void
  onReopen: (id: string) => void
}) {
  const { root, replies } = thread
  const [reply, setReply] = useState("")
  const resolved = root.status === "RESOLVED"
  const orphaned = root.status === "ORPHANED"

  return (
    <div
      data-comment-card={root.id}
      onClick={onFocus}
      className={`cursor-pointer rounded-lg border bg-zinc-900 p-2 shadow-sm transition-[transform,opacity,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
        focused
          ? "-translate-x-2 border-zinc-500 shadow-lg"
          : dimmed
            ? "border-zinc-800 opacity-60"
            : "border-zinc-800"
      }`}
      style={{ borderLeft: `3px solid ${accentColor(root.author.id)}` }}
    >
      {root.anchor?.quote ? (
        <p className="mb-1 line-clamp-2 border-l border-zinc-700 pl-2 text-[11px] italic text-zinc-500">
          “{root.anchor.quote}”
        </p>
      ) : null}
      <CommentRow c={root} />
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        {replies.length > 0 ? (
          <span className="text-zinc-500">{replies.length} repl{replies.length === 1 ? "y" : "ies"}</span>
        ) : null}
        {resolved ? <span className="rounded bg-emerald-900/50 px-1 text-emerald-300">Resolved</span> : null}
        {orphaned ? <span className="rounded bg-amber-900/50 px-1 text-amber-300">Orphaned</span> : null}
      </div>

      {focused ? (
        <div className="mt-2 space-y-2 border-t border-zinc-800 pt-2">
          {replies.map((r) => <CommentRow key={r.id} c={r} />)}
          {canComment ? (
            <div className="space-y-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply…"
                rows={2}
                className="w-full resize-none rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={busy || !reply.trim()}
                  onClick={async () => { await onReply(root.id, reply.trim()); setReply("") }}
                >
                  Reply
                </Button>
                {resolved ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onReopen(root.id)}>Reopen</Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => onResolve(root.id)}>Resolve</Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
