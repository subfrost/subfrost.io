import { getStripeClient } from "@/lib/stripe/client"
import type { StripeIdentityVerification, IdentityVerdict } from "@/lib/stripe/shapes"

const VERDICTS: IdentityVerdict[] = ["verified", "processing", "requires_input", "canceled"]
const verdictOf = (s: string): IdentityVerdict => (VERDICTS.includes(s as IdentityVerdict) ? (s as IdentityVerdict) : "processing")

const iso = (sec: number | null | undefined) => new Date((sec ?? 0) * 1000).toISOString()
const dob = (d: { year?: number; month?: number; day?: number } | null | undefined): string | null =>
  d?.year && d?.month && d?.day
    ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
    : null

/** Normalize one raw VerificationSession into our PII-limited shape (no image files). */
function normalizeSession(vs: any): StripeIdentityVerification {
  const vo = vs.verified_outputs ?? null
  const docReport = vs.last_verification_report?.document ?? null
  return {
    id: vs.id,
    verdict: verdictOf(vs.status),
    lastError: vs.last_error ? { code: vs.last_error.code ?? "", reason: vs.last_error.reason ?? "" } : null,
    document: { type: docReport?.type ?? null, country: docReport?.issuing_country ?? null },
    extracted: {
      firstName: vo?.first_name ?? docReport?.first_name ?? null,
      lastName: vo?.last_name ?? docReport?.last_name ?? null,
      dob: dob(vo?.dob ?? docReport?.dob),
    },
    email: vs.metadata?.email ?? vo?.email ?? "",
    createdAt: iso(vs.created),
  }
}

/** Lists Stripe Identity verification sessions + their report summary. No image data. */
export async function liveIdentityVerifications(): Promise<StripeIdentityVerification[]> {
  const stripe = getStripeClient()
  const out: StripeIdentityVerification[] = []
  let startingAfter: string | undefined
  while (true) {
    const page: any = await (stripe as any).identity.verificationSessions.list({
      limit: 100,
      expand: ["data.last_verification_report"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const vs of page.data as any[]) out.push(normalizeSession(vs))
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return out
}

/** Fetches one Stripe Identity verification session (report expanded; no image data).
 *  Used by the SP-4 webhook handler. Returns null when the session can't be fetched. */
export async function liveIdentityVerification(id: string): Promise<StripeIdentityVerification | null> {
  const stripe = getStripeClient()
  const vs: any = await (stripe as any).identity.verificationSessions.retrieve(id, {
    expand: ["last_verification_report"],
  })
  if (!vs) return null
  return normalizeSession(vs)
}
