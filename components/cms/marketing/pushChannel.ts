import type { PushChannel } from "@prisma/client"

export interface ChannelMeta { label: string; dot: string; bg: string; fg: string }

export const CHANNEL_META: Record<PushChannel, ChannelMeta> = {
  ARTICLE:   { label: "Article",    dot: "#378ADD", bg: "#E6F1FB", fg: "#0C447C" },
  X:         { label: "X / Twitter", dot: "#5F5E5A", bg: "#F1EFE8", fg: "#2C2C2A" },
  EMAIL:     { label: "Email",      dot: "#BA7517", bg: "#FAEEDA", fg: "#633806" },
  STAT_CARD: { label: "Stat-card",  dot: "#7F77DD", bg: "#EEEDFE", fg: "#3C3489" },
  OTHER:     { label: "Other",      dot: "#888780", bg: "#F1EFE8", fg: "#2C2C2A" },
}

export function channelLabel(c: PushChannel): string {
  return CHANNEL_META[c].label
}
