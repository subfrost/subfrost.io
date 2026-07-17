"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createFromFileAction, sendDocumentAction } from "@/actions/cms/documents"
import {
  ENVELOPE_KINDS,
  KIND_LABELS,
  type EnvelopeKind,
  type RecipientInput,
  type RecipientRole,
} from "@/lib/esign/types"

const ROLES: RecipientRole[] = ["signer", "approver", "cc", "viewer"]

interface PayeeOption { id: string; name: string }

// Focused "Request signatures" view launched from a file
// (/admin/documents/new?fromFile=<id>). The PDF source is the DriveFile itself,
// so there's no upload — createFromFileAction pulls the bytes server-side.
export function NewFromFileForm({
  fileId,
  fileName,
  entityId,
  entityName,
  initialRecipients,
  payees,
}: {
  fileId: string
  fileName: string
  entityId: string | null
  entityName: string | null
  initialRecipients: RecipientInput[]
  payees: PayeeOption[]
}) {
  const router = useRouter()
  const [kind, setKind] = useState<EnvelopeKind>("other")
  const [subject, setSubject] = useState(fileName.replace(/\.pdf$/i, ""))
  const [message, setMessage] = useState("")
  const [payeeId, setPayeeId] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [signingOrder, setSigningOrder] = useState(false)
  const [sendNow, setSendNow] = useState(true)
  const [recipients, setRecipients] = useState<RecipientInput[]>(
    initialRecipients.length > 0 ? initialRecipients : [{ name: "", email: "", role: "signer" }],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setR = (i: number, patch: Partial<RecipientInput>) =>
    setRecipients((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const clean = recipients
        .map((r, i) => ({ ...r, signingOrder: signingOrder ? i + 1 : undefined }))
        .filter((r) => r.name.trim() && r.email.trim())
      if (clean.length === 0) {
        setError("Add at least one recipient with a name and email.")
        return
      }
      const created = await createFromFileAction({
        fileId,
        kind,
        subject: subject.trim(),
        message: message.trim() || undefined,
        recipients: clean,
        signingOrderEnabled: signingOrder,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        entityId: entityId ?? null,
        payeeId: payeeId || null,
      })
      if (!created.ok) {
        setError(created.error)
        return
      }
      if (sendNow) {
        const sent = await sendDocumentAction(created.value.id)
        if (!sent.ok) {
          setError(`Draft created from file, but send failed: ${sent.error}`)
          return
        }
      }
      router.push(`/admin/documents/${created.value.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/documents" className="text-xs text-zinc-500 hover:text-zinc-300">← Documents</Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Request signatures</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Launching an envelope from <span className="text-zinc-300">{fileName}</span>
          {entityName && <> · concerning <span className="text-zinc-300">{entityName}</span></>}
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}

      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
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
      </div>
    </div>
  )
}
