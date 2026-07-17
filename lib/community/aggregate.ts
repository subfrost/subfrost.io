/**
 * Community aggregation — the join the admin UI was missing.
 *
 * A *community* is a root invite code (no parent) and its entire subtree. Its
 * *leader* is the owner of the root code (or, if the root is just a label, the
 * address that owns the most codes in the subtree). This links the referral
 * graph (codes/owners/redemptions) to the per-address FUEL table, which have no
 * DB-level relation today.
 *
 * Its *members* are every address that either redeemed any code in the subtree
 * or owns any code in the subtree (root or sub-code) — an owner who never
 * redeemed a code themselves is still a member — and a member's FUEL is its
 * `FuelAllocation.amount`. A community's FUEL total is the sum over its distinct
 * members.
 *
 * The aggregation is a pure function over plain rows so it can be unit-tested
 * without a DB; `loadCommunityData` wires it to Prisma.
 */
import prisma from "@/lib/prisma"

export interface CodeRowInput {
  id: string
  code: string
  description: string | null
  isActive: boolean
  ownerTaprootAddress: string | null
  parentCodeId: string | null
  redemptionCount: number
}

export interface RedemptionInput {
  codeId: string
  code: string
  address: string
}

export interface AllocationInput {
  address: string
  amount: number
  note: string | null
}

export interface AggregateInput {
  codes: CodeRowInput[]
  redemptions: RedemptionInput[]
  allocations: AllocationInput[]
}

export interface CommunityCode {
  id: string
  code: string
  description: string | null
  isActive: boolean
  owner: string | null
  parentCode: string | null
  redemptionCount: number
  claimed: boolean
  /** Sum of FUEL allocated to the distinct addresses that redeemed this code. */
  fuelAllocated: number
}

export interface CommunityMember {
  address: string
  fuel: number
  isLeader: boolean
  codesClaimed: string[]
  /** The FUEL row's free-text note (lowercase community label), for reconciling
   *  the graph-derived community against the manually-set note. Null if the
   *  member has no FUEL allocation. */
  note: string | null
}

export interface Community {
  rootId: string
  rootCode: string
  description: string | null
  leader: string | null
  leaderCount: number
  totalFuel: number
  memberCount: number
  codeCount: number
  claimedCodeCount: number
  unclaimedCodeCount: number
  codes: CommunityCode[]
  members: CommunityMember[]
}

export interface UnattributedAllocation {
  address: string
  fuel: number
  note: string | null
}

export interface CommunityAggregate {
  communities: Community[]
  unattributed: UnattributedAllocation[]
  totals: {
    communityCount: number
    addressCount: number
    totalFuelAllocated: number
    attributedFuel: number
    unattributedFuel: number
    unclaimedCodeCount: number
  }
}

