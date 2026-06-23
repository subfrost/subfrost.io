"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SkeletonTable } from "@/components/cms/Skeleton"
import {
  listReviewLinksAction,
  createReviewLinkAction,
  revokeReviewLinkAction,
} from "@/actions/cms/reviews"
import { REVIEW_SCOPES, SCOPE_LABELS, type ReviewLinkRow, type ReviewScope, type CreatedReviewLink } from "@/lib/compliance/types"

export function ReviewsManager() {
  const [links, setLinks] = useState<ReviewLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<CreatedReviewLink | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    const res = await listReviewLinksAction()
    if (res.ok) {
      setLinks(res.links)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  const revoke = (id: string) =>
    startTransition(async () => {
      const res = await revokeReviewLinkAction(id)
      if (res.ok) fetchLinks()
      else setError(res.error)
    })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => setCreating((v) => !v)}>{creating ? "Close" : "New reviewer link"}</Button>
        <span className="text-xs text-zinc-500">{links.length} link(s)</span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {justCreated && (
        <div className="space-y-2 rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-sm">
          <div className="font-semibold text-emerald-200">Link created — copy the password now, it won&apos;t be shown again.</div>
          <Field label="URL">
            <code className="break-all text-emerald-100">{origin()}{justCreated.path}</code>
          </Field>
          <Field label="Password">
            <code className="text-emerald-100">{justCreated.password}</code>
          </Field>
          <button type="button" onClick={() => setJustCreated(null)} className="text-xs text-emerald-300 underline">dismiss</button>
        </div>
      )}

      {creating && (
        <CreateForm
          onCreated={(c) => {
            setCreating(false)
            setJustCreated(c)
            fetchLinks()
          }}
          onError={setError}
        />
      )}

      {loading ? (
        <SkeletonTable />
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">No reviewer links yet.</div>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{l.reviewerLabel}</span>
                  <span className={`rounded-md border px-2 py-0.5 text-xs ${l.active ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-300" : "border-zinc-700 bg-zinc-800 text-zinc-400"}`}>
                    {l.revokedAt ? "revoked" : l.active ? "active" : "expired"}
                  </span>
                  <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">{l.scope}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {l.reviewerEmail ? `${l.reviewerEmail} · ` : ""}expires {new Date(l.expiresAt).toLocaleDateString()} · {l.sessionCount} session(s)
                </div>
                {l.notes && <div className="mt-1 text-xs text-zinc-600">{l.notes}</div>}
              </div>
              {l.active && (
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" disabled={pending} onClick={() => revoke(l.id)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CreateForm({
  onCreated,
  onError,
}: {
  onCreated: (c: CreatedReviewLink) => void
  onError: (m: string) => void
}) {
  const [label, setLabel] = useState("")
  const [email, setEmail] = useState("")
  const [scope, setScope] = useState<ReviewScope>("compliance-full")
  const [ttlDays, setTtlDays] = useState(30)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const res = await createReviewLinkAction({
        reviewerLabel: label.trim(),
        reviewerEmail: email.trim() || null,
        scope,
        ttlDays,
        notes: notes.trim() || null,
      })
      if (res.ok) onCreated(res.created)
      else onError(res.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-white">New reviewer link</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reviewer label (e.g. Acme AML LLP)" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Reviewer email (optional)" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">
          Scope
          <select value={scope} onChange={(e) => setScope(e.target.value as ReviewScope)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100">
            {REVIEW_SCOPES.map((s) => (
              <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Expires in (days)
          <Input type="number" min={1} max={365} value={ttlDays} onChange={(e) => setTtlDays(Number(e.target.value) || 30)} className="mt-1 border-zinc-700 bg-zinc-900 text-zinc-100" />
        </label>
      </div>
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
      <Button disabled={busy || !label.trim()} onClick={submit}>{busy ? "Creating…" : "Create link"}</Button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="text-zinc-500">{label}: </span>
      {children}
    </div>
  )
}

function origin(): string {
  if (typeof window !== "undefined") return window.location.origin
  return ""
}
