"use client"

import { useMemo, useState, useTransition } from "react"
import { ChevronRight, Crown, Copy, Flame } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AddressAvatar } from "@/components/cms/AddressAvatar"
import { AddressChip } from "@/components/cms/address-profile/AddressProfilePanel"
import { SkeletonText, SkeletonList } from "@/components/cms/Skeleton"
import {
  communityDetailAction,
  unattributedFuelAction,
  type CommunityDetail,
} from "@/actions/cms/communities"
import type {
  CommunityOverview,
  CommunitySummary,
  CommunityMember,
  CommunityCode,
  UnattributedAllocation,
} from "@/lib/community/aggregate"

const MEMBERS_PAGE = 100

function truncAddr(a: string): string {
  return a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a
}
function fmtFuel(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
function noteMismatch(community: string, note: string | null): boolean {
  if (!note) return false
  return note.toLowerCase().replace(/\d+$/, "") !== community.toLowerCase().replace(/\d+$/, "")
}
function Copyable({ value }: { value: string }) {
  return (
    <button title="Copy" onClick={() => navigator.clipboard?.writeText(value)}
      className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-200">
      {truncAddr(value)} <Copy size={11} className="opacity-50" />
    </button>
  )
}

export function CommunitiesManager({
  overview,
  canSeeFuel,
}: {
  overview: CommunityOverview
  canSeeFuel: boolean
}) {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, CommunityDetail>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const maxFuel = Math.max(1, ...overview.communities.map((c) => c.totalFuel))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return overview.communities
    return overview.communities.filter(
      (c) => c.rootCode.toLowerCase().includes(q) || (c.leader ?? "").toLowerCase().includes(q),
    )
  }, [overview.communities, search])

  function toggle(c: CommunitySummary) {
    if (expanded === c.rootId) { setExpanded(null); return }
    setExpanded(c.rootId)
    if (!details[c.rootId]) {
      setLoadingId(c.rootId)
      startTransition(async () => {
        const res = await communityDetailAction(c.rootId)
        if (res.ok) setDetails((d) => ({ ...d, [c.rootId]: res.detail }))
        setLoadingId(null)
      })
    }
  }

  const t = overview.totals
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Communities" value={t.communityCount.toString()} />
        {canSeeFuel && <Stat label="Total FUEL" value={fmtFuel(t.totalFuelAllocated)} accent />}
        {canSeeFuel && <Stat label="Unattributed FUEL" value={`${fmtFuel(t.unattributedFuel)} · ${overview.unattributedCount} addr`} />}
        <Stat label="Unclaimed codes" value={t.unclaimedCodeCount.toString()} />
      </div>

      <Input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by community or leader address…"
        className="max-w-md bg-zinc-900 text-zinc-100 border-zinc-700" />

      <div className="space-y-2">
        {filtered.map((c) => (
          <div key={c.rootId} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
            <button onClick={() => toggle(c)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-zinc-900/60">
              <ChevronRight size={16} className={`shrink-0 text-zinc-500 transition-transform ${expanded === c.rootId ? "rotate-90" : ""}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{c.rootCode}</span>
                  {c.leaderCount > 1 && <span className="shrink-0 text-[10px] text-zinc-500">{c.leaderCount} sub-leaders</span>}
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
                  {c.leader && <AddressAvatar address={c.leader} size={16} />}
                  <Crown size={11} className="shrink-0 text-amber-400/70" />
                  {c.leader ? <span className="truncate font-mono">{truncAddr(c.leader)}</span> : <span className="italic">no leader set</span>}
                </div>
              </div>
              {canSeeFuel && (
                <div className="hidden w-40 sm:block">
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-sky-500/70" style={{ width: `${(c.totalFuel / maxFuel) * 100}%` }} />
                  </div>
                </div>
              )}
              {/* On mobile this wraps to its own full-width line below the name/leader. */}
              <div className="flex w-full items-center justify-between sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:justify-normal">
                {canSeeFuel && (
                  <div className="flex items-center gap-1 font-semibold text-sky-300">
                    <Flame size={13} className="text-orange-400/80" />{fmtFuel(c.totalFuel)}
                  </div>
                )}
                <div className="text-xs text-zinc-500">
                  {c.memberCount} members · {c.claimedCodeCount}/{c.codeCount} claimed
                  {c.unclaimedCodeCount > 0 && <span className="ml-1 text-amber-400/80">· {c.unclaimedCodeCount} unclaimed</span>}
                </div>
              </div>
            </button>

            {expanded === c.rootId && (
              <div className="border-t border-zinc-800 px-4 py-4">
                {loadingId === c.rootId && !details[c.rootId]
                  ? <SkeletonText lines={6} className="py-2" />
                  : details[c.rootId]
                    ? <CommunityBody detail={details[c.rootId]} community={c.rootCode} canSeeFuel={canSeeFuel} />
                    : null}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-zinc-600">No communities match.</div>}
      </div>

      {canSeeFuel && overview.unattributedCount > 0 && <UnattributedSection count={overview.unattributedCount} fuel={t.unattributedFuel} />}
    </div>
  )
}

function CommunityBody({ detail, community, canSeeFuel }: { detail: CommunityDetail; community: string; canSeeFuel: boolean }) {
  const [tab, setTab] = useState<"members" | "codes">("members")
  const [limit, setLimit] = useState(MEMBERS_PAGE)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <TabBtn active={tab === "members"} onClick={() => setTab("members")}>Members ({detail.members.length})</TabBtn>
        <TabBtn active={tab === "codes"} onClick={() => setTab("codes")}>Codes ({detail.codes.length})</TabBtn>
      </div>

      {tab === "members" ? (
        <>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="py-1.5">Address</th>{canSeeFuel && <th className="py-1.5 text-right">FUEL</th>}<th className="py-1.5">Codes claimed</th><th className="py-1.5">Note</th></tr>
            </thead>
            <tbody>
              {detail.members.slice(0, limit).map((m: CommunityMember) => (
                <tr key={m.address} className="border-t border-zinc-800/60">
                  <td className="py-1.5">
                    <AddressChip address={m.address} showLeader={m.isLeader} />
                  </td>
                  {canSeeFuel && <td className="py-1.5 text-right font-medium text-sky-300">{fmtFuel(m.fuel)}</td>}
                  <td className="py-1.5 font-mono text-xs text-zinc-400">{m.codesClaimed.join(", ")}</td>
                  <td className="py-1.5 text-xs">
                    {m.note
                      ? <span className={noteMismatch(community, m.note) ? "text-amber-400" : "text-zinc-500"}>{m.note}{noteMismatch(community, m.note) && " ⚠"}</span>
                      : <span className="text-zinc-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.members.length > limit && (
            <button onClick={() => setLimit((l) => l + MEMBERS_PAGE)} className="text-xs text-sky-400 hover:text-sky-300">
              Show more ({limit} of {detail.members.length})
            </button>
          )}
        </>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="py-1.5">Code</th><th className="py-1.5">Owner</th><th className="py-1.5 text-right">Claims</th><th className="py-1.5">Status</th></tr>
          </thead>
          <tbody>
            {detail.codes.map((code: CommunityCode) => (
              <tr key={code.id} className="border-t border-zinc-800/60">
                <td className="py-1.5 font-mono text-zinc-200">{code.code}{!code.isActive && <span className="ml-1 text-[10px] text-zinc-600">(inactive)</span>}</td>
                <td className="py-1.5">{code.owner ? <AddressChip address={code.owner} /> : <span className="text-zinc-700">—</span>}</td>
                <td className="py-1.5 text-right text-zinc-400">{code.redemptionCount}</td>
                <td className="py-1.5">
                  {code.claimed
                    ? <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-300">claimed</span>
                    : <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300">unclaimed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function UnattributedSection({ count, fuel }: { count: number; fuel: number }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<UnattributedAllocation[] | null>(null)
  const [, startTransition] = useTransition()

  function toggle() {
    setOpen((o) => !o)
    if (!rows) startTransition(async () => { const r = await unattributedFuelAction(); if (r.ok) setRows(r.rows) })
  }
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button onClick={toggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900/60">
        <ChevronRight size={16} className={`text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} />
        <div className="flex-1">
          <div className="font-semibold text-zinc-200">Unattributed FUEL</div>
          <div className="text-xs text-zinc-500">FUEL on addresses that never claimed a code</div>
        </div>
        <div className="text-right text-sm"><span className="font-semibold text-sky-300">{fmtFuel(fuel)}</span> <span className="text-xs text-zinc-500">· {count} addr</span></div>
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3">
          {!rows ? <SkeletonList rows={5} height="h-6" className="py-2" /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500"><tr><th className="py-1.5">Address</th><th className="py-1.5 text-right">FUEL</th><th className="py-1.5">Note</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.address} className="border-t border-zinc-800/60">
                    <td className="py-1.5"><Copyable value={r.address} /></td>
                    <td className="py-1.5 text-right font-medium text-sky-300">{fmtFuel(r.fuel)}</td>
                    <td className="py-1.5 text-xs text-zinc-500">{r.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ? "text-sky-300" : "text-white"}`}>{value}</div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1 text-xs font-medium ${active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
      {children}
    </button>
  )
}
