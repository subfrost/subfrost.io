import { describe, it, expect } from "vitest"
import { aggregateCommunities } from "@/lib/community/aggregate"

// Fixture mirrors the real shape: a root code owned by a leader, child codes
// owned by sub-leaders, members who claimed, and a per-address FUEL table.
const codes = [
  { id: "root", code: "KUNTENG", description: null, isActive: true, ownerTaprootAddress: "addrLeader", parentCodeId: null, redemptionCount: 1 },
  { id: "c1", code: "KUNTENG-AAAAA", description: null, isActive: true, ownerTaprootAddress: "addrSub1", parentCodeId: "root", redemptionCount: 2 },
  { id: "c2", code: "KUNTENG-BBBBB", description: null, isActive: true, ownerTaprootAddress: "addrSub2", parentCodeId: "root", redemptionCount: 0 }, // unclaimed
  // a separate community with no FUEL
  { id: "root2", code: "SOLO", description: null, isActive: true, ownerTaprootAddress: "addrSolo", parentCodeId: null, redemptionCount: 0 },
]
const redemptions = [
  { codeId: "root", code: "KUNTENG", address: "addrLeader" }, // leader redeemed own root
  { codeId: "c1", code: "KUNTENG-AAAAA", address: "addrAlice" },
  { codeId: "c1", code: "KUNTENG-AAAAA", address: "addrBob" },
]
const allocations = [
  { address: "addrAlice", amount: 100, note: "kunteng" },
  { address: "addrBob", amount: 50, note: "kunteng" },
  { address: "addrLeader", amount: 10, note: "kunteng" },
  { address: "addrInvestor", amount: 9999, note: "private investor" }, // never claimed → unattributed
]

describe("aggregateCommunities", () => {
  const agg = aggregateCommunities({ codes, redemptions, allocations })
  const kunteng = agg.communities.find((c) => c.rootCode === "KUNTENG")!

  it("groups codes into root communities and resolves the leader from the root owner", () => {
    expect(agg.communities).toHaveLength(2)
    expect(kunteng.leader).toBe("addrLeader")
    expect(kunteng.leaderCount).toBe(3) // root + 2 sub-leaders own codes
    expect(kunteng.codeCount).toBe(3)
  })

  it("counts claimed vs unclaimed codes", () => {
    expect(kunteng.claimedCodeCount).toBe(2) // root + c1
    expect(kunteng.unclaimedCodeCount).toBe(1) // c2
    expect(agg.totals.unclaimedCodeCount).toBe(2) // c2 + SOLO root
  })

  it("sums member FUEL and orders members by FUEL desc, flagging the leader", () => {
    expect(kunteng.totalFuel).toBe(160) // 100 + 50 + 10; sub-owners hold no FUEL
    // Redeemers (with FUEL) first, then the zero-FUEL sub-code owners by address.
    expect(kunteng.members.map((m) => m.address)).toEqual([
      "addrAlice",
      "addrBob",
      "addrLeader",
      "addrSub1",
      "addrSub2",
    ])
    expect(kunteng.members.find((m) => m.isLeader)?.address).toBe("addrLeader")
    expect(kunteng.members[0].note).toBe("kunteng")
  })

  it("includes code owners as members even when they never redeemed a code", () => {
    // addrSub1/addrSub2 own child codes but appear in no redemption row.
    const sub1 = kunteng.members.find((m) => m.address === "addrSub1")
    expect(sub1).toBeDefined()
    expect(sub1?.codesClaimed).toEqual([])
    expect(sub1?.fuel).toBe(0)
    // The SOLO community's owner shows up despite zero redemptions.
    const solo = agg.communities.find((c) => c.rootCode === "SOLO")!
    expect(solo.members.map((m) => m.address)).toEqual(["addrSolo"])
  })

  it("orders communities by total FUEL desc", () => {
    expect(agg.communities[0].rootCode).toBe("KUNTENG")
    expect(agg.communities[1].rootCode).toBe("SOLO")
    expect(agg.communities[1].totalFuel).toBe(0)
  })

  it("buckets FUEL on non-claiming addresses as unattributed", () => {
    expect(agg.unattributed.map((u) => u.address)).toEqual(["addrInvestor"])
    expect(agg.totals.unattributedFuel).toBe(9999)
    expect(agg.totals.attributedFuel).toBe(160)
    expect(agg.totals.totalFuelAllocated).toBe(10159)
  })

  it("excludes FUEL figures cleanly when allocations are empty (no FUEL_VIEW)", () => {
    const noFuel = aggregateCommunities({ codes, redemptions, allocations: [] })
    expect(noFuel.communities.find((c) => c.rootCode === "KUNTENG")!.totalFuel).toBe(0)
    expect(noFuel.totals.totalFuelAllocated).toBe(0)
    expect(noFuel.unattributed).toHaveLength(0)
  })
})
