"use client"

// components/conference/ParticipantList.tsx
// Read-only participant list for non-admin users.

import { cn } from "@/lib/utils"
import { Mic, Monitor, Users, Crown, ShieldCheck } from "lucide-react"
import type { ParticipantInfo } from "@/lib/room-types"
import AddressAvatar from "@/components/conference/AddressAvatar"

interface ParticipantListProps {
  participants: ParticipantInfo[]
  activePresenter: string | null
  className?: string
}

export function ParticipantList({
  participants,
  activePresenter,
  className,
}: ParticipantListProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-zinc-500" />
          <span
            style={{
              fontSize: 10,
              fontFamily: '"Courier New", monospace',
              color: "rgba(255,255,255,0.6)",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            PARTICIPANTS ({participants.length})
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
        {participants.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50",
              activePresenter === p.id && "bg-blue-500/5"
            )}
          >
            {/* Avatar: identicon for wallet-verified, crown for admin */}
            {p.walletVerified && p.walletAddress ? (
              <AddressAvatar address={p.walletAddress} size={20} className="flex-shrink-0" />
            ) : p.isAdmin ? (
              <Crown className="h-3 w-3 text-amber-400/70 flex-shrink-0" />
            ) : null}

            <span
              className="text-xs text-zinc-300 truncate flex-1"
              style={{ fontFamily: '"Courier New", monospace' }}
            >
              {p.displayName}
            </span>

            {/* Verified badge */}
            {p.walletVerified && (
              <span title="Wallet verified"><ShieldCheck className="h-3 w-3 text-green-400/60 flex-shrink-0" /></span>
            )}

            {/* Community group tag */}
            {p.communityGroup && (
              <span
                className="text-[8px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  background: "rgba(91,156,255,0.1)",
                  color: "rgba(91,156,255,0.7)",
                  fontFamily: '"Courier New", monospace',
                  letterSpacing: 0.5,
                }}
              >
                {p.communityGroup}
              </span>
            )}

            {/* Permission indicators */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {p.permissions.mic && (
                <Mic className="h-3 w-3 text-green-400/60" />
              )}
              {p.permissions.screen && (
                <Monitor className="h-3 w-3 text-blue-400/60" />
              )}
            </div>

            {activePresenter === p.id && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400/80 flex-shrink-0"
                style={{ fontFamily: '"Courier New", monospace', letterSpacing: 1 }}
              >
                LIVE
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
