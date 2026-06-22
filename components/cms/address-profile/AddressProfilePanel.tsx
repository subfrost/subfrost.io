"use client"

import { createContext, useCallback, useContext, useState, useTransition } from "react"
import { Crown, Copy, X, Flame, Pencil } from "lucide-react"
import { AddressAvatar } from "@/components/cms/AddressAvatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SkeletonStats, SkeletonText } from "@/components/cms/Skeleton"
import {
  addressProfileAction,
  updateAddressNoteAction,
  type ProfileResult,
} from "@/actions/cms/address-profile"
import type { AddressProfileData } from "@/lib/community/address-profile"

interface Ctx {
  open: (address: string) => void
}
const ProfileCtx = createContext<Ctx>({ open: () => {} })
export const useAddressProfile = () => useContext(ProfileCtx)

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })
const trunc = (a: string) => (a.length > 22 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a)

export function AddressProfileProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [data, setData] = useState<AddressProfileData | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const open = useCallback((addr: string) => {
    setAddress(addr); setData(null); setError(null)
    startTransition(async () => {
      const res: ProfileResult = await addressProfileAction(addr)
      if (res.ok) { setData(res.profile); setCanEdit(res.canEdit) }
      else setError(res.error)
    })
  }, [])

  const close = () => { setAddress(null); setData(null); setError(null) }

  return (
    <ProfileCtx.Provider value={{ open }}>
      {children}
      {address && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <button onClick={close} className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-200"><X size={18} /></button>
            <ProfileHeader address={address} data={data} />
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            {!data && !error && (
              <div className="mt-6 space-y-6">
                <SkeletonStats count={2} className="grid-cols-2 sm:grid-cols-2" />
                <SkeletonText lines={4} />
                <SkeletonText lines={3} />
              </div>
            )}
            {data && <ProfileBody data={data} canEdit={canEdit} onSaved={() => open(address)} />}
          </div>
        </div>
      )}
    </ProfileCtx.Provider>
  )
}

function ProfileHeader({ address, data }: { address: string; data: AddressProfileData | null }) {
  return (
    <div className="flex items-start gap-3">
      <AddressAvatar address={address} size={56} />
      <div className="min-w-0 flex-1">
        <button onClick={() => navigator.clipboard?.writeText(address)}
          className="flex items-center gap-1.5 font-mono text-sm text-zinc-200 hover:text-white">
          {trunc(address)} <Copy size={12} className="opacity-50" />
        </button>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {data?.isLeader && <Badge className="bg-amber-900/50 text-amber-300"><Crown size={10} /> Leader</Badge>}
          {data?.isMember && <Badge className="bg-sky-900/50 text-sky-300">Member</Badge>}
          {data && !data.isMember && !data.isLeader && <Badge className="bg-zinc-800 text-zinc-400">Unlinked</Badge>}
        </div>
      </div>
    </div>
  )
}

function ProfileBody({ data, canEdit, onSaved }: { data: AddressProfileData; canEdit: boolean; onSaved: () => void }) {
  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="FUEL" value={fmt(data.fuel)} accent icon={<Flame size={13} className="text-orange-400/80" />} />
        <Stat label="% of gross" value={`${data.pctOfGross}%`} />
      </div>

      <NoteEditor address={data.address} initial={data.note} canEdit={canEdit} onSaved={onSaved} />

      <Section title={`Communities (${data.memberships.length})`}>
        {data.memberships.length === 0 ? <Empty>Not a member of any community.</Empty> : data.memberships.map((m) => (
          <div key={m.rootId} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{m.community}</span>
              <span className="text-sm text-sky-300">{fmt(m.memberFuel)} <span className="text-xs text-zinc-500">FUEL</span></span>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {m.pctOfCommunity}% of community ({fmt(m.communityTotalFuel)} total)
            </div>
            {m.codesClaimed.length > 0 && (
              <div className="mt-1.5 font-mono text-xs text-zinc-400">redeemed: {m.codesClaimed.join(", ")}</div>
            )}
          </div>
        ))}
      </Section>

      {data.ownedCodes.length > 0 && (
        <Section title={`Codes owned (${data.ownedCodes.length})`}>
          <div className="space-y-1">
            {data.ownedCodes.map((c) => (
              <div key={c.code} className="flex items-center justify-between rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs">
                <span className="font-mono text-zinc-200">{c.code}{c.isRoot && <span className="ml-1 text-[10px] text-amber-400/80">root</span>}</span>
                <span className="text-zinc-500">{c.community ?? "—"} · {c.redemptionCount} claims</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function NoteEditor({ address, initial, canEdit, onSaved }: { address: string; initial: string | null; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(initial ?? "")
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
          Note {canEdit && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"><Pencil size={11} /> edit</button>}
        </div>
        <p className="text-sm text-zinc-300">{initial || <span className="text-zinc-600">No note</span>}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="bg-zinc-950 text-zinc-100 border-zinc-700" placeholder="Add a note for this address…" />
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => startTransition(async () => { const r = await updateAddressNoteAction(address, note); if (r.ok) { setEditing(false); onSaved() } })}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setNote(initial ?? "") }}>Cancel</Button>
      </div>
    </div>
  )
}

function Stat({ label, value, accent, icon }: { label: string; value: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1 text-lg font-semibold ${accent ? "text-sky-300" : "text-white"}`}>{icon}{value}</div>
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="mb-2 text-sm font-semibold text-zinc-300">{title}</div><div className="space-y-2">{children}</div></div>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-zinc-600">{children}</p>
}
function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>
}

/** Avatar + truncated address that opens the profile drawer on click. Reused by
 *  every view that lists addresses. */
export function AddressChip({ address, size = 24, showLeader }: { address: string; size?: number; showLeader?: boolean }) {
  const { open } = useAddressProfile()
  return (
    <button onClick={() => open(address)} className="inline-flex items-center gap-2 text-left hover:opacity-80" title="View profile">
      <AddressAvatar address={address} size={size} />
      <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-300">
        {showLeader && <Crown size={11} className="text-amber-400" />}
        {address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address}
      </span>
    </button>
  )
}
