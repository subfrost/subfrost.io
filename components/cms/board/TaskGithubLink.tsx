"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Github, Link2, Loader2, X } from "lucide-react"
import { linkTaskAction, unlinkTaskAction } from "@/actions/github/intake"
import { GITHUB_REPOS, repoLabel } from "@/lib/github/config"
import type { TaskView } from "@/lib/tasks/types"

const STATE_TONE: Record<string, string> = {
  open: "bg-emerald-900/40 text-emerald-300",
  closed: "bg-red-900/40 text-red-300",
  merged: "bg-violet-900/40 text-violet-300",
}

// The GitHub link on a task: shows the linked issue/PR (with live state) and,
// for editors, lets you link by repo + number or unlink. Linking pulls current
// state from GitHub via the PAT.
export function TaskGithubLink({ task, canEdit }: { task: TaskView; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [repo, setRepo] = useState<string>(GITHUB_REPOS[0])
  const [number, setNumber] = useState("")

  const link = () => {
    const n = parseInt(number, 10)
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a valid issue/PR number"); return }
    setError(null)
    start(async () => {
      const r = await linkTaskAction(task.id, repo, n)
      if (!r.ok) setError(r.error)
      else { setAdding(false); setNumber(""); router.refresh() }
    })
  }
  const unlink = () => {
    setError(null)
    start(async () => {
      const r = await unlinkTaskAction(task.id)
      if (!r.ok) setError(r.error); else router.refresh()
    })
  }

  return (
    <div>
      <label className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-1.5 block">GitHub</label>
      {task.github ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
          <a href={task.github.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm text-zinc-200 hover:text-white">
            <Github size={15} className="shrink-0 text-zinc-400" />
            <span className="truncate">{repoLabel(task.github.repo)}#{task.github.number}</span>
            <span className="shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">{task.github.kind}</span>
            {task.github.state && <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${STATE_TONE[task.github.state] ?? "bg-zinc-800 text-zinc-400"}`}>{task.github.state}</span>}
            <ExternalLink size={12} className="shrink-0 text-zinc-500" />
          </a>
          {canEdit && <button onClick={unlink} disabled={pending} className="shrink-0 text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40">Unlink</button>}
        </div>
      ) : canEdit ? (
        adding ? (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
            <div className="flex gap-2">
              <select value={repo} onChange={(e) => setRepo(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100">
                {GITHUB_REPOS.map((r) => <option key={r} value={r}>{repoLabel(r)}</option>)}
              </select>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") link() }}
                placeholder="#"
                inputMode="numeric"
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              />
              <button onClick={link} disabled={pending} className="inline-flex items-center gap-1 rounded bg-sky-700 px-2.5 py-1.5 text-sm text-white hover:bg-sky-600 disabled:opacity-40">
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Link
              </button>
              <button onClick={() => { setAdding(false); setError(null) }} className="text-zinc-500 hover:text-zinc-300"><X size={15} /></button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline">
            <Github size={13} /> Link a GitHub issue or PR
          </button>
        )
      ) : (
        <span className="text-[11px] text-zinc-600">Not linked</span>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  )
}
