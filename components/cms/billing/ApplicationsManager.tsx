"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listApplicationsAction, upsertApplicationAction } from "@/actions/cms/billing"
import {
  STRIPE_APPLICATION_PRODUCTS,
  STRIPE_APPLICATION_STATUSES,
  STRIPE_APPLICATION_STATUS_LABELS,
} from "@/lib/stripe/shapes"
import type { ApplicationRow } from "@/lib/stripe/applications"
import { SkeletonTable } from "@/components/cms/Skeleton"

interface CardState {
  status: string
  notes: string
}

function defaultCardState(): CardState {
  return { status: "NOT_STARTED", notes: "" }
}

function toCardState(r: ApplicationRow): CardState {
  return { status: r.status, notes: r.notes ?? "" }
}

export function ApplicationsManager({ canEdit }: { canEdit: boolean }) {
  const [rowsByProduct, setRowsByProduct] = useState<Record<string, ApplicationRow>>({})
  const [drafts, setDrafts] = useState<Record<string, CardState>>(
    Object.fromEntries(STRIPE_APPLICATION_PRODUCTS.map((p) => [p, defaultCardState()])),
  )
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await listApplicationsAction()
    if (res.ok) {
      const byProduct: Record<string, ApplicationRow> = {}
      for (const row of res.applications) {
        byProduct[row.product] = row
      }
      setRowsByProduct(byProduct)
      setDrafts((prev) => {
        const next = { ...prev }
        for (const p of STRIPE_APPLICATION_PRODUCTS) {
          if (byProduct[p]) {
            next[p] = toCardState(byProduct[p])
          }
        }
        return next
      })
      setBanner(null)
    } else {
      setBanner(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const handleSave = (product: string) =>
    startTransition(async () => {
      const draft = drafts[product]
      if (!draft) return
      const res = await upsertApplicationAction(product, {
        status: draft.status,
        notes: draft.notes || undefined,
      })
      if (res.ok) {
        setCardErrors((prev) => ({ ...prev, [product]: "" }))
        await fetchRows()
      } else {
        setCardErrors((prev) => ({ ...prev, [product]: res.error }))
      }
    })

  const setField = (product: string, field: keyof CardState, value: string) =>
    setDrafts((prev) => ({
      ...prev,
      [product]: { ...prev[product], [field]: value },
    }))

  if (loading) return <SkeletonTable />

  return (
    <div className="space-y-4">
      {banner && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {banner}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {STRIPE_APPLICATION_PRODUCTS.map((product) => {
          const row = rowsByProduct[product]
          const draft = drafts[product] ?? defaultCardState()
          const cardError = cardErrors[product]
          const statusLabel =
            STRIPE_APPLICATION_STATUS_LABELS[
              draft.status as keyof typeof STRIPE_APPLICATION_STATUS_LABELS
            ] ?? draft.status

          return (
            <li key={product} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white capitalize">{product}</span>
                <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                  {statusLabel}
                </span>
              </div>

              {cardError && (
                <div className="mb-3 rounded-lg bg-red-950/40 p-2 text-sm text-red-300">
                  {cardError}
                  <button
                    type="button"
                    onClick={() => setCardErrors((prev) => ({ ...prev, [product]: "" }))}
                    className="ml-2 underline"
                  >
                    dismiss
                  </button>
                </div>
              )}

              {canEdit && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Status</label>
                    <select
                      value={draft.status}
                      onChange={(e) => setField(product, "status", e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    >
                      {STRIPE_APPLICATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STRIPE_APPLICATION_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Notes</label>
                    <Input
                      value={draft.notes}
                      onChange={(e) => setField(product, "notes", e.target.value)}
                      placeholder="Internal notes…"
                      className="border-zinc-700 bg-zinc-900 text-zinc-100"
                    />
                  </div>
                </div>
              )}

              {row && (
                <p className="mt-2 text-xs text-zinc-600">
                  Updated by {row.updatedBy} ·{" "}
                  {new Date(row.updatedAt).toLocaleString()}
                </p>
              )}

              {canEdit && (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" disabled={pending} onClick={() => handleSave(product)}>
                    Save
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
