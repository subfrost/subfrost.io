/**
 * Admin-only FUEL allocation operations (growth rewards: one amount per address).
 * Reached only through `actions/cms/fuel.ts`, which gates on the `MANAGE_FUEL`
 * privilege. Ported from subfrost-app's `app/api/admin/fuel/*`. The dataset is
 * small, so listing returns everything + the total and the UI filters/sorts
 * client-side (matching the original FuelTab).
 */
import prisma from "@/lib/prisma"

/** Domain-level rejection (bad input, not found) → `{ ok: false }` envelope. */
export class FuelError extends Error {}

const MAX_ENTRIES = 500

export interface FuelRow {
  id: string
  address: string
  amount: number
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface ListFuelResult {
  allocations: FuelRow[]
  totalAllocated: number
}

export async function listAllocations(): Promise<ListFuelResult> {
  const rows = await prisma.fuelAllocation.findMany({ orderBy: { createdAt: "desc" } })
  return {
    allocations: rows.map((a) => ({
      id: a.id,
      address: a.address,
      amount: a.amount,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    totalAllocated: rows.reduce((sum, a) => sum + a.amount, 0),
  }
}

export interface FuelEntry {
  address: string
  amount: number
  note?: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Upsert one or more allocations by address (idempotent). Amounts are rounded
 *  to 2dp; all entries land in a single transaction. */
export async function upsertAllocations(entries: FuelEntry[]): Promise<{ count: number }> {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new FuelError("At least one entry is required")
  }
  if (entries.length > MAX_ENTRIES) {
    throw new FuelError(`Too many entries (max ${MAX_ENTRIES})`)
  }

  const validated = entries.map((e) => {
    const address = e.address?.trim()
    if (!address) throw new FuelError("Each entry must have an address")
    const amount = round2(Number(e.amount))
    if (!Number.isFinite(amount) || amount < 0) {
      throw new FuelError(`Invalid amount for ${address}`)
    }
    return { address, amount, note: e.note?.trim() || null }
  })

  const results = await prisma.$transaction(
    validated.map((v) =>
      prisma.fuelAllocation.upsert({
        where: { address: v.address },
        create: { address: v.address, amount: v.amount, note: v.note },
        update: { amount: v.amount, note: v.note },
      }),
    ),
  )
  return { count: results.length }
}

export async function deleteAllocation(id: string): Promise<{ address: string }> {
  const allocation = await prisma.fuelAllocation.findUnique({ where: { id } })
  if (!allocation) throw new FuelError("Allocation not found")
  await prisma.fuelAllocation.delete({ where: { id } })
  return { address: allocation.address }
}
