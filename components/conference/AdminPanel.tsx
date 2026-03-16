"use client"

// components/conference/AdminPanel.tsx
// Admin control panel showing participant list with permission toggles.

import { useCallback } from "react"
import { cn } from "@/lib/utils"
import { Mic, MicOff, Monitor, MonitorOff, UserX, Shield, Crown, ShieldCheck } from "lucide-react"
import type { ParticipantInfo } from "@/lib/room-types"
import AddressAvatar from "@/components/conference/AddressAvatar"

interface AdminPanelProps {
  participants: ParticipantInfo[]
  activePresenter: string | null
  selfId: string
  onSetPermissions: (participantId: string, mic?: boolean, screen?: boolean) => void
  onKick: (participantId: string) => void
  className?: string
}

export function AdminPanel({
  participants,
  activePresenter,
  selfId,
  onSetPermissions,
  onKick,
  className,
}: AdminPanelProps) {
  const toggleMic = useCallback(
    (p: ParticipantInfo) => {
      onSetPermissions(p.id, !p.permissions.mic, undefined)
    },
    [onSetPermissions]
  )

  const toggleScreen = useCallback(
    (p: ParticipantInfo) => {
      onSetPermissions(p.id, undefined, !p.permissions.screen)
    },
    [onSetPermissions]
  )

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-amber-400/70" />
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
              "flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50",
              activePresenter === p.id && "bg-blue-500/5"
            )}
          >
            {/* Name + role */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Avatar: identicon for wallet-verified, crown for admin */}
              {p.walletVerified && p.walletAddress ? (
                <AddressAvatar address={p.walletAddress} size={20} className="flex-shrink-0" />
              ) : p.isAdmin ? (
                <Crown className="h-3 w-3 text-amber-400/70 flex-shrink-0" />
              ) : null}

              <span
                className="text-xs text-zinc-300 truncate"
                style={{ fontFamily: '"Courier New", monospace' }}
              >
                {p.displayName}
              </span>

              {/* Verified badge */}
              {p.walletVerified && (
                <span title="Wallet verified"><ShieldCheck className="h-3 w-3 text-green-400/60 flex-shrink-0" /></span>
              )}

              {activePresenter === p.id && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400/80 flex-shrink-0"
                  style={{ fontFamily: '"Courier New", monospace', letterSpacing: 1 }}
                >
                  PRESENTING
                </span>
              )}

              {/* Community group pill */}
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

              {/* Full wallet address on hover */}
              {p.walletAddress && (
                <span
                  className="text-[9px] text-zinc-600 truncate max-w-[80px]"
                  style={{ fontFamily: '"Courier New", monospace' }}
                  title={p.walletAddress}
                >
                  {p.walletAddress.slice(0, 6)}...
                </span>
              )}
            </div>

            {/* Controls */}
            {p.id !== selfId && (
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {/* Mic toggle */}
                <button
                  onClick={() => toggleMic(p)}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    p.permissions.mic
                      ? "text-green-400/80 hover:bg-green-500/10"
                      : "text-zinc-600 hover:bg-zinc-800"
                  )}
                  title={p.permissions.mic ? "Mute" : "Unmute"}
                >
                  {p.permissions.mic ? (
                    <Mic className="h-3.5 w-3.5" />
                  ) : (
                    <MicOff className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Screen toggle */}
                <button
                  onClick={() => toggleScreen(p)}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    p.permissions.screen
                      ? "text-blue-400/80 hover:bg-blue-500/10"
                      : "text-zinc-600 hover:bg-zinc-800"
                  )}
                  title={p.permissions.screen ? "Revoke screen" : "Allow screen"}
                >
                  {p.permissions.screen ? (
                    <Monitor className="h-3.5 w-3.5" />
                  ) : (
                    <MonitorOff className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Kick */}
                <button
                  onClick={() => onKick(p.id)}
                  className="p-1.5 rounded text-zinc-600 hover:text-red-400/80 hover:bg-red-500/10 transition-colors"
                  title="Remove from room"
                >
                  <UserX className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
