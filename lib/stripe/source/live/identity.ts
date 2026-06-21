import { getStripeClient } from "@/lib/stripe/client"
import type { StripeIdentityVerification, IdentityVerdict } from "@/lib/stripe/shapes"

const VERDICTS: IdentityVerdict[] = ["verified", "processing", "requires_input", "canceled"]
const verdictOf = (s: string): IdentityVerdict => (VERDICTS.includes(s as IdentityVerdict) ? (s as IdentityVerdict) : "processing")

const iso = (sec: number | null | undefined) => new Date((sec ?? 0) * 1000).toISOString()
const dob = (d: { year?: number; month?: number; day?: number } | null | undefined): string | null =>
  d?.year && d?.month && d?.day
    ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
    : null

/** Lists Stripe Identity verification sessions + their report summary. No file/image
 *  data is read. Server-only (uses getStripeClient). */
export async function liveIdentityVerifications(): Promise<StripeIdentityVerification[]> {
  const stripe = getStripeClient()
  const out: StripeIdentityVerification[] = []
  let startingAfter: string | undefined
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page: any = await (stripe as any).identity.verificationSessions.list({
      limit: 100,
      expand: ["data.last_verification_report"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const vs of page.data as any[]) {
      const vo = vs.verified_outputs ?? null
      const docReport = vs.last_verification_report?.document ?? null
      out.push({
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
      })
    }
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return out
}
