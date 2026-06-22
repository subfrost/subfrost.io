import prisma from "@/lib/prisma"
import { isLive } from "@/lib/stripe/config"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"
import { mapIdentityVerification, type MappedIdentityIntake } from "@/lib/kyc/identity-map"
import type { Prisma } from "@prisma/client"

export interface SyncResult {
  created: number
  updated: number
  skipped: number
}

/** Upserts a single mapped Identity verification as a KycIntake (idempotent by
 *  externalId). Never overwrites a row that already carries a human disposition. */
export async function upsertIdentityIntake(m: MappedIdentityIntake): Promise<"created" | "updated"> {
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
    return "created"
  }
  if (existing.dispositions.length > 0) {
    await prisma.kycIntake.update({
      where: { id: existing.id },
      data: { providerData, customerName: m.customerName, customerEmail: m.customerEmail },
    })
    return "updated"
  }
  await prisma.kycIntake.update({
    where: { id: existing.id },
    data: { providerData, customerName: m.customerName, customerEmail: m.customerEmail, status: m.status, riskScore: m.riskScore },
  })
  return "updated"
}

/** Pulls all Stripe Identity verifications and upserts them. Degrades to zeros if
 *  Identity is unavailable or the key is unset. */
export async function syncStripeIdentity(): Promise<SyncResult> {
  if (!isLive()) return { created: 0, updated: 0, skipped: 0 }
  const verifications = await degradeIfUnavailable(liveIdentityVerifications, [])
  let created = 0
  let updated = 0
  for (const v of verifications) {
    const r = await upsertIdentityIntake(mapIdentityVerification(v))
    if (r === "created") created++
    else updated++
  }
  return { created, updated, skipped: 0 }
}
