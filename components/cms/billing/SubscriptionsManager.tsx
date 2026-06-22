"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { listTiersAction, listSubscribersAction, changeSubscriptionAction } from "@/actions/cms/billing"
import { SUBSCRIPTION_ACTIONS, SUBSCRIPTION_ACTION_LABELS } from "@/lib/stripe/shapes"
import type { SubscriptionTier, Subscriber } from "@/lib/stripe/shapes"
import { SkeletonTable } from "@/components/cms/Skeleton"

export function SubscriptionsManager({ canEdit }: { canEdit: boolean }) {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()

  const fetchTiers = useCallback(async () => {
    const res = await listTiersAction()
    if (res.ok) {
      setTiers(res.tiers)
      return true
    } else {
      setBanner(res.error)
      return false
    }
  }, [])

  const fetchSubscribers = useCallback(async () => {
    const res = await listSubscribersAction()
    if (res.ok) {
      setSubscribers(res.subscribers)
      return true
    } else {
      setBanner(res.error)
      return false
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchTiers(), fetchSubscribers()])
    setLoading(false)
  }, [fetchTiers, fetchSubscribers])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleAction = (subId: string, action: (typeof SUBSCRIPTION_ACTIONS)[number]) =>
    startTransition(async () => {
      const res = await changeSubscriptionAction(subId, { action })
      if (res.ok) {
        setCardErrors((prev) => ({ ...prev, [subId]: "" }))
        await fetchSubscribers()
      } else {
        setCardErrors((prev) => ({ ...prev, [subId]: res.error }))
      }
    })

  if (loading) return <SkeletonTable />

  return (
    <div className="space-y-8">
      {banner && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {banner}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {/* Tiers section */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Tiers</h2>
        {tiers.length === 0 ? (
          <p className="text-sm text-zinc-500">No tiers found.</p>
        ) : (
          <ul className="space-y-3">
            {tiers.map((t) => (
              <li key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{t.name}</span>
                  <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {t.activeSubs} active
                  </span>
                </div>
                <div className="mb-2 flex flex-wrap gap-4 text-sm text-zinc-400">
                  <span>Monthly: ${(t.priceMonthly / 100).toFixed(2)}</span>
                  <span>Yearly: ${(t.priceYearly / 100).toFixed(2)}</span>
                </div>
                {t.features.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {t.features.map((f, i) => (
                      <li key={i} className="text-xs text-zinc-500">
                        · {f}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Subscribers section */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Subscribers</h2>
        {subscribers.length === 0 ? (
          <p className="text-sm text-zinc-500">No subscribers found.</p>
        ) : (
          <ul className="space-y-3">
            {subscribers.map((sub) => {
              const cardError = cardErrors[sub.id]
              return (
                <li key={sub.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{sub.customerEmail}</span>
                    <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      {sub.tier}
                    </span>
                    <span
                      className={
                        sub.status === "active"
                          ? "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
                          : sub.status === "canceled"
                            ? "rounded-md border border-red-700/50 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-400"
                            : sub.status === "past_due"
                              ? "rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-400"
                              : "rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400"
                      }
                    >
                      {sub.status}
                    </span>
                  </div>

                  {cardError && (
                    <div className="mb-3 rounded-lg bg-red-950/40 p-2 text-sm text-red-300">
                      {cardError}
                      <button
                        type="button"
                        onClick={() => setCardErrors((prev) => ({ ...prev, [sub.id]: "" }))}
                        className="ml-2 underline"
                      >
                        dismiss
                      </button>
                    </div>
                  )}

                  <div className="mb-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                    <span>Started: {new Date(sub.startedAt).toLocaleString()}</span>
                    <span>Renews: {sub.renewsAt ? new Date(sub.renewsAt).toLocaleString() : "—"}</span>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {sub.status !== "canceled" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(sub.id, "cancel")}
                        >
                          {SUBSCRIPTION_ACTION_LABELS.cancel}
                        </Button>
                      )}
                      {sub.status === "canceled" && (
                        <Button
                          size="sm"
                          onClick={() => handleAction(sub.id, "resume")}
                        >
                          {SUBSCRIPTION_ACTION_LABELS.resume}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
