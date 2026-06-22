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

// --- Money-ops: treasury + issuing (D3) ---
export const TRANSFER_DIRECTIONS = ["in", "out"] as const
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number]

export const CARD_STATES = ["active", "paused", "canceled"] as const
export type CardStateValue = (typeof CARD_STATES)[number]
export const CARD_STATE_LABELS: Record<CardStateValue, string> = {
  active: "Active",
  paused: "Paused",
  canceled: "Canceled",
}

export const MONEY_INTENT_STATUSES = ["QUEUED", "CONFIRMED", "CANCELED"] as const
export type MoneyIntentStatusValue = (typeof MONEY_INTENT_STATUSES)[number]
export const MONEY_INTENT_STATUS_LABELS: Record<MoneyIntentStatusValue, string> = {
  QUEUED: "Queued",
  CONFIRMED: "Confirmed",
  CANCELED: "Canceled",
}

export const QueueTransferSchema = z.object({
  direction: z.enum(TRANSFER_DIRECTIONS),
  amount: z.number().int().positive(), // cents
  counterparty: z.string().min(1),
  memo: z.string().optional(),
})
export type QueueTransferInput = z.infer<typeof QueueTransferSchema>

export const CardControlSchema = z.object({
  state: z.enum(CARD_STATES),
})
export type CardControlInput = z.infer<typeof CardControlSchema>

export const DisputeEvidenceSchema = z.object({
  evidence: z.string().min(1),
  evidenceFiles: z.array(z.string()).optional(),
})
export type DisputeEvidenceInput = z.infer<typeof DisputeEvidenceSchema>

// --- Customers / billing portal (D4) ---
export type CustomerSummary = {
  id: string; email: string; name: string
  activeSubscriptions: number; lifetimeValue: number // cents
  createdAt: string
}
export type CustomerSubscriptionRef = {
  id: string; tier: string; status: string; renewsAt: string | null
}
export type CustomerInvoice = {
  id: string; number: string; amountDue: number // cents
  status: "draft" | "open" | "paid" | "void" | "uncollectible"; createdAt: string
}
export type CustomerPaymentMethod = {
  id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean
}
export type CustomerCharge = {
  id: string; amount: number // cents
  status: "succeeded" | "pending" | "failed" | "refunded"
  description: string | null; createdAt: string
}
export type CustomerDetail = {
  id: string; email: string; name: string
  subscriptions: CustomerSubscriptionRef[]
  invoices: CustomerInvoice[]
  paymentMethods: CustomerPaymentMethod[]
  recentCharges: CustomerCharge[]
}

export const RefundSchema = z.object({
  reference: z.string().min(1), // chargeId or invoiceId
  amount: z.number().int().positive(), // cents
  reason: z.string().optional(),
})
export type RefundInput = z.infer<typeof RefundSchema>

// --- Stripe Identity (SP-2: KYC source) ---
export const IDENTITY_VERDICTS = ["verified", "processing", "requires_input", "canceled"] as const
export type IdentityVerdict = (typeof IDENTITY_VERDICTS)[number]

export type IdentityProviderData = {
  verdict: IdentityVerdict
  lastError: { code: string; reason: string } | null
  document: { type: string | null; country: string | null }
  extracted: { firstName: string | null; lastName: string | null; dob: string | null }
}

export type StripeIdentityVerification = {
  id: string
  verdict: IdentityVerdict
  lastError: { code: string; reason: string } | null
  document: { type: string | null; country: string | null }
  extracted: { firstName: string | null; lastName: string | null; dob: string | null }
  email: string
  createdAt: string // ISO
}

// --- On-ramp (Stripe Crypto On-ramp; read-only observability, SP-3) ---
export type OnrampStatus =
  | "initialized" | "requires_payment" | "fulfillment_processing"
  | "fulfillment_complete" | "rejected" | "expired"

export type OnrampPeriod = "7d" | "30d" | "all"

export const ONRAMP_STATUSES: OnrampStatus[] = [
  "initialized", "requires_payment", "fulfillment_processing",
  "fulfillment_complete", "rejected", "expired",
]

export type OnrampSession = {
  id: string
  status: OnrampStatus
  createdAt: string            // ISO 8601
  sourceCurrency: string       // fiat, e.g. "USD"
  sourceAmount: number         // fiat in CENTS
  destCurrency: string         // crypto, e.g. "BTC"
  destAmount: number | null    // crypto decimal units (e.g. 0.0021), null until known
  destNetwork: string          // e.g. "bitcoin"
  walletAddress: string
  transactionFee: number | null // Stripe fee in CENTS
  networkFee: number | null     // network fee in CENTS
  rejectionReason: string | null
}

export type OnrampMetrics = {
  total: number
  byStatus: Record<OnrampStatus, number>
  completed: number
  conversionRate: number                       // completed / total (0 when total 0)
  fiatVolume: number                           // cents, completed only
  cryptoVolumeByAsset: Record<string, number>  // decimal units by destCurrency, completed only
  totalFees: number                            // cents, completed only
}
