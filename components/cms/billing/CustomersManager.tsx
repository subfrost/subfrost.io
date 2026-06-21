"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  listCustomersAction,
  getCustomerAction,
  listRefundIntentsAction,
  requestRefundAction,
  confirmIntentAction,
  cancelIntentAction,
} from "@/actions/cms/billing"
import { MoneyIntentQueue } from "@/components/cms/billing/MoneyIntentQueue"
import { centsToUsd } from "@/lib/stripe/format"
import type { CustomerSummary, CustomerDetail } from "@/lib/stripe/shapes"
import type { MoneyIntentRow } from "@/lib/stripe/money"

function statusBadgeClass(status: string): string {
  if (status === "active" || status === "paid" || status === "succeeded")
    return "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
  if (
    status === "canceled" ||
    status === "failed" ||
    status === "void" ||
    status === "uncollectible" ||
    status === "refunded"
  )
    return "rounded-md border border-red-700/50 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-400"
  return "rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-400"
}

interface RefundFormState {
  amount: string
  reason: string
  error: string | null
}

interface CustomerRowProps {
  customer: CustomerSummary
  detail: CustomerDetail | null
  expanded: boolean
  loadingDetail: boolean
  onToggle: () => void
  onRefundSuccess: () => Promise<void>
}

function CustomerRow({
  customer,
  detail,
  expanded,
  loadingDetail,
  onToggle,
  onRefundSuccess,
}: CustomerRowProps) {
  const [refundForms, setRefundForms] = useState<Record<string, RefundFormState>>({})
  const [pending, startTransition] = useTransition()

  const openRefundForm = (chargeId: string, defaultAmount: number) => {
    setRefundForms((prev) => ({
      ...prev,
      [chargeId]: { amount: String(defaultAmount), reason: "", error: null },
    }))
  }

  const closeRefundForm = (chargeId: string) => {
    setRefundForms((prev) => {
      const next = { ...prev }
      delete next[chargeId]
      return next
    })
  }

  const handleRefund = (chargeId: string) =>
    startTransition(async () => {
      const form = refundForms[chargeId]
      if (!form) return
      setRefundForms((prev) => ({
        ...prev,
        [chargeId]: { ...prev[chargeId], error: null },
      }))
      const numAmount = Number(form.amount)
      if (!form.amount || isNaN(numAmount) || numAmount <= 0 || !Number.isInteger(numAmount)) {
        setRefundForms((prev) => ({
          ...prev,
          [chargeId]: { ...prev[chargeId], error: "Amount must be a positive integer (cents)." },
        }))
        return
      }
      const res = await requestRefundAction({
        reference: chargeId,
        amount: numAmount,
        reason: form.reason.trim() || undefined,
      })
      if (res.ok) {
        closeRefundForm(chargeId)
        await onRefundSuccess()
      } else {
        setRefundForms((prev) => ({
          ...prev,
          [chargeId]: { ...prev[chargeId], error: res.error },
        }))
      }
    })

  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      {/* Summary header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{customer.name || "—"}</p>
          <p className="text-sm text-zinc-400">{customer.email}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
            <span>
              <span className="text-zinc-600">Active subs: </span>
              {customer.activeSubscriptions}
            </span>
            <span>
              <span className="text-zinc-600">Lifetime: </span>
              {centsToUsd(customer.lifetimeValue)}
            </span>
            <span>
              <span className="text-zinc-600">Since: </span>
              {new Date(customer.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onToggle} disabled={loadingDetail}>
          {expanded ? "Collapse" : "View detail"}
        </Button>
      </div>

      {/* Detail section */}
      {expanded && (
        <div className="mt-4 space-y-5 border-t border-zinc-800 pt-4">
          {loadingDetail ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : detail ? (
            <>
              {/* Subscriptions */}
              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-300">Subscriptions</h4>
                {detail.subscriptions.length === 0 ? (
                  <p className="text-xs text-zinc-500">No subscriptions.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.subscriptions.map((sub) => (
                      <li
                        key={sub.id}
                        className="flex flex-wrap items-center gap-2 text-sm text-zinc-400"
                      >
                        <span className="font-medium text-white">{sub.tier}</span>
                        <span className={statusBadgeClass(sub.status)}>{sub.status}</span>
                        <span className="text-zinc-600">
                          Renews: {sub.renewsAt ? new Date(sub.renewsAt).toLocaleDateString() : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Invoices */}
              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-300">Invoices</h4>
                {detail.invoices.length === 0 ? (
                  <p className="text-xs text-zinc-500">No invoices.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.invoices.map((inv) => (
                      <li
                        key={inv.id}
                        className="flex flex-wrap items-center gap-3 text-sm text-zinc-400"
                      >
                        <span className="font-mono text-xs text-zinc-500">{inv.number}</span>
                        <span className="font-medium text-white">{centsToUsd(inv.amountDue)}</span>
                        <span className={statusBadgeClass(inv.status)}>{inv.status}</span>
                        <span className="text-zinc-600">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Payment methods */}
              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-300">Payment Methods</h4>
                {detail.paymentMethods.length === 0 ? (
                  <p className="text-xs text-zinc-500">No payment methods.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.paymentMethods.map((pm) => (
                      <li
                        key={pm.id}
                        className="flex flex-wrap items-center gap-2 text-sm text-zinc-400"
                      >
                        <span className="font-medium capitalize text-white">{pm.brand}</span>
                        <span>•••• {pm.last4}</span>
                        <span className="text-zinc-600">
                          Exp {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
                        </span>
                        {pm.isDefault && (
                          <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                            default
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recent charges */}
              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-300">Recent Charges</h4>
                {detail.recentCharges.length === 0 ? (
                  <p className="text-xs text-zinc-500">No recent charges.</p>
                ) : (
                  <ul className="space-y-3">
                    {detail.recentCharges.map((charge) => (
                      <li key={charge.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="font-medium text-white">{centsToUsd(charge.amount)}</span>
                          <span className={statusBadgeClass(charge.status)}>{charge.status}</span>
                          {charge.description && (
                            <span className="text-zinc-400">{charge.description}</span>
                          )}
                          <span className="text-zinc-600">
                            {new Date(charge.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {charge.status === "succeeded" && !refundForms[charge.id] && (
                          <div className="mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRefundForm(charge.id, charge.amount)}
                            >
                              Refund
                            </Button>
                          </div>
                        )}

                        {refundForms[charge.id] && (
                          <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                            {refundForms[charge.id].error && (
                              <div className="rounded-lg bg-red-950/40 p-2 text-xs text-red-300">
                                {refundForms[charge.id].error}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <div className="min-w-0 flex-1">
                                <label className="mb-1 block text-xs text-zinc-500">
                                  Amount{" "}
                                  <span className="text-zinc-600">(cents)</span>
                                </label>
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={refundForms[charge.id].amount}
                                  onChange={(e) =>
                                    setRefundForms((prev) => ({
                                      ...prev,
                                      [charge.id]: { ...prev[charge.id], amount: e.target.value },
                                    }))
                                  }
                                  className="border-zinc-700 bg-zinc-900 text-zinc-100"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <label className="mb-1 block text-xs text-zinc-500">
                                  Reason <span className="text-zinc-600">(optional)</span>
                                </label>
                                <Input
                                  value={refundForms[charge.id].reason}
                                  onChange={(e) =>
                                    setRefundForms((prev) => ({
                                      ...prev,
                                      [charge.id]: { ...prev[charge.id], reason: e.target.value },
                                    }))
                                  }
                                  placeholder="e.g. duplicate charge"
                                  className="border-zinc-700 bg-zinc-900 text-zinc-100"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={pending}
                                onClick={() => handleRefund(charge.id)}
                              >
                                Submit refund
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => closeRefundForm(charge.id)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Customer detail unavailable.</p>
          )}
        </div>
      )}
    </li>
  )
}

export function CustomersManager() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [refundIntents, setRefundIntents] = useState<MoneyIntentRow[]>([])
  const [detailCache, setDetailCache] = useState<Record<string, CustomerDetail | null>>({})
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [refundError, setRefundError] = useState<string | null>(null)

  const [pending, startTransition] = useTransition()

  const fetchRefundIntents = useCallback(async () => {
    const res = await listRefundIntentsAction()
    if (res.ok) {
      setRefundIntents(res.intents)
    } else {
      setRefundError(res.error)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [cRes, iRes] = await Promise.all([listCustomersAction(), listRefundIntentsAction()])

    let hasError = false
    if (cRes.ok) {
      setCustomers(cRes.customers)
    } else {
      setBanner(cRes.error)
      hasError = true
    }
    if (iRes.ok) {
      setRefundIntents(iRes.intents)
    } else if (!hasError) {
      setBanner(iRes.error)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleToggle = useCallback(
    async (customerId: string) => {
      const isCurrentlyExpanded = expanded[customerId]
      setExpanded((prev) => ({ ...prev, [customerId]: !isCurrentlyExpanded }))

      // Lazy-load detail on first expand
      if (!isCurrentlyExpanded && !(customerId in detailCache)) {
        setLoadingDetails((prev) => ({ ...prev, [customerId]: true }))
        const res = await getCustomerAction(customerId)
        if (res.ok) {
          setDetailCache((prev) => ({ ...prev, [customerId]: res.customer }))
        } else {
          setDetailCache((prev) => ({ ...prev, [customerId]: null }))
          setBanner(res.error)
        }
        setLoadingDetails((prev) => ({ ...prev, [customerId]: false }))
      }
    },
    [expanded, detailCache],
  )

  const handleConfirm = (id: string) =>
    startTransition(async () => {
      setRefundError(null)
      const res = await confirmIntentAction(id)
      if (res.ok) {
        await fetchRefundIntents()
      } else {
        setRefundError(res.error)
      }
    })

  const handleCancel = (id: string) =>
    startTransition(async () => {
      setRefundError(null)
      const res = await cancelIntentAction(id)
      if (res.ok) {
        await fetchRefundIntents()
      } else {
        setRefundError(res.error)
      }
    })

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
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

      {/* Customer list */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Customers</h2>
        <div className="mb-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name…"
            className="border-zinc-700 bg-zinc-900 text-zinc-100"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {search.trim() ? "No customers match your search." : "No customers found."}
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                detail={detailCache[customer.id] ?? null}
                expanded={!!expanded[customer.id]}
                loadingDetail={!!loadingDetails[customer.id]}
                onToggle={() => handleToggle(customer.id)}
                onRefundSuccess={fetchRefundIntents}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Refund queue */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Refund Queue</h2>
        <MoneyIntentQueue
          intents={refundIntents}
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          error={refundError}
        />
      </section>
    </div>
  )
}
