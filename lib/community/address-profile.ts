/**
 * Per-address profile: the cross-cutting view reached by clicking any address
 * in the Communities / Referral / FUEL surfaces. Joins the community aggregate
 * (membership, community totals, gross) with the editable AddressProfile note
 * and the codes this address owns.
 */
import prisma from "@/lib/prisma"
import { loadCommunityData, type CommunityAggregate } from "@/lib/community/aggregate"

export interface AddressMembership {
  rootId: string
  community: string
  memberFuel: number
  communityTotalFuel: number
  pctOfCommunity: number
  codesClaimed: string[]
}

export interface OwnedCode {
  code: string
  community: string | null
  redemptionCount: number
  isRoot: boolean
}

export interface AddressProfileData {
  address: string
  note: string | null
  fuel: number
  fuelNote: string | null
  grossFuel: number
  pctOfGross: number
  isMember: boolean
  isLeader: boolean
  memberships: AddressMembership[]
  ownedCodes: OwnedCode[]
}

// Short-lived cache so clicking several addresses in a row doesn't recompute the
// full aggregate each time (the underlying join scans ~32k redemptions).
let aggCache: { at: number; agg: CommunityAggregate } | null = null
const TTL = 30_000

async function cachedAggregate(): Promise<CommunityAggregate> {
  if (aggCache && Date.now() - aggCache.at < TTL) return aggCache.agg
  const agg = await loadCommunityData(true)
  aggCache = { at: Date.now(), agg }
  return agg
}

/** Invalidate the cache after a write that affects FUEL/notes. */
export function invalidateProfileCache() {
  aggCache = null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function getAddressProfile(address: string): Promise<AddressProfileData> {
  const addr = address.trim()
  const [agg, profileRow, fuelRow, owned] = await Promise.all([
    cachedAggregate(),
    prisma.addressProfile.findUnique({ where: { address: addr } }),
    prisma.fuelAllocation.findUnique({ where: { address: addr } }),
    prisma.inviteCode.findMany({
      where: { ownerTaprootAddress: addr },
      select: { id: true, code: true, parentCodeId: true, _count: { select: { redemptions: true } } },
    }),
  ])

  // code id → community (root code string), from the aggregate.
  const codeIdToCommunity = new Map<string, string>()
  for (const c of agg.communities) for (const cc of c.codes) codeIdToCommunity.set(cc.id, c.rootCode)

  const memberships: AddressMembership[] = []
  for (const c of agg.communities) {
    const m = c.members.find((x) => x.address === addr)
    if (!m) continue
    memberships.push({
      rootId: c.rootId,
      community: c.rootCode,
      memberFuel: m.fuel,
      communityTotalFuel: c.totalFuel,
      pctOfCommunity: c.totalFuel > 0 ? round2((m.fuel / c.totalFuel) * 100) : 0,
      codesClaimed: m.codesClaimed,
    })
  }
  memberships.sort((a, b) => b.memberFuel - a.memberFuel)

  const fuel = fuelRow?.amount ?? 0
  const grossFuel = agg.totals.totalFuelAllocated
  const ownedCodes: OwnedCode[] = owned.map((o) => ({
    code: o.code,
    community: codeIdToCommunity.get(o.id) ?? null,
    redemptionCount: o._count.redemptions,
    isRoot: o.parentCodeId === null,
  }))

  return {
    address: addr,
    note: profileRow?.note ?? null,
    fuel,
    fuelNote: fuelRow?.note ?? null,
    grossFuel,
    pctOfGross: grossFuel > 0 ? round2((fuel / grossFuel) * 100) : 0,
    isMember: memberships.length > 0,
    isLeader: ownedCodes.some((o) => o.isRoot),
    memberships,
    ownedCodes,
  }
}

export async function setAddressNote(address: string, note: string | null): Promise<void> {
  const addr = address.trim()
  const clean = note?.trim() || null
  await prisma.addressProfile.upsert({
    where: { address: addr },
    create: { address: addr, note: clean },
    update: { note: clean },
  })
}
