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
      {loading && <p className="text-sm text-[color:var(--ed-muted)]">Loading comments...</p>}
      {!loading && comments.length === 0 && <p className="text-sm text-[color:var(--ed-muted)]">No comments yet.</p>}

      {comments.map((c) => (
        <div key={c.id} className="group text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[color:var(--ed-ink)]">{ownerName(c.author)}</span>
            <span className="text-[11px] text-[color:var(--ed-muted)]">{formatTime(c.createdAt)}</span>
            {canEdit && (
              <button onClick={() => remove(c.id)} aria-label="Delete comment" className="ml-auto text-[color:var(--ed-muted)] opacity-0 transition group-hover:opacity-100 hover:text-rose-400">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-[color:var(--ed-body)]">{c.body}</p>
        </div>
      ))}

      {canEdit && (
        <form onSubmit={submit} className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-2 py-1.5 text-sm text-[color:var(--ed-ink)] placeholder:text-[color:var(--ed-muted)] focus:border-[color:var(--ed-muted)] focus:outline-none"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="inline-flex items-center gap-1 rounded-[6px] bg-[color:var(--ed-action-bg)] px-2.5 py-1.5 text-sm text-[color:var(--ed-action-fg)] hover:opacity-85 disabled:opacity-45">
            <Send size={13} />
          </button>
        </form>
      )}
    </div>
  )
}