/** Resolve each code id to the id of its subtree root (memoized; cycle-safe). */
function rootOf(
  id: string,
  byId: Map<string, CodeRowInput>,
  memo: Map<string, string>,
): string {
  const seen = new Set<string>()
  let cur = id
  while (true) {
    const cached = memo.get(cur)
    if (cached) return cached
    const node = byId.get(cur)
    if (!node || !node.parentCodeId || !byId.has(node.parentCodeId) || seen.has(cur)) {
      // cur is a root (no parent, parent missing from set, or cycle guard)
      break
    }
    seen.add(cur)
    cur = node.parentCodeId
  }
  // cur is the resolved root; backfill the chain for everything we walked.
  for (const v of seen) memo.set(v, cur)
  memo.set(cur, cur)
  memo.set(id, cur)
  return cur
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function aggregateCommunities(input: AggregateInput): CommunityAggregate {
  const byId = new Map(input.codes.map((c) => [c.id, c]))
  const fuelByAddress = new Map(input.allocations.map((a) => [a.address, a.amount]))
  const noteByAddress = new Map(input.allocations.map((a) => [a.address, a.note]))
  const rootMemo = new Map<string, string>()

  // Group codes by their resolved root.
  const rootCodes = new Map<string, CodeRowInput[]>()
  for (const c of input.codes) {
    const r = rootOf(c.id, byId, rootMemo)
    if (!rootCodes.has(r)) rootCodes.set(r, [])
    rootCodes.get(r)!.push(c)
  }

  // members[root] -> address -> set of code strings claimed
  const membersByRoot = new Map<string, Map<string, Set<string>>>()
  const globalMembers = new Set<string>()
  // codeId -> distinct addresses that redeemed it (to sum their FUEL).
  const redeemersByCode = new Map<string, Set<string>>()
  for (const red of input.redemptions) {
    const node = byId.get(red.codeId)
    if (!node) continue
    const r = rootOf(red.codeId, byId, rootMemo)
    if (!membersByRoot.has(r)) membersByRoot.set(r, new Map())
    const m = membersByRoot.get(r)!
    if (!m.has(red.address)) m.set(red.address, new Set())
    m.get(red.address)!.add(red.code)
    globalMembers.add(red.address)
    if (!redeemersByCode.has(red.codeId)) redeemersByCode.set(red.codeId, new Set())
    redeemersByCode.get(red.codeId)!.add(red.address)
  }

  // Every code owner is also a member of that code's community — root owners
  // (leaders) and sub-code owners alike — even if they never redeemed a code.
  // Seeds an empty codes-claimed set so they appear with an accurate FUEL total.
  for (const c of input.codes) {
    if (!c.ownerTaprootAddress) continue
    const r = rootOf(c.id, byId, rootMemo)
    if (!membersByRoot.has(r)) membersByRoot.set(r, new Map())
    const m = membersByRoot.get(r)!
    if (!m.has(c.ownerTaprootAddress)) m.set(c.ownerTaprootAddress, new Set())
    globalMembers.add(c.ownerTaprootAddress)
  }

  const communities: Community[] = []
  for (const [rootId, codes] of rootCodes) {
    const root = byId.get(rootId)!
    // Leader: root owner, else the address owning the most codes in the subtree.
    const ownerCounts = new Map<string, number>()
    for (const c of codes) {
      if (c.ownerTaprootAddress) {
        ownerCounts.set(c.ownerTaprootAddress, (ownerCounts.get(c.ownerTaprootAddress) ?? 0) + 1)
      }
    }
    let leader = root.ownerTaprootAddress
    if (!leader && ownerCounts.size > 0) {
      leader = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    }

    const memberMap = membersByRoot.get(rootId) ?? new Map()
    const members: CommunityMember[] = [...memberMap.entries()]
      .map(([address, codesSet]) => ({
        address,
        fuel: fuelByAddress.get(address) ?? 0,
        isLeader: address === leader,
        codesClaimed: [...codesSet].sort(),
        note: noteByAddress.get(address) ?? null,
      }))
      .sort((a, b) => b.fuel - a.fuel || a.address.localeCompare(b.address))

    const communityCodes: CommunityCode[] = codes
      .map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        isActive: c.isActive,
        owner: c.ownerTaprootAddress,
        parentCode: c.parentCodeId ? byId.get(c.parentCodeId)?.code ?? null : null,
        redemptionCount: c.redemptionCount,
        claimed: c.redemptionCount > 0,
        fuelAllocated: round2(
          [...(redeemersByCode.get(c.id) ?? [])].reduce(
            (s, addr) => s + (fuelByAddress.get(addr) ?? 0),
            0,
          ),
        ),
      }))
      .sort((a, b) => b.redemptionCount - a.redemptionCount || a.code.localeCompare(b.code))

    const claimedCodeCount = communityCodes.filter((c) => c.claimed).length
    const totalFuel = round2(members.reduce((s, m) => s + m.fuel, 0))

    communities.push({
      rootId,
      rootCode: root.code,
      description: root.description,
      leader,
      leaderCount: ownerCounts.size,
      totalFuel,
      memberCount: members.length,
      codeCount: communityCodes.length,
      claimedCodeCount,
      unclaimedCodeCount: communityCodes.length - claimedCodeCount,
      codes: communityCodes,
      members,
    })
  }

  communities.sort((a, b) => b.totalFuel - a.totalFuel || b.memberCount - a.memberCount)

  // FUEL on addresses that never joined any community.
  const unattributed: UnattributedAllocation[] = input.allocations
    .filter((a) => !globalMembers.has(a.address))
    .map((a) => ({ address: a.address, fuel: a.amount, note: a.note }))
    .sort((a, b) => b.fuel - a.fuel || a.address.localeCompare(b.address))

  const totalFuelAllocated = round2(input.allocations.reduce((s, a) => s + a.amount, 0))
  const attributedFuel = round2(
    [...globalMembers].reduce((s, addr) => s + (fuelByAddress.get(addr) ?? 0), 0),
  )
  const unattributedFuel = round2(unattributed.reduce((s, a) => s + a.fuel, 0))

  return {
    communities,
    unattributed,
    totals: {
      communityCount: communities.length,
      addressCount: input.allocations.length,
      totalFuelAllocated,
      attributedFuel,
      unattributedFuel,
      unclaimedCodeCount: communities.reduce((s, c) => s + c.unclaimedCodeCount, 0),
    },
  }
}

// --- Projections for the lazy-loading dashboard ----------------------------

/** A community header without the (potentially large) members/codes arrays. */
export type CommunitySummary = Omit<Community, "members" | "codes">

export interface CommunityOverview {
  communities: CommunitySummary[]
  totals: CommunityAggregate["totals"]
  unattributedCount: number
}

/** Strip detail arrays for the initial page payload (63 small headers vs ~20k rows). */
export function toOverview(agg: CommunityAggregate): CommunityOverview {
  return {
    communities: agg.communities.map(({ members, codes, ...rest }) => {
      void members
      void codes
      return rest
    }),
    totals: agg.totals,
    unattributedCount: agg.unattributed.length,
  }
}

/** Load the referral graph + redemptions + FUEL and aggregate. When the caller
 *  lacks FUEL_VIEW, `includeFuel` is false and all FUEL figures resolve to 0. */
export async function loadCommunityData(includeFuel: boolean): Promise<CommunityAggregate> {
  const [codes, redemptions, allocations] = await Promise.all([
    prisma.inviteCode.findMany({
      select: {
        id: true,
        code: true,
        description: true,
        isActive: true,
        ownerTaprootAddress: true,
        parentCodeId: true,
        _count: { select: { redemptions: true } },
      },
    }),
    prisma.inviteCodeRedemption.findMany({
      select: { codeId: true, taprootAddress: true, code: { select: { code: true } } },
    }),
    includeFuel
      ? prisma.fuelAllocation.findMany({ select: { address: true, amount: true, note: true } })
      : Promise.resolve([] as { address: string; amount: number; note: string | null }[]),
  ])

  return aggregateCommunities({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      isActive: c.isActive,
      ownerTaprootAddress: c.ownerTaprootAddress,
      parentCodeId: c.parentCodeId,
      redemptionCount: c._count.redemptions,
    })),
    redemptions: redemptions.map((r) => ({
      codeId: r.codeId,
      code: r.code.code,
      address: r.taprootAddress,
    })),
    allocations,
  })
}
