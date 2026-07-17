// Client-safe types + scope policy for delegated reviewer links. No prisma /
// bcrypt / node imports here so client components (ReviewsManager) can import
// the constants. The Prisma-backed store + bcrypt transport live in
// lib/compliance/reviews.ts.

export const REVIEW_COOKIE = "__sub_review"

export type ReviewScope = "compliance-full" | "fincen-only" | "kyc-only"
export const REVIEW_SCOPES: ReviewScope[] = ["compliance-full", "fincen-only", "kyc-only"]
export const SCOPE_LABELS: Record<ReviewScope, string> = {
  "compliance-full": "Full compliance (program, obligations, FinCEN, KYC, MTL, documents)",
  "fincen-only": "FinCEN filings only",
  "kyc-only": "KYC queue only",
}

export interface ReviewLinkRow {
  id: string
  token: string
  reviewerLabel: string
  reviewerEmail: string | null
  scope: ReviewScope
  notes: string | null
  createdAt: string // ISO
  expiresAt: string // ISO
  revokedAt: string | null // ISO
  active: boolean // not revoked and not expired
  sessionCount: number
}

export interface CreatedReviewLink {
  link: ReviewLinkRow
  password: string // shown ONCE at creation
  path: string // /compliance/review/<token>
}

export interface ReviewSessionContext {
  sessionId: string
  reviewLinkId: string
  reviewerLabel: string
  scope: ReviewScope
  token: string
}

export interface ScopeSurface {
  key: "program" | "obligations" | "fincen" | "kyc" | "mtl" | "documents"
  label: string
}

const ALL_SURFACES: ScopeSurface[] = [
  { key: "program", label: "AML/BSA program status" },
  { key: "obligations", label: "Obligation calendar" },
  { key: "fincen", label: "FinCEN filings" },
  { key: "kyc", label: "KYC queue" },
  { key: "mtl", label: "MTL licensing" },
  { key: "documents", label: "Documents" },
]

/** Which read-only surfaces a scope exposes to the reviewer. */
export function scopeSurfaces(scope: ReviewScope): ScopeSurface[] {
  switch (scope) {
    case "compliance-full":
      return ALL_SURFACES
    case "fincen-only":
      return ALL_SURFACES.filter((s) => s.key === "fincen")
    case "kyc-only":
      return ALL_SURFACES.filter((s) => s.key === "kyc")
  }
}

export function scopeAllows(scope: ReviewScope, surface: ScopeSurface["key"]): boolean {
  return scopeSurfaces(scope).some((s) => s.key === surface)
}
