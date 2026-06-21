"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listCardsAction, listDisputesAction, setCardControlAction, submitDisputeEvidenceAction } from "@/actions/cms/billing"
import { CARD_STATES, CARD_STATE_LABELS } from "@/lib/stripe/shapes"
import type { IssuingCard, IssuingDispute } from "@/lib/stripe/shapes"

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function StateBadge({ state }: { state: IssuingCard["state"] }) {
  const cls =
    state === "active"
      ? "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
      : state === "paused"
        ? "rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-400"
        : "rounded-md border border-red-700/50 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-400"
  return <span className={cls}>{CARD_STATE_LABELS[state]}</span>
}

function DisputeStatusBadge({ status }: { status: IssuingDispute["status"] }) {
  const cls =
    status === "won"
      ? "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
      : status === "lost"
        ? "rounded-md border border-red-700/50 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-400"
        : "rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400"
  return <span className={cls}>{status}</span>
}

export function IssuingManager() {
  const [cards, setCards] = useState<IssuingCard[]>([])
  const [disputes, setDisputes] = useState<IssuingDispute[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [disputeErrors, setDisputeErrors] = useState<Record<string, string>>({})

  // Per-card state select values
  const [cardStateSelects, setCardStateSelects] = useState<Record<string, IssuingCard["state"]>>({})

  // Per-dispute evidence inputs
  const [disputeEvidence, setDisputeEvidence] = useState<Record<string, string>>({})
  const [disputeFiles, setDisputeFiles] = useState<Record<string, string>>({})

  const [, startTransition] = useTransition()

  const fetchCards = useCallback(async () => {
    const res = await listCardsAction()
    if (res.ok) {
      setCards(res.cards)
      // Seed select values for any new cards
      setCardStateSelects((prev) => {
        const next = { ...prev }
        for (const c of res.cards) {
          if (!(c.id in next)) next[c.id] = c.state
        }
        return next
      })
      return true
    } else {
      setBanner(res.error)
      return false
    }
  }, [])

  const fetchDisputes = useCallback(async () => {
    const res = await listDisputesAction()
    if (res.ok) {
      setDisputes(res.disputes)
      return true
    } else {
      setBanner(res.error)
      return false
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchCards(), fetchDisputes()])
    setLoading(false)
  }, [fetchCards, fetchDisputes])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleCardControl = (cardId: string) =>
    startTransition(async () => {
      const state = cardStateSelects[cardId]
      if (!state) return
      const res = await setCardControlAction(cardId, { state })
      if (res.ok) {
        setCardErrors((prev) => ({ ...prev, [cardId]: "" }))
        await fetchCards()
      } else {
        setCardErrors((prev) => ({ ...prev, [cardId]: res.error }))
      }
    })

  const handleDisputeEvidence = (disputeId: string) =>
    startTransition(async () => {
      const evidence = disputeEvidence[disputeId] ?? ""
      const files = disputeFiles[disputeId] ?? ""
      const res = await submitDisputeEvidenceAction(disputeId, {
        evidence,
        evidenceFiles: files ? files.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      })
      if (res.ok) {
        setDisputeErrors((prev) => ({ ...prev, [disputeId]: "" }))
        await fetchDisputes()
      } else {
        setDisputeErrors((prev) => ({ ...prev, [disputeId]: res.error }))
      }
    })

  if (loading) return <div className="text-zinc-500">Loading…</div>

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

      {/* Cards section */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Cards</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-500">No cards found.</p>
        ) : (
          <ul className="space-y-3">
            {cards.map((card) => {
              const cardError = cardErrors[card.id]
              return (
                <li key={card.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{card.cardholder}</span>
                    <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      ••• {card.last4}
                    </span>
                    <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      {card.type}
                    </span>
                    <StateBadge state={card.state} />
                  </div>

                  <div className="mb-2 flex flex-wrap gap-4 text-sm text-zinc-400">
                    <span>Limit: {centsToUsd(card.spendLimit)}</span>
                    <span>Spent MTD: {centsToUsd(card.spentMtd)}</span>
                    {card.wallet.apple && (
                      <span className="text-xs text-zinc-500">Apple Pay</span>
                    )}
                    {card.wallet.google && (
                      <span className="text-xs text-zinc-500">Google Pay</span>
                    )}
                  </div>

                  {cardError && (
                    <div className="mb-3 rounded-lg bg-red-950/40 p-2 text-sm text-red-300">
                      {cardError}
                      <button
                        type="button"
                        onClick={() => setCardErrors((prev) => ({ ...prev, [card.id]: "" }))}
                        className="ml-2 underline"
                      >
                        dismiss
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={cardStateSelects[card.id] ?? card.state}
                      onChange={(e) =>
                        setCardStateSelects((prev) => ({
                          ...prev,
                          [card.id]: e.target.value as IssuingCard["state"],
                        }))
                      }
                      className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    >
                      {CARD_STATES.map((s) => (
                        <option key={s} value={s}>
                          {CARD_STATE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => handleCardControl(card.id)}>
                      Apply
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Disputes section */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Disputes</h2>
        {disputes.length === 0 ? (
          <p className="text-sm text-zinc-500">No disputes found.</p>
        ) : (
          <ul className="space-y-3">
            {disputes.map((dispute) => {
              const disputeError = disputeErrors[dispute.id]
              return (
                <li key={dispute.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-zinc-400">{dispute.id}</span>
                    <DisputeStatusBadge status={dispute.status} />
                  </div>

                  <div className="mb-2 flex flex-wrap gap-4 text-sm text-zinc-400">
                    <span>Card: ••• {dispute.cardId}</span>
                    <span>Amount: {centsToUsd(dispute.amount)}</span>
                    <span>Reason: {dispute.reason.replace(/_/g, " ")}</span>
                    <span>Opened: {new Date(dispute.openedAt).toLocaleString()}</span>
                  </div>

                  {dispute.evidence && (
                    <div className="mb-2 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-400">
                      <span className="font-medium text-zinc-300">Evidence: </span>
                      {dispute.evidence}
                    </div>
                  )}
                  {dispute.evidenceFiles && dispute.evidenceFiles.length > 0 && (
                    <div className="mb-2 text-xs text-zinc-500">
                      Files: {dispute.evidenceFiles.join(", ")}
                    </div>
                  )}

                  {disputeError && (
                    <div className="mb-3 rounded-lg bg-red-950/40 p-2 text-sm text-red-300">
                      {disputeError}
                      <button
                        type="button"
                        onClick={() => setDisputeErrors((prev) => ({ ...prev, [dispute.id]: "" }))}
                        className="ml-2 underline"
                      >
                        dismiss
                      </button>
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    <textarea
                      rows={3}
                      placeholder="Evidence description…"
                      value={disputeEvidence[dispute.id] ?? ""}
                      onChange={(e) =>
                        setDisputeEvidence((prev) => ({ ...prev, [dispute.id]: e.target.value }))
                      }
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none"
                    />
                    <Input
                      placeholder="Evidence filenames (comma-separated, optional)"
                      value={disputeFiles[dispute.id] ?? ""}
                      onChange={(e) =>
                        setDisputeFiles((prev) => ({ ...prev, [dispute.id]: e.target.value }))
                      }
                    />
                    <Button size="sm" onClick={() => handleDisputeEvidence(dispute.id)}>
                      Submit evidence
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
