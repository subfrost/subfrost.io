"use client"

import { useEffect, useMemo, useState } from "react"
import { Link2, Loader2, Plus, Search, UserCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  linkEntityFileAction, unlinkEntityFileAction, listFileLinksAction,
} from "@/actions/cms/files"
import { legalEntitiesAction } from "@/actions/cms/legal"
import type { FileEntityLinkView } from "@/lib/files/manager"
import type { EntityFileRole } from "@prisma/client"

// The file↔registry graph, surfaced on a file. Lists every entity tied to the
// document (its signatories, counterparties, subjects) and — when canEdit — lets
// an operator add/remove links. The ingest records likely matches on
// metadata.suggestedEntities; those show as one-click "suggested" chips so the
// manual review pass is fast.

const ROLES: { value: EntityFileRole; label: string }[] = [
  { value: "SIGNATORY", label: "Signatory" },
  { value: "COUNTERPARTY", label: "Counterparty" },
  { value: "SUBJECT", label: "Subject" },
  { value: "MENTIONED", label: "Mentioned" },
]
const ROLE_LABEL: Record<EntityFileRole, string> = {
  SIGNATORY: "Signatory", COUNTERPARTY: "Counterparty", SUBJECT: "Subject", MENTIONED: "Mentioned",
}
const ROLE_TONE: Record<EntityFileRole, string> = {
  SIGNATORY: "border-emerald-700 bg-emerald-950/40 text-emerald-300",
  COUNTERPARTY: "border-sky-700 bg-sky-950/40 text-sky-300",
  SUBJECT: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
  MENTIONED: "border-zinc-800 bg-zinc-900/60 text-zinc-400",
}

type EntityOpt = { id: string; name: string; category: string; scope: string }

export function FileEntityLinks({
  fileId, canEdit, suggested, onError,
}: {
  fileId: string
  canEdit: boolean
  suggested: string[]
  onError: (msg: string) => void
}) {
  const [links, setLinks] = useState<FileEntityLinkView[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [entities, setEntities] = useState<EntityOpt[] | null>(null)
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<EntityFileRole>("SIGNATORY")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLinks(null)
    listFileLinksAction(fileId).then((r) => {
      if (r.ok) setLinks(r.links)
      else { onError(r.error); setLinks([]) }
    })
  }, [fileId, onError])

  // Lazy-load the entity list the first time the picker opens.
  const ensureEntities = () => {
    if (entities) return
    legalEntitiesAction().then((r) => {
      if (r.ok) setEntities(r.entities.map((e) => ({ id: e.id, name: e.name, category: e.category, scope: e.scope })))
      else onError(r.error)
    })
  }

  const linkedIds = useMemo(() => new Set((links ?? []).map((l) => l.entity.id)), [links])

  const filtered = useMemo(() => {
    if (!entities) return []
    const q = query.trim().toLowerCase()
    return entities
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [entities, query])

  const doLink = async (entityId: string, r: EntityFileRole) => {
    setBusy(true)
    const res = await linkEntityFileAction({ fileId, entityId, role: r })
    setBusy(false)
    if (!res.ok) { onError(res.error); return }
    setLinks((cur) => {
      const next = (cur ?? []).filter((l) => !(l.entity.id === entityId && l.role === r))
      return [...next, res.link]
    })
    setQuery(""); setAdding(false)
  }

  const doUnlink = async (linkId: string) => {
    setBusy(true)
    const res = await unlinkEntityFileAction(linkId)
    setBusy(false)
    if (!res.ok) { onError(res.error); return }
    setLinks((cur) => (cur ?? []).filter((l) => l.id !== linkId))
  }

  // suggestions not already linked (by name, case-insensitive)
  const linkedNames = useMemo(() => new Set((links ?? []).map((l) => l.entity.name.toLowerCase())), [links])
  const openSuggestions = suggested.filter((s) => !linkedNames.has(s.toLowerCase()))

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs text-zinc-400">
        <UserCheck size={12} /> Entities &amp; signatories
      </Label>

      {links === null ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Loading…</div>
      ) : links.length === 0 ? (
        <p className="text-xs text-zinc-600">No entities linked.</p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-xs">
              <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] ${ROLE_TONE[l.role]}`}>
                {ROLE_LABEL[l.role]}
              </span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">{l.entity.name}</span>
              {l.entity.scope === "OYL" && <span className="shrink-0 text-[10px] text-amber-500/80">OYL</span>}
              {canEdit && (
                <button aria-label={`Remove ${l.entity.name}`} className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-zinc-600 hover:text-red-400" disabled={busy} onClick={() => doUnlink(l.id)}>
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* one-click suggestions from the ingest matcher */}
      {canEdit && openSuggestions.length > 0 && entities !== null && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {openSuggestions.map((name) => {
            const match = entities.find((e) => e.name.toLowerCase() === name.toLowerCase())
            if (!match || linkedIds.has(match.id)) return null
            return (
              <button
                key={name}
                disabled={busy}
                onClick={() => doLink(match.id, "SIGNATORY")}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-800 bg-emerald-950/20 px-2 py-0.5 text-[11px] text-emerald-300/90 hover:bg-emerald-950/50"
                title="Suggested by ingest — click to link as signatory"
              >
                <Plus size={11} /> {name}
              </button>
            )
          })}
        </div>
      )}

      {canEdit && (
        adding ? (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="flex items-center gap-2">
              <Search size={13} className="shrink-0 text-zinc-500" />
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entities…" className="h-8 bg-zinc-950 text-xs text-zinc-100 border-zinc-700" />
              <button aria-label="Cancel" className="text-zinc-500 hover:text-zinc-300" onClick={() => { setAdding(false); setQuery("") }}><X size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-1">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${role === r.value ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {entities === null ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Loading entities…</div>
            ) : filtered.length === 0 ? (
              <p className="px-1 text-xs text-zinc-600">{query ? "No matches." : "Type to search."}</p>
            ) : (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <button
                      disabled={busy || linkedIds.has(e.id)}
                      onClick={() => doLink(e.id, role)}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      <span className="min-w-0 truncate">{e.name}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{linkedIds.has(e.id) ? "linked" : e.scope}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setAdding(true); ensureEntities() }}>
            <Link2 size={13} /> Link entity
          </Button>
        )
      )}
    </div>
  )
}
