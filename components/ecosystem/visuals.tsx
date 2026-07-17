import type { PublicEcosystemProject } from "@/lib/ecosystem/public"

export const STATUS_COLOR: Record<string, string> = {
  Live: "#178a4c",
  Beta: "#b7791f",
  Building: "var(--ed-muted)",
}

export const GRADS = [
  "linear-gradient(135deg,#11294a,#1a3c66)",
  "linear-gradient(135deg,#1a4d8f,#5b9cff)",
  "linear-gradient(135deg,#0a1628,#1a4d8f)",
  "linear-gradient(135deg,#1a3c66,#5b9cff)",
  "linear-gradient(135deg,#11294a,#5b9cff)",
]

export function gradFor(slug: string) {
  let h = 0
  for (const ch of slug) h = (h + ch.charCodeAt(0)) % GRADS.length
  return GRADS[h]
}

export function initials(name: string) {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 1).toUpperCase()
}

export function Mark({ p, size }: { p: Pick<PublicEcosystemProject, "slug" | "name" | "logoUrl">; size: number }) {
  if (p.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.logoUrl} alt="" width={size} height={size} className="rounded-[10px] object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-[10px] font-semibold text-white"
      style={{ width: size, height: size, background: gradFor(p.slug), fontSize: size * 0.38 }}
    >
      {initials(p.name)}
    </span>
  )
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.Building
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color }}>
      <i className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
