import prisma from "@/lib/prisma"
import { isLive } from "@/lib/stripe/config"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"
import { mapIdentityVerification } from "@/lib/kyc/identity-map"
import type { Prisma } from "@prisma/client"

export interface SyncResult {
  created: number
  updated: number
  skipped: number
}

/** Pulls Stripe Identity verifications and upserts them as KycIntake rows
 *  (idempotent by externalId). Never overwrites a row that already carries a human
 *  disposition. Degrades to zeros if Identity is unavailable or the key is unset. */
export async function syncStripeIdentity(): Promise<SyncResult> {
  if (!isLive()) return { created: 0, updated: 0, skipped: 0 }
  const verifications = await degradeIfUnavailable(liveIdentityVerifications, [])

  let created = 0
  let updated = 0
  const skipped = 0
  for (const v of verifications) {
    const m = mapIdentityVerification(v)
    const existing = await prisma.kycIntake.findUnique({
      where: { externalId: m.externalId },
      include: { dispositions: { take: 1 } },
    })
    const providerData = m.providerData as unknown as Prisma.InputJsonValue
    if (!existing) {
      await prisma.kycIntake.create({
        data: {
          externalId: m.externalId,
          customerEmail: m.customerEmail,
          customerName: m.customerName,
          provider: m.provider,
          riskScore: m.riskScore,
          status: m.status,
          submittedAt: m.submittedAt,
          providerData,
        },
      })
      created++
    } else if (existing.dispositions.length > 0) {
      // Human already decided — only refresh the synced summary, never the decision.
      await prisma.kycIntake.update({
        where: { id: existing.id },
        data: { providerData, customerName: m.customerName, customerEmail: m.customerEmail },
      })
      updated++
    } else {
      await prisma.kycIntake.update({
        where: { id: existing.id },
        data: {
          providerData,
          customerName: m.customerName,
          customerEmail: m.customerEmail,
          status: m.status,
          riskScore: m.riskScore,
        },
      })
      updated++
    }
  }
  return { created, updated, skipped }
}
