"use server"

import { currentUser } from "@/lib/cms/authz"
import {
  loadCommunityData,
  toOverview,
  type CommunityOverview,
  type CommunityMember,
  type CommunityCode,
  type UnattributedAllocation,
} from "@/lib/community/aggregate"

async function canView(): Promise<{ ok: true; canSeeFuel: boolean } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  // Reachable from both the Referral and FUEL surfaces.
  if (!me.privileges.includes("referral.read") && !me.privileges.includes("fuel.read")) {
    return { ok: false, error: "Insufficient privileges" }
  }
  return { ok: true, canSeeFuel: me.privileges.includes("fuel.read") }
}

export type OverviewResult =
  | { ok: true; overview: CommunityOverview; canSeeFuel: boolean }
  | { ok: false; error: string }

/** Lightweight headers for all communities (no per-member rows). FUEL figures
 *  are included only with FUEL_VIEW. */
export async function communityOverviewAction(): Promise<OverviewResult> {
  const g = await canView()
  if (!g.ok) return g
  const agg = await loadCommunityData(g.canSeeFuel)
  return { ok: true, overview: toOverview(agg), canSeeFuel: g.canSeeFuel }
}

export type CommunityDetail = { members: CommunityMember[]; codes: CommunityCode[] }
export type DetailResult = { ok: true; detail: CommunityDetail } | { ok: false; error: string }

/** Members (ordered by FUEL desc) + provisioned codes for one community. */
export async function communityDetailAction(rootId: string): Promise<DetailResult> {
  const g = await canView()
  if (!g.ok) return g
  const agg = await loadCommunityData(g.canSeeFuel)
  const c = agg.communities.find((x) => x.rootId === rootId)
  if (!c) return { ok: false, error: "Community not found" }
  return { ok: true, detail: { members: c.members, codes: c.codes } }
}

export type UnattributedResult =
  | { ok: true; rows: UnattributedAllocation[] }
  | { ok: false; error: string }

/** Addresses that hold FUEL but never redeemed a code in any community. */
export async function unattributedFuelAction(): Promise<UnattributedResult> {
  const g = await canView()
  if (!g.ok) return g
  if (!g.canSeeFuel) return { ok: true, rows: [] }
  const agg = await loadCommunityData(true)
  return { ok: true, rows: agg.unattributed }
}
