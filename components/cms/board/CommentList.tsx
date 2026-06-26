"use client"

import { useEffect, useState } from "react"
import { Send, Trash2 } from "lucide-react"
import type { CommentView } from "@/lib/tasks/types"
import { ownerName } from "@/lib/tasks/types"
import { listCommentsAction, addCommentAction, deleteCommentAction } from "@/actions/tasks/board"

function formatTime(d: Date): string {
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  )
}

export function CommentList({ taskId, canEdit, onCountChange }: {
  taskId: string
  canEdit: boolean
  onCountChange?: (n: number) => void
}) {
  const [comments, setComments] = useState<CommentView[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setLoading(true)
    listCommentsAction(taskId).then((r) => {
      if (!live) return
      if (r.ok) { setComments(r.value); onCountChange?.(r.value.length) }
      setLoading(false)
    })
    return () => { live = false }
    // onCountChange intentionally omitted — parent passes a stable callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    const r = await addCommentAction({ taskId, body })
    setBusy(false)
    if (r.ok) {
      const next = [...comments, r.value]
      setComments(next)
      onCountChange?.(next.length)
      setDraft("")
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    const r = await deleteCommentAction(id, taskId)
    setBusy(false)
    if (r.ok) {
      const next = comments.filter((c) => c.id !== id)
      setComments(next)
      onCountChange?.(next.length)
    }
  }

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-zinc-500">Loading comments…</p>}
      {!loading && comments.length === 0 && <p className="text-sm text-zinc-600">No comments yet.</p>}

      {comments.map((c) => (
        <div key={c.id} className="group text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-zinc-300">{ownerName(c.author)}</span>
            <span className="text-[11px] text-zinc-600">{formatTime(c.createdAt)}</span>
            {canEdit && (
              <button onClick={() => remove(c.id)} aria-label="Delete comment" className="ml-auto text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-zinc-400">{c.body}</p>
        </div>
      ))}

      {canEdit && (
        <form onSubmit={submit} className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
          />
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded border border-sky-500/40 px-2.5 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 disabled:opacity-50">
            <Send size={13} />
          </button>
        </form>
      )}
    </div>
  )
}
