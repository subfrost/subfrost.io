"use client"

import { MONEY_INTENT_STATUS_LABELS } from "@/lib/stripe/shapes"
import { centsToDisplay } from "@/lib/stripe/format"
import { Button } from "@/components/ui/button"
import type { MoneyIntentRow } from "@/lib/stripe/money"

interface MoneyIntentQueueProps {
  intents: MoneyIntentRow[]
  pending: boolean
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
  error?: string | null
  canEdit?: boolean
}

function statusBadgeClass(status: string): string {
  if (status === "CONFIRMED")
    return "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
  if (status === "CANCELED")
    return "rounded-md border border-red-700/50 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-400"
  return "rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-400"
}


export function MoneyIntentQueue({ intents, pending, onConfirm, onCancel, error, canEdit = true }: MoneyIntentQueueProps) {
  const statusLabel = (status: string): string =>
    (MONEY_INTENT_STATUS_LABELS as Record<string, string>)[status] ?? status

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
      )}

      {intents.length === 0 ? (
        <p className="text-sm text-zinc-500">No intents queued.</p>
      ) : (
        <ul className="space-y-3">
          {intents.map((intent) => (
            <li key={intent.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{centsToDisplay(intent.amount)}</span>
                {intent.direction && (
                  <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400 uppercase">
                    {intent.direction}
                  </span>
                )}
                <span className={statusBadgeClass(intent.status)}>{statusLabel(intent.status)}</span>
              </div>

              <div className="mb-2 flex flex-wrap gap-4 text-sm text-zinc-400">
                {intent.counterparty && (
                  <span>
                    <span className="text-zinc-600">Counterparty: </span>
                    {intent.counterparty}
                  </span>
                )}
                {intent.reference && (
                  <span>
                    <span className="text-zinc-600">Reference: </span>
                    {intent.reference}
                  </span>
                )}
              </div>

              {intent.memo && (
                <p className="mb-2 text-sm text-zinc-400">
                  <span className="text-zinc-600">Memo: </span>
                  {intent.memo}
                </p>
              )}

              <div className="mb-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                <span>
                  Requested by {intent.requestedBy} · {new Date(intent.requestedAt).toLocaleString()}
                </span>
              </div>

              {intent.status === "QUEUED" && canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={pending} onClick={() => onConfirm(intent.id)}>
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => onCancel(intent.id)}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {(intent.status === "CONFIRMED" || intent.status === "CANCELED") &&
                intent.decidedBy && (
                  <p className="mt-2 text-xs text-zinc-600">
                    {intent.status === "CONFIRMED" ? "Confirmed" : "Canceled"} by {intent.decidedBy}
                    {intent.decidedAt && ` · ${new Date(intent.decidedAt).toLocaleString()}`}
                  </p>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
