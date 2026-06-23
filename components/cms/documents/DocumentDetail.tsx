"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  sendDocumentAction,
  voidDocumentAction,
  resendDocumentAction,
  refreshDocumentAction,
  attachToPayeeAction,
} from "@/actions/cms/documents"
import { KIND_LABELS, type EnvelopeRecord } from "@/lib/esign/types"
import {
  ENVELOPE_STATUS_LABELS,
  statusTone,
  recipientStatusTone,
  envelopeIsSendable,
  envelopeIsInFlight,
  within24hOfExpiry,
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

interface PayeeOption { id: string; name: string }

export function DocumentDetail({
  env: initial,
  canEdit,
  payees,
  linkedPayee,
}: {
  env: EnvelopeRecord
  canEdit: boolean
  payees: PayeeOption[]
  linkedPayee: { id: string; name: string } | null
}) {
  const [env, setEnv] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [payeeId, setPayeeId] = useState(env.payeeId ?? "")
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ ok: true; value: EnvelopeRecord } | { ok: false; error: string }>, ok: string) =>
    startTransition(async () => {
      setError(null)
      setNotice(null)
      const res = await fn()
      if (res.ok) {
        setEnv(res.value)
        setNotice(ok)
      } else {
        setError(res.error)
      }
    })

  const completed = env.status === "completed"

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/documents" className="text-xs text-zinc-500 hover:text-zinc-300">← Documents</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{env.subject}</h1>
          <Tag label={ENVELOPE_STATUS_LABELS[env.status]} tone={statusTone(env.status)} />
        </div>
        <div className="mt-1 text-sm text-zinc-500">
          {KIND_LABELS[env.kind] ?? env.kind} · created {new Date(env.createdAt).toLocaleString()} by {env.createdBy}
          {env.externalDocumentId && <> · Documenso {env.externalDocumentId}</>}
        </div>
      </div>

      {env.expiresAt && within24hOfExpiry(env.expiresAt) && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          Expires {new Date(env.expiresAt).toLocaleString()} — within 24 hours.
        </div>
      )}
      {notice && <div className="rounded-lg bg-zinc-800/60 p-3 text-sm text-zinc-300">{notice}</div>}
      {error && <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}

      {env.message && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">{env.message}</div>
      )}

      {/* Recipients */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Recipients</h2>
        <ul className="space-y-2">
          {env.recipients.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-2 last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{r.name}</span>
                  <span className="text-xs text-zinc-500">{r.role}</span>
                  {typeof r.signingOrder === "number" && <span className="text-xs text-zinc-600">#{r.signingOrder}</span>}
                </div>
                <div className="truncate text-xs text-zinc-500">{r.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Tag label={r.status} tone={recipientStatusTone(r.status)} />
                {canEdit && envelopeIsInFlight(env) && r.status !== "signed" && r.status !== "declined" && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resendDocumentAction(env.id, [r.email]), `Reminder sent to ${r.name}.`)}>
                    Remind
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Attachments */}
      <div className="flex flex-wrap gap-3 text-sm">
        {env.attachment && (
          <a href={`/api/admin/documents/${env.id}/attachment`} target="_blank" rel="noreferrer" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-200 hover:border-zinc-600">
            View uploaded PDF
          </a>
        )}
        {completed && (
          <a href={`/api/admin/documents/${env.id}/attachment?signed=1`} target="_blank" rel="noreferrer" className="rounded-md border border-emerald-800/50 bg-emerald-950/40 px-3 py-1.5 text-emerald-200 hover:border-emerald-700">
            Download signed PDF
          </a>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-semibold text-white">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {envelopeIsSendable(env) && env.attachment && (
              <Button size="sm" disabled={pending} onClick={() => run(() => sendDocumentAction(env.id), "Envelope sent.")}>Send</Button>
            )}
            {envelopeIsInFlight(env) && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resendDocumentAction(env.id), "Reminders sent.")}>Resend all</Button>
            )}
            {env.externalDocumentId && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => refreshDocumentAction(env.id), "Status refreshed from Documenso.")}>Refresh status</Button>
            )}
          </div>
          {env.status !== "voided" && env.status !== "completed" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Void reason (optional)…" className="max-w-xs border-zinc-700 bg-zinc-900 text-zinc-100" />
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" disabled={pending} onClick={() => run(() => voidDocumentAction(env.id, voidReason), "Envelope voided.")}>Void</Button>
            </div>
          )}
        </div>
      )}

      {/* Payee link */}
      <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-semibold text-white">Payee</h2>
        {linkedPayee ? (
          <p className="text-sm text-zinc-300">
            Linked to{" "}
            <Link href={`/admin/financials/payees/${linkedPayee.id}`} className="text-sky-400 hover:underline">{linkedPayee.name}</Link>
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Not linked to a payee.</p>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={payeeId} onChange={(e) => setPayeeId(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100">
              <option value="">— none —</option>
              {payees.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => attachToPayeeAction(env.id, payeeId || null), "Payee link updated.")}>Save link</Button>
          </div>
        )}
      </div>
    </div>
  )
}
