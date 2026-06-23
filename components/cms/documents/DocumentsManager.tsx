"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SkeletonTable } from "@/components/cms/Skeleton"
import {
  documentsOverviewAction,
  createDocumentAction,
  sendDocumentAction,
  createFromTemplateAction,
} from "@/actions/cms/documents"
import type { DocumentsOverview } from "@/actions/cms/documents"
import {
  ENVELOPE_KINDS,
  KIND_LABELS,
  type EnvelopeKind,
  type EnvelopeRecord,
  type RecipientInput,
  type RecipientRole,
  type TemplateRecord,
} from "@/lib/esign/types"
import {
  ENVELOPE_STATUS_LABELS,
  statusTone,
  envelopeProgress,
  inBucket,
  matchesSearch,
  FILTER_LABELS,
  type FilterBucket,
  type Tone,
} from "@/lib/esign/document-ui"

const TONE_CLS: Record<Tone, string> = {
  ok: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  bad: "bg-red-950/50 text-red-300 border-red-800/50",
  info: "bg-blue-950/50 text-blue-300 border-blue-800/50",
  warn: "bg-amber-950/50 text-amber-300 border-amber-800/50",
}

function Tag({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TONE_CLS[tone]}`}>{label}</span>
}

const ROLES: RecipientRole[] = ["signer", "approver", "cc", "viewer"]
const FILTERS: FilterBucket[] = ["all", "in-flight", "completed", "drafts", "blocked"]

interface PayeeOption { id: string; name: string }

export function DocumentsManager({
  canEdit,
  payees,
}: {
  canEdit: boolean
  payees: PayeeOption[]
}) {
  const [overview, setOverview] = useState<DocumentsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [bucket, setBucket] = useState<FilterBucket>("all")
  const [mode, setMode] = useState<null | "new" | "template">(null)
  const [pending, startTransition] = useTransition()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await documentsOverviewAction()
    if (res.ok) {
      setOverview(res.overview)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const visible = useMemo(() => {
    const list = overview?.envelopes ?? []
    return list.filter((e) => inBucket(e, bucket) && matchesSearch(e, search))
  }, [overview, bucket, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subject, recipient, kind…"
          className="max-w-md flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                bucket === b
                  ? "border-sky-700 bg-sky-950/50 text-sky-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {FILTER_LABELS[b]}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setMode(mode === "new" ? null : "new")}>
              {mode === "new" ? "Close" : "New envelope"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(mode === "template" ? null : "template")}>
              From template
            </Button>
          </div>
        )}
      </div>

      {overview && !overview.documensoLive && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          Documenso credentials are not configured — envelopes are created in local mock mode
          (status flips locally; no real emails are sent). Set DOCUMENSO_API_URL + DOCUMENSO_API_KEY to go live.
        </div>
      )}

      {notice && (
        <div className="rounded-lg bg-zinc-800/60 p-3 text-sm text-zinc-300">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {canEdit && mode === "new" && (
        <NewEnvelopeForm
          payees={payees}
          onDone={(msg) => {
            setMode(null)
            setNotice(msg)
            fetchData()
          }}
          onError={setError}
        />
      )}
      {canEdit && mode === "template" && (
        <TemplateForm
          templates={overview?.templates ?? []}
          payees={payees}
          onDone={(msg) => {
            setMode(null)
            setNotice(msg)
            fetchData()
          }}
          onError={setError}
        />
      )}

      {loading ? (
        <SkeletonTable />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">
          {search || bucket !== "all" ? "No matching envelopes." : "No envelopes yet."}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => (
            <EnvelopeRow key={e.id} env={e} />
          ))}
        </ul>
      )}
      {pending && <div className="text-xs text-zinc-500">working…</div>}
    </div>
  )
}

function EnvelopeRow({ env }: { env: EnvelopeRecord }) {
  const prog = envelopeProgress(env)
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700">
      <Link href={`/admin/documents/${env.id}`} className="block">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-white">{env.subject}</span>
              <Tag label={ENVELOPE_STATUS_LABELS[env.status]} tone={statusTone(env.status)} />
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {KIND_LABELS[env.kind] ?? env.kind} · {prog.signed}/{prog.total} signed
              {" · "}created {new Date(env.createdAt).toLocaleDateString()}
            </div>
            <div className="mt-1 truncate text-xs text-zinc-600">
              {env.recipients.map((r) => r.name).join(", ")}
            </div>
          </div>
          <div className="text-xs text-zinc-500">{prog.pct}%</div>
        </div>
      </Link>
    </li>
  )
}

// ---------- New envelope (single PDF upload) -----------------------------

function NewEnvelopeForm({
  payees,
  onDone,
  onError,
}: {
  payees: PayeeOption[]
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [kind, setKind] = useState<EnvelopeKind>("other")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [payeeId, setPayeeId] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [signingOrder, setSigningOrder] = useState(false)
  const [sendNow, setSendNow] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { name: "", email: "", role: "signer" },
  ])
  const [busy, setBusy] = useState(false)

  const setR = (i: number, patch: Partial<RecipientInput>) =>
    setRecipients((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  async function submit() {
    if (!file) return onError("Attach a PDF to send.")
    setBusy(true)
    try {
      const clean = recipients
        .map((r, i) => ({ ...r, signingOrder: signingOrder ? i + 1 : undefined }))
        .filter((r) => r.name.trim() && r.email.trim())
      const created = await createDocumentAction({
        kind,
        subject: subject.trim(),
        message: message.trim() || undefined,
        recipients: clean,
        signingOrderEnabled: signingOrder,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        payeeId: payeeId || null,
      })
      if (!created.ok) {
        onError(created.error)
        return
      }
      const fd = new FormData()
      fd.append("envelopeId", created.value.id)
      fd.append("file", file)
      const up = await fetch("/api/admin/documents/upload", { method: "POST", body: fd })
      if (!up.ok) {
        const j = await up.json().catch(() => ({}))
        onError(`Created draft but PDF upload failed: ${j.error ?? up.statusText}`)
        return
      }
      if (sendNow) {
        const sent = await sendDocumentAction(created.value.id)
        if (!sent.ok) {
          onError(`Draft saved + PDF attached, but send failed: ${sent.error}`)
          return
        }
      }
      onDone(sendNow ? "Envelope sent." : "Draft saved with PDF attached.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShell title="New envelope">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EnvelopeKind)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            {ENVELOPE_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Link to payee (optional)
          <select
            value={payeeId}
            onChange={(e) => setPayeeId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="">— none —</option>
            {payees.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject…" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message to recipients (optional)…"
        rows={2}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
      />

      <div className="space-y-2">
        <div className="text-xs font-medium text-zinc-400">Recipients</div>
        {recipients.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <Input value={r.name} onChange={(e) => setR(i, { name: e.target.value })} placeholder="Name" className="min-w-[8rem] flex-1 border-zinc-700 bg-zinc-900 text-zinc-100" />
            <Input value={r.email} onChange={(e) => setR(i, { email: e.target.value })} placeholder="Email" className="min-w-[10rem] flex-1 border-zinc-700 bg-zinc-900 text-zinc-100" />
            <select
              value={r.role}
              onChange={(e) => setR(i, { role: e.target.value as RecipientRole })}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            {recipients.length > 1 && (
              <button type="button" onClick={() => setRecipients((rs) => rs.filter((_, idx) => idx !== i))} className="text-xs text-red-400">remove</button>
            )}
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRecipients((rs) => [...rs, { name: "", email: "", role: "signer" }])}>+ recipient</Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-xs text-zinc-400">
          PDF
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-xs text-zinc-400" />
        </label>
        <label className="text-xs text-zinc-400">
          Expires
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100" />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={signingOrder} onChange={(e) => setSigningOrder(e.target.checked)} /> Sequential signing
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} /> Send immediately
        </label>
      </div>

      <Button disabled={busy || !subject.trim()} onClick={submit}>
        {busy ? "Working…" : sendNow ? "Create & send" : "Save draft"}
      </Button>
    </FormShell>
  )
}

// ---------- From template -------------------------------------------------

function TemplateForm({
  templates,
  payees,
  onDone,
  onError,
}: {
  templates: TemplateRecord[]
  payees: PayeeOption[]
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "")
  const [subject, setSubject] = useState("")
  const [payeeId, setPayeeId] = useState("")
  const [byRole, setByRole] = useState<Record<string, { name: string; email: string }>>({})
  const [busy, setBusy] = useState(false)

  const template = templates.find((t) => t.id === templateId)

  async function submit() {
    if (!template) return onError("Pick a template.")
    setBusy(true)
    try {
      const recipients = template.recipientRoles.map((role) => ({
        roleId: role.id,
        name: byRole[role.id]?.name?.trim() ?? "",
        email: byRole[role.id]?.email?.trim() ?? "",
      }))
      const res = await createFromTemplateAction(
        { templateId, subject: subject.trim(), recipients },
        payeeId || null,
      )
      if (!res.ok) {
        onError(res.error)
        return
      }
      onDone("Envelope sent from template.")
    } finally {
      setBusy(false)
    }
  }

  if (templates.length === 0) {
    return (
      <FormShell title="From template">
        <p className="text-sm text-zinc-500">No templates available. Create templates in Documenso first.</p>
      </FormShell>
    )
  }

  return (
    <FormShell title="From template">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">
          Template
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100">
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Link to payee (optional)
          <select value={payeeId} onChange={(e) => setPayeeId(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100">
            <option value="">— none —</option>
            {payees.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject…" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
      <div className="space-y-2">
        {template?.recipientRoles.map((role) => (
          <div key={role.id} className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-xs text-zinc-400">{role.label}</span>
            <Input
              defaultValue={role.defaultName}
              onChange={(e) => setByRole((p) => ({ ...p, [role.id]: { ...p[role.id], name: e.target.value, email: p[role.id]?.email ?? role.defaultEmail ?? "" } }))}
              placeholder="Name"
              className="min-w-[8rem] flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
            />
            <Input
              defaultValue={role.defaultEmail}
              onChange={(e) => setByRole((p) => ({ ...p, [role.id]: { ...p[role.id], email: e.target.value, name: p[role.id]?.name ?? role.defaultName ?? "" } }))}
              placeholder="Email"
              className="min-w-[10rem] flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
            />
          </div>
        ))}
      </div>
      <Button disabled={busy || !subject.trim()} onClick={submit}>{busy ? "Sending…" : "Create & send"}</Button>
    </FormShell>
  )
}

function FormShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  )
}
