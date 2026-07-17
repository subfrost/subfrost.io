"use client"

import { useEffect, useState } from "react"
import { valueDieselPaymentsAction, type PaymentUsdValue } from "@/actions/cms/financials-diesel"

interface PaymentLike {
  id: string
  blockHeight: number | null
  paidAt: string // ISO
  amountDiesel: number
}

/** Fetches DIESEL→USD-at-payment valuations once on mount for the given
 *  payments and returns a paymentId→value map. Fails silently: on error the map
 *  stays empty and the table renders "—". */
export function useDieselUsd(payments: PaymentLike[]): {
  values: Record<string, PaymentUsdValue>
  loading: boolean
} {
  const [values, setValues] = useState<Record<string, PaymentUsdValue>>({})
  const [loading, setLoading] = useState(false)

  // Re-run when the set of payment ids changes.
  const key = payments.map((p) => p.id).join(",")

  useEffect(() => {
    if (payments.length === 0) return
    let cancelled = false
    setLoading(true)
    valueDieselPaymentsAction(
      payments.map((p) => ({
        id: p.id,
        blockHeight: p.blockHeight,
        paidAtUnix: Math.floor(new Date(p.paidAt).getTime() / 1000),
        amountDiesel: p.amountDiesel,
      })),
    )
      .then((r) => {
        if (cancelled) return
        if (r.ok) setValues(r.values)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { values, loading }
}

/** Sum the USD-at-payment valuations of an invoice's settling DIESEL payments.
 *  Returns null when none of them are priced yet (caller renders "—"). Used to
 *  show a DIESEL-settled invoice's USD value (~$N) instead of its $0 amountUsd. */
export function sumSettlingUsd(
  settling: { id: string }[],
  values: Record<string, PaymentUsdValue>,
): number | null {
  const priced = settling.filter((p) => values[p.id])
  if (priced.length === 0) return null
  return priced.reduce((s, p) => s + values[p.id].paymentUsd, 0)
}
