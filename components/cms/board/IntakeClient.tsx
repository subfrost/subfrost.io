"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Check, ExternalLink, Github, Loader2, X } from "lucide-react"
import { acceptIssueAction, denyIssueAction, listIntakeAction } from "@/actions/github/intake"
import type { IntakeIssueView } from "@/lib/github/intake"
import type { GithubIntakeState } from "@prisma/client"

type Counts = { pending: number; accepted: number; denied: number }
const TABS: { key: GithubIntakeState; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "DENIED", label: "Denied" },
]
const REPO_TONE = "rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300"

export function IntakeClient({ initial, counts: initialCounts, canEdit }: {
  initial: IntakeIssueView[]
  counts: Counts
  canEdit: boolean
}) {
  const [issues, setIssues] = useState<IntakeIssueView[]>(initial)
  const [counts, setCounts] = useState<Counts>(initialCounts)
  const [tab, setTab] = useState<GithubIntakeState>("PENDING")
  const [repo, setRepo] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const repos = useMemo(() => Array.from(new Set(initial.map((i) => i.repo))).sort(), [initial])

  const refresh = () =>
    listIntakeAction().then((r) => { if (r.ok) { setIssues(r.value.issues); setCounts(r.value.counts) } })

  const shown = issues.filter((i) => i.intake === tab && (!repo || i.repo === repo))

  const accept = (id: string) => {
    setError(null); setBusyId(id)
    startTransition(async () => {
      const r = await acceptIssueAction(id)
      setBusyId(null)
      if (!r.ok) setError(r.error); else await refresh()
    })
  }
  const deny = (id: string, closeOnGithub: boolean) => {
    setError(null); setBusyId(id)
    startTransition(async () => {
      const r = await denyIssueAction(id, { closeOnGithub, reason: closeOnGithub ? "Closing — not planned. Thanks for the report." : undefined })
      setBusyId(null)
      if (!r.ok) setError(r.error); else await refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-zinc-800 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded px-3 py-1.5 text-sm ${tab === t.key ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-zinc-500">
                {t.key === "PENDING" ? counts.pending : t.key === "ACCEPTED" ? counts.accepted : counts.denied}
              </span>
            </button>
          ))}
        </div>
        {repos.length > 1 && (
          <select value={repo} onChange={(e) => setRepo(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200">
            <option value="">All repos</option>
            {repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400/70 hover:text-red-300"><X size={15} /></button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-4 py-16 text-center">
          <Github size={26} className="text-zinc-700" />
          <p className="text-sm text-zinc-500">No {tab.toLowerCase()} issues{repo ? ` in ${repo}` : ""}.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((i) => (
            <li key={i.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={REPO_TONE}>{i.repoLabel}</span>
                    <span className="text-xs text-zinc-500">#{i.number}</span>
                    {i.state === "closed" && <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] text-red-300">closed on GitHub</span>}
                    {i.labels.map((l) => <span key={l} className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">{l}</span>)}
                  </div>
                  <div className="mt-1 truncate font-medium text-white">{i.title}</div>
                  {i.body && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{i.body}</p>}
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-500">
                    {i.author && <span>by {i.author}</span>}
                    <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline"><ExternalLink size={12} /> GitHub</a>
                    {i.taskId && <Link href="/admin/board" className="text-violet-300 hover:underline">on board →</Link>}
                  </div>
                </div>
                {canEdit && i.intake === "PENDING" && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      disabled={busyId === i.id}
                      onClick={() => accept(i.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                    >
                      {busyId === i.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Accept
                    </button>
                    <button
                      disabled={busyId === i.id}
                      onClick={() => deny(i.id, false)}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      <X size={13} /> Deny
                    </button>
                    <button
                      disabled={busyId === i.id}
                      onClick={() => deny(i.id, true)}
                      title="Deny and close the issue on GitHub"
                      className="text-[10px] text-zinc-600 hover:text-red-300 disabled:opacity-40"
                    >
                      deny + close on GitHub
                    </button>
                  </div>
                )}
                {i.intake !== "PENDING" && (
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${i.intake === "ACCEPTED" ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
                    {i.intake}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
