import { z } from "zod"

export const MTL_STATUSES = [
  "AGENT_OF_STRIPE", "REGISTERED", "FILED_PENDING", "EXEMPT", "NOT_YET_NEEDED", "NEEDS_FILING",
] as const
export type MtlStatusValue = (typeof MTL_STATUSES)[number]

export const MTL_STATUS_LABELS: Record<MtlStatusValue, string> = {
  AGENT_OF_STRIPE: "Agent of Stripe",
  REGISTERED: "Registered",
  FILED_PENDING: "Filed — pending",
  EXEMPT: "Exempt",
  NOT_YET_NEEDED: "Not yet needed",
  NEEDS_FILING: "Needs filing",
}

// Ported verbatim from subfrost-admin lib/mtl.ts STATE_NAMES (50 states + DC).
export const STATE_SEED: { state: string; name: string }[] = [
  { state: "AL", name: "Alabama" },
  { state: "AK", name: "Alaska" },
  { state: "AZ", name: "Arizona" },
  { state: "AR", name: "Arkansas" },
  { state: "CA", name: "California" },
  { state: "CO", name: "Colorado" },
  { state: "CT", name: "Connecticut" },
  { state: "DC", name: "District of Columbia" },
  { state: "DE", name: "Delaware" },
  { state: "FL", name: "Florida" },
  { state: "GA", name: "Georgia" },
  { state: "HI", name: "Hawaii" },
  { state: "ID", name: "Idaho" },
  { state: "IL", name: "Illinois" },
  { state: "IN", name: "Indiana" },
  { state: "IA", name: "Iowa" },
  { state: "KS", name: "Kansas" },
  { state: "KY", name: "Kentucky" },
  { state: "LA", name: "Louisiana" },
  { state: "ME", name: "Maine" },
  { state: "MD", name: "Maryland" },
  { state: "MA", name: "Massachusetts" },
  { state: "MI", name: "Michigan" },
  { state: "MN", name: "Minnesota" },
  { state: "MS", name: "Mississippi" },
  { state: "MO", name: "Missouri" },
  { state: "MT", name: "Montana" },
  { state: "NE", name: "Nebraska" },
  { state: "NV", name: "Nevada" },
  { state: "NH", name: "New Hampshire" },
  { state: "NJ", name: "New Jersey" },
  { state: "NM", name: "New Mexico" },
  { state: "NY", name: "New York" },
  { state: "NC", name: "North Carolina" },
  { state: "ND", name: "North Dakota" },
  { state: "OH", name: "Ohio" },
  { state: "OK", name: "Oklahoma" },
  { state: "OR", name: "Oregon" },
  { state: "PA", name: "Pennsylvania" },
  { state: "RI", name: "Rhode Island" },
  { state: "SC", name: "South Carolina" },
  { state: "SD", name: "South Dakota" },
  { state: "TN", name: "Tennessee" },
  { state: "TX", name: "Texas" },
  { state: "UT", name: "Utah" },
  { state: "VT", name: "Vermont" },
  { state: "VA", name: "Virginia" },
  { state: "WA", name: "Washington" },
  { state: "WV", name: "West Virginia" },
  { state: "WI", name: "Wisconsin" },
  { state: "WY", name: "Wyoming" },
]

export const MtlUpsertSchema = z.object({
  status: z.enum(MTL_STATUSES),
  nextFilingDue: z.string().optional(),
  portalUrl: z.string().url().optional(),
  notes: z.string().optional(),
})
export type MtlUpsertInput = z.infer<typeof MtlUpsertSchema>
