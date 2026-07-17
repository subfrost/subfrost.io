"use server"

import { currentUser, type CmsUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  valuePayments,
  type CachedBlockPrice,
  type PaymentToValue,
} from "@/lib/financials/diesel-valuation"

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(FINANCIALS_PRIVILEGE)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

/** What the table sends per payment. Amounts/heights come straight from the
 *  rendered rows — the action re-prices them; it never writes to payment data. */
export interface DieselPaymentInput {
  id: string
  blockHeight: number | null
  paidAtUnix: number
  amountDiesel: number
}

/** paymentId → USD-at-payment (and the underlying per-DIESEL price). Only
 *  payments we could price appear; the client shows "—" for the rest. */
export interface PaymentUsdValue {
  paymentUsd: number
  dieselUsd: number
  btcUsd: number
}

export type ValueDieselPaymentsResult =
  | { ok: true; values: Record<string, PaymentUsdValue> }
  | { ok: false; error: "unauthorized" }

/** Value a set of DIESEL payments in USD as of the block each settled in.
 *  Reads through the DieselPriceCache table by block height and writes back any
 *  block it had to compute fresh, so repeat views are a pure DB read. Gated on
 *  FINANCIALS_PRIVILEGE. */
export async function valueDieselPaymentsAction(
  payments: DieselPaymentInput[],
): Promise<ValueDieselPaymentsResult> {
  const g = await gate()
  if (!g.ok) return g

  const heights = [...new Set(payments.map((p) => p.blockHeight).filter((h): h is number => h != null))]

  // Read-through cache.
  const cache: Record<number, CachedBlockPrice> = {}
  if (heights.length > 0) {
    const cached = await prisma.dieselPriceCache.findMany({ where: { blockHeight: { in: heights } } })
    for (const c of cached) cache[c.blockHeight] = { dieselUsd: c.dieselUsd, btcUsd: c.btcUsd, ratio: c.ratio }
  }

  const toValue: PaymentToValue[] = payments.map((p) => ({
    id: p.id,
    blockHeight: p.blockHeight,
    paidAtUnix: p.paidAtUnix,
    amountDiesel: p.amountDiesel,
  }))

  const { values, computed } = await valuePayments(toValue, cache)

  // Persist freshly-computed blocks (upsert — a block price is immutable).
  const newBlocks = Object.entries(computed)
  if (newBlocks.length > 0) {
    await Promise.all(
      newBlocks.map(([blockHeight, price]) =>
        prisma.dieselPriceCache.upsert({
          where: { blockHeight: Number(blockHeight) },
          create: { blockHeight: Number(blockHeight), ...price },
          update: { ...price },
        }),
      ),
    )
  }

  const out: Record<string, PaymentUsdValue> = {}
  for (const [id, v] of Object.entries(values)) {
    out[id] = { paymentUsd: v.paymentUsd, dieselUsd: v.dieselUsd, btcUsd: v.btcUsd }
  }
  return { ok: true, values: out }
}
