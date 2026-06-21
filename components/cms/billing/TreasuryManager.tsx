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


export function TreasuryManager() {
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

      {/* Balances */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Balances</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-zinc-500">No balances found.</p>
        ) : (
          <ul className="space-y-3">
            {balances.map((b) => (
              <li key={b.accountId} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{b.nickname}</span>
                  <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {b.currency}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                  <span>
                    <span className="text-zinc-600">Available: </span>
                    {centsToDisplay(b.available)}
                  </span>
                  <span>
                    <span className="text-zinc-600">Pending: </span>
                    {centsToDisplay(b.pending)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-600">{b.accountId}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Transactions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-zinc-500">No transactions found.</p>
        ) : (
          <ul className="space-y-3">
            {transactions.map((t) => (
              <li key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{centsToDisplay(t.amount)}</span>
                  <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {t.type}
                  </span>
                  <span
                    className={
                      t.status === "posted"
                        ? "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
                        : t.status === "returned"
                          ? "rounded-md border border-red-700/50 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-400"
                          : "rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-400"
                    }
                  >
                    {t.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                  <span>
                    <span className="text-zinc-600">Counterparty: </span>
                    {t.counterparty}
                  </span>
                  <span className="text-zinc-600">{new Date(t.at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Queue ACH Transfer */}
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

      {/* Money Intent Queue */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Intent Queue</h2>
        <MoneyIntentQueue
          intents={intents}
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          error={queueError}
        />
      </section>
    </div>
  )
}
