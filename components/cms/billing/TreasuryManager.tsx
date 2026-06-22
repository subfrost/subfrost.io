"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  listBalancesAction,
  listTransactionsAction,
  listMoneyIntentsAction,
  queueAchTransferAction,
  confirmIntentAction,
  cancelIntentAction,
} from "@/actions/cms/billing"
import { centsToDisplay } from "@/lib/stripe/format"
import { TRANSFER_DIRECTIONS } from "@/lib/stripe/shapes"
import { MoneyIntentQueue } from "@/components/cms/billing/MoneyIntentQueue"
import type { MoneyIntentRow } from "@/lib/stripe/money"
import type { TreasuryBalance, TreasuryTransaction } from "@/lib/stripe/shapes"
import { SkeletonStats, SkeletonList } from "@/components/cms/Skeleton"


export function TreasuryManager({ canEdit }: { canEdit: boolean }) {
  const [balances, setBalances] = useState<TreasuryBalance[]>([])
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([])
  const [intents, setIntents] = useState<MoneyIntentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)

  // Queue ACH form state
  const [direction, setDirection] = useState<string>(TRANSFER_DIRECTIONS[0])
  const [amount, setAmount] = useState("")
  const [counterparty, setCounterparty] = useState("")
  const [memo, setMemo] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)

  const [pending, startTransition] = useTransition()

  const fetchIntents = useCallback(async () => {
    const res = await listMoneyIntentsAction()
    if (res.ok) {
      setIntents(res.intents)
    } else {
      setBanner(res.error)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [bRes, tRes, iRes] = await Promise.all([
      listBalancesAction(),
      listTransactionsAction(),
      listMoneyIntentsAction(),
    ])

    let hasError = false
    if (bRes.ok) {
      setBalances(bRes.balances)
    } else {
      setBanner(bRes.error)
      hasError = true
    }
    if (tRes.ok) {
      setTransactions(tRes.transactions)
    } else if (!hasError) {
      setBanner(tRes.error)
      hasError = true
    }
    if (iRes.ok) {
      setIntents(iRes.intents)
    } else if (!hasError) {
      setBanner(iRes.error)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleQueue = () =>
    startTransition(async () => {
      setFormError(null)
      setQueueError(null)
      if (!counterparty.trim()) {
        setFormError("Counterparty is required.")
        return
      }
      const numAmount = Number(amount)
      if (!amount || isNaN(numAmount) || numAmount <= 0 || !Number.isInteger(numAmount)) {
        setFormError("Amount must be a positive integer (cents).")
        return
      }
      const res = await queueAchTransferAction({
        direction,
        amount: numAmount,
        counterparty: counterparty.trim(),
        memo: memo.trim() || undefined,
      })
      if (res.ok) {
        setAmount("")
        setCounterparty("")
        setMemo("")
        setDirection(TRANSFER_DIRECTIONS[0])
        await fetchIntents()
      } else {
        setFormError(res.error)
      }
    })

  const handleConfirm = (id: string) =>
    startTransition(async () => {
      setQueueError(null)
      const res = await confirmIntentAction(id)
      if (res.ok) {
        await fetchIntents()
      } else {
        setQueueError(res.error)
      }
    })

  const handleCancel = (id: string) =>
    startTransition(async () => {
      setQueueError(null)
      const res = await cancelIntentAction(id)
      if (res.ok) {
        await fetchIntents()
      } else {
        setQueueError(res.error)
      }
    })

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonStats count={3} className="sm:grid-cols-3" />
        <SkeletonList rows={3} height="h-24" />
      </div>
    )
  }

  const totalAvailable = balances.reduce((s, b) => s + b.available, 0)
  const totalPending = balances.reduce((s, b) => s + b.pending, 0)

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

      {/* Summary */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SummaryCard label="Total available" value={centsToDisplay(totalAvailable)} accent />
          <SummaryCard label="Pending" value={centsToDisplay(totalPending)} />
          <SummaryCard label="Accounts" value={String(balances.length)} />
        </div>
      )}

      {/* Balances */}
      <section>
        <SectionTitle>Balances</SectionTitle>
        {balances.length === 0 ? (
          <EmptyState>No treasury balances yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => (
              <div key={b.accountId} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-white">{b.nickname}</span>
                  <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">{b.currency}</span>
                </div>
                <div className="text-2xl font-semibold tabular-nums text-white">{centsToDisplay(b.available)}</div>
                <div className="mt-1 text-xs text-zinc-500">{centsToDisplay(b.pending)} pending</div>
                <div className="mt-3 truncate font-mono text-[10px] text-zinc-600" title={b.accountId}>{b.accountId}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transactions */}
      <section>
        <SectionTitle>Transactions</SectionTitle>
        {transactions.length === 0 ? (
          <EmptyState>No transactions yet.</EmptyState>
        ) : (
          <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {transactions.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 sm:p-4">
                <span className="font-semibold tabular-nums text-white">{centsToDisplay(t.amount)}</span>
                <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{t.type}</span>
                <TxStatusBadge status={t.status} />
                <span className="ml-auto shrink-0 text-xs text-zinc-500">{new Date(t.at).toLocaleDateString()}</span>
                <span className="w-full min-w-0 truncate text-xs text-zinc-500 sm:w-auto sm:basis-full">
                  <span className="text-zinc-600">to </span>{t.counterparty}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Queue ACH Transfer */}
      {canEdit && (
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Queue ACH Transfer</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {formError && (
            <div className="mb-4 rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
              {formError}
              <button type="button" onClick={() => setFormError(null)} className="ml-2 underline">
                dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Direction</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {TRANSFER_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === "in" ? "In (receive)" : "Out (send)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Amount{" "}
                <span className="text-zinc-600">(cents — e.g. 10000 = $100.00)</span>
              </label>
              <Input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 10000"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">Counterparty</label>
              <Input
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Bank name or account"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Memo <span className="text-zinc-600">(optional)</span>
              </label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Internal note…"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" disabled={pending} onClick={handleQueue}>
              Queue transfer
            </Button>
          </div>
        </div>
      </section>
      )}

      {/* Money Intent Queue */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Intent Queue</h2>
        <MoneyIntentQueue
          intents={intents}
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          error={queueError}
          canEdit={canEdit}
        />
      </section>
    </div>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 truncate text-xl font-semibold tabular-nums ${accent ? "text-emerald-300" : "text-white"}`}>{value}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{children}</h2>
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 px-4 py-8 text-center text-sm text-zinc-600">
      {children}
    </div>
  )
}

function TxStatusBadge({ status }: { status: string }) {
  const cls =
    status === "posted"
      ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
      : status === "returned"
        ? "border-red-700/50 bg-red-950/40 text-red-300"
        : "border-amber-700/50 bg-amber-950/40 text-amber-300"
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status}</span>
}
