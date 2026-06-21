import { z } from "zod"

/** Every billing read returns data + a live flag so the UI can show a demo
 *  banner when Stripe is not connected. Reads are never persisted. */
export type SourceResult<T> = { data: T; live: boolean }

// --- Read shapes (canonical contract, ported from subkube-mock.ts) ---
export type TreasuryBalance = {
  accountId: string; nickname: string; available: number; pending: number; currency: "USD"
}
export type TreasuryTxnType =
  | "ach_credit" | "ach_debit" | "wire_in" | "wire_out" | "fee" | "card_settlement"
export type TreasuryTransaction = {
  id: string; type: TreasuryTxnType; amount: number; counterparty: string
  status: "pending" | "posted" | "returned"; at: string
}
export type IssuingCard = {
  id: string; last4: string; cardholder: string; type: "virtual" | "physical"
  state: "active" | "paused" | "canceled"; wallet: { apple: boolean; google: boolean }
  spendLimit: number; spentMtd: number
}
export type IssuingDispute = {
  id: string; cardId: string; amount: number
  reason: "fraudulent" | "duplicate" | "service_not_received" | "other"
  status: "submitted" | "won" | "lost"; openedAt: string
  evidence?: string; evidenceFiles?: string[]
}
export type OfframpSettlement = {
  id: string; userId: string; cryptoAsset: "BTC" | "USDC" | "ETH"
  cryptoAmount: number; fiatAmount: number; feeAmount: number
  status: "pending" | "settled"; at: string
}

// --- Application tracker (pure Postgres) ---
export const STRIPE_APPLICATION_PRODUCTS = ["treasury", "issuing", "offramp"] as const
export type StripeApplicationProduct = (typeof STRIPE_APPLICATION_PRODUCTS)[number]

export const STRIPE_APPLICATION_STATUSES = [
  "NOT_STARTED", "SUBMITTED", "PENDING", "APPROVED", "REJECTED",
] as const
export type StripeApplicationStatusValue = (typeof STRIPE_APPLICATION_STATUSES)[number]

export const STRIPE_APPLICATION_STATUS_LABELS: Record<StripeApplicationStatusValue, string> = {
  NOT_STARTED: "Not started",
  SUBMITTED: "Submitted",
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
}

export const ApplicationUpsertSchema = z.object({
  status: z.enum(STRIPE_APPLICATION_STATUSES),
  notes: z.string().optional(),
})
export type ApplicationUpsertInput = z.infer<typeof ApplicationUpsertSchema>

// --- Revenue: subscriptions + promo (D2) ---
export type SubscriptionTier = {
  id: string; name: string; priceMonthly: number; priceYearly: number
  features: string[]; activeSubs: number
}
export type SubscriberStatus = "active" | "trialing" | "past_due" | "canceled"
export type Subscriber = {
  id: string; customerEmail: string; tier: string
  status: SubscriberStatus; startedAt: string; renewsAt: string | null
}
export type PromoCode = {
  code: string; type: "PERCENT" | "AMOUNT"; value: number
  redemptions: number; maxRedemptions: number | null
  expiresAt: string | null; active: boolean
}

export const PROMO_TYPES = ["PERCENT", "AMOUNT"] as const
export type PromoTypeValue = (typeof PROMO_TYPES)[number]
export const PROMO_TYPE_LABELS: Record<PromoTypeValue, string> = {
  PERCENT: "Percent off (%)",
  AMOUNT: "Amount off (cents)",
}

export const SUBSCRIPTION_ACTIONS = ["cancel", "resume"] as const
export type SubscriptionActionValue = (typeof SUBSCRIPTION_ACTIONS)[number]
export const SUBSCRIPTION_ACTION_LABELS: Record<SubscriptionActionValue, string> = {
  cancel: "Cancel",
  resume: "Resume",
}

export const CreatePromoSchema = z.object({
  code: z.string().min(1).max(64),
  type: z.enum(PROMO_TYPES),
  value: z.number().int().positive(),
  maxRedemptions: z.number().int().positive().optional(),
  expiresAt: z.string().optional(), // ISO date string
})
export type CreatePromoInput = z.infer<typeof CreatePromoSchema>

export const SubscriptionActionSchema = z.object({
  action: z.enum(SUBSCRIPTION_ACTIONS),
  note: z.string().optional(),
})
export type SubscriptionActionInput = z.infer<typeof SubscriptionActionSchema>
