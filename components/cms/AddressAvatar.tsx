import { avatarSpec } from "@/lib/avatar/address-avatar"

/** Deterministic cartoon avatar for an address. Pure SVG, no hooks — usable in
 *  server or client components. Renders a face whose features + colour are a
 *  function of the address. */
export function AddressAvatar({ address, size = 28 }: { address: string; size?: number }) {
  const s = avatarSpec(address)

  // Hair shapes (top of head), keyed by hairStyle.
  const hair = [
    <path key="h0" d="M14 30 Q14 12 32 12 Q50 12 50 30 Q50 20 32 18 Q14 20 14 30 Z" fill={s.hair} />, // short
    <path key="h1" d="M13 32 Q12 10 32 10 Q52 10 51 32 L46 30 Q47 16 32 16 Q17 16 18 30 Z" fill={s.hair} />, // fringe
    <path key="h2" d="M12 34 Q12 8 32 8 Q52 8 52 34 L52 44 Q50 26 32 24 Q14 26 12 44 Z" fill={s.hair} />, // long
    <g key="h3"><path d="M16 26 Q18 12 32 12 Q46 12 48 26 Q40 18 32 18 Q24 18 16 26 Z" fill={s.hair} /></g>, // receding
    <path key="h4" d="M15 28 Q15 11 32 11 Q49 11 49 28 Q44 19 38 20 Q35 14 32 14 Q29 14 26 20 Q20 19 15 28 Z" fill={s.hair} />, // spiky
  ][s.hairStyle]

  // Eyes.
  const eyes = [
    <g key="e0" fill="#222"><circle cx="25" cy="33" r="2.1" /><circle cx="39" cy="33" r="2.1" /></g>,
    <g key="e1" stroke="#222" strokeWidth="1.6" strokeLinecap="round"><line x1="23" y1="33" x2="27" y2="33" /><line x1="37" y1="33" x2="41" y2="33" /></g>,
    <g key="e2" fill="#222"><ellipse cx="25" cy="33" rx="1.7" ry="2.4" /><ellipse cx="39" cy="33" rx="1.7" ry="2.4" /></g>,
  ][s.eyes]

  // Mouth.
  const mouth = [
    <path key="m0" d="M26 42 Q32 47 38 42" stroke="#9a3b2e" strokeWidth="1.8" fill="none" strokeLinecap="round" />, // smile
    <line key="m1" x1="27" y1="43" x2="37" y2="43" stroke="#9a3b2e" strokeWidth="1.8" strokeLinecap="round" />, // neutral
    <path key="m2" d="M27 44 Q32 40 37 44" stroke="#9a3b2e" strokeWidth="1.8" fill="none" strokeLinecap="round" />, // frown
    <ellipse key="m3" cx="32" cy="43" rx="2.6" ry="2" fill="#9a3b2e" />, // open
  ][s.mouth]

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ borderRadius: 8 }}>
      <rect x="0" y="0" width="64" height="64" rx="14" fill={s.bg} stroke={s.ring} strokeWidth="2.5" />
      <circle cx="32" cy="36" r="16" fill={s.skin} />
      {/* ears */}
      <circle cx="16" cy="37" r="3" fill={s.skin} />
      <circle cx="48" cy="37" r="3" fill={s.skin} />
      {hair}
      {eyes}
      {s.glasses && (
        <g stroke="#333" strokeWidth="1.3" fill="none">
          <circle cx="25" cy="33" r="3.4" />
          <circle cx="39" cy="33" r="3.4" />
          <line x1="28.4" y1="33" x2="35.6" y2="33" />
        </g>
      )}
      {mouth}
    </svg>
  )
}
