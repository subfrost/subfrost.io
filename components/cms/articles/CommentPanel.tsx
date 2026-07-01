"use client"

// WS5 — the review comment side panel (desktop) / bottom sheet (mobile). Lists
// every thread for the current version; the selected thread expands with its
// replies and a reply/resolve composer. Purely presentational — all mutations
// are delegated to callbacks owned by AnnotatedArticle.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { CommentDTO } from "@/actions/cms/articles-review"
import { accentColor } from "./comment-color"

export interface Thread {
  root: CommentDTO
  replies: CommentDTO[]
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function CommentRow({ c }: { c: CommentDTO }) {
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
  const [reply, setReply] = useState("")

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col rounded-t-2xl border-t border-zinc-800 bg-zinc-950 shadow-2xl sm:static sm:z-0 sm:max-h-none sm:w-80 sm:shrink-0 sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none"
      aria-label="Review comments"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">
          Comments <span className="text-zinc-500">({threads.length})</span>
        </h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-white sm:hidden" aria-label="Close comments">✕</button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {threads.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-zinc-500">
            Select text in the article to leave a comment.
          </p>
        ) : null}

        {threads.map(({ root, replies }) => {
          const open = selectedId === root.id
          const orphaned = root.status === "ORPHANED"
          const resolved = root.status === "RESOLVED"
          return (
            <div
              key={root.id}
              className={`rounded-lg border p-2 ${open ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 bg-zinc-900/40"}`}
              style={{ borderLeft: `3px solid ${accentColor(root.author.id)}` }}
            >
              <button className="block w-full text-left" onClick={() => onSelect(open ? null : root.id)}>
                {root.anchor?.quote ? (
                  <p className="mb-1 line-clamp-2 border-l border-zinc-700 pl-2 text-[11px] italic text-zinc-500">
                    “{root.anchor.quote}”
                  </p>
                ) : null}
                <CommentRow c={root} />
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  {replies.length > 0 ? <span className="text-zinc-500">{replies.length} repl{replies.length === 1 ? "y" : "ies"}</span> : null}
                  {resolved ? <span className="rounded bg-emerald-900/50 px-1 text-emerald-300">Resolved</span> : null}
                  {orphaned ? <span className="rounded bg-amber-900/50 px-1 text-amber-300">Orphaned</span> : null}
                </div>
              </button>

              {open ? (
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
        })}
      </div>
    </aside>
  )
}
