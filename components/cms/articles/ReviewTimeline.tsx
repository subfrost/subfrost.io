"use client"

// WS5 — the review audit log: version bumps interleaved chronologically with
// comments. Version-relevant bumps read inline next to the comments that
// prompted them. Stacks vertically (mobile-friendly by default).

import type { TimelineEntry } from "@/actions/cms/articles-review"
import { accentColor } from "./comment-color"

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

const STAGE_LABEL: Record<string, string> = { DRAFT: "drafted", REVIEW: "sent to review", PUBLISHED: "published" }

export function ReviewTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-1 py-4 text-center text-xs text-zinc-500">No review activity yet.</p>
  }
  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        if (e.kind === "version") {
          return (
            <li key={`v-${e.id}`} className="flex gap-2 text-xs">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zinc-500" />
              <div>
                <span className="font-medium text-zinc-200">v{e.number}</span>{" "}
                <span className="text-zinc-400">{STAGE_LABEL[e.stage] ?? e.stage.toLowerCase()}</span>
                {e.editor ? <span className="text-zinc-500"> by {e.editor.name}</span> : null}
                <span className="text-zinc-600"> · {timeLabel(e.createdAt)}</span>
              </div>
            </li>
          )
        }
        return (
          <li key={`c-${e.id}`} className="flex gap-2 text-xs">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: accentColor(e.author.id) }} />
            <div className="min-w-0">
              <span className="font-medium text-zinc-200">{e.author.name}</span>
              <span className="text-zinc-500"> commented</span>
              {e.status === "RESOLVED" ? <span className="text-emerald-400"> · resolved</span> : null}
              {e.status === "ORPHANED" ? <span className="text-amber-400"> · orphaned</span> : null}
              <span className="text-zinc-600"> · {timeLabel(e.createdAt)}</span>
              <p className="truncate text-zinc-400">{e.body}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
