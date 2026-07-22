/**
 * Whether a generic token stat carries information worth a card.
 *
 * Generic stats come from an upstream that reports "no market" and "unknown" as 0, not null.
 * `StatHero` used to gate the price card on `!= null`, so a 0 rendered as "$0.0000" — a claim the
 * token is worthless rather than untraded. Same for a vault reading "HOLDERS 0 / SUPPLY 0".
 *
 * One rule covers holders, supply and price: a stat earns a card only when it parses to a finite
 * number strictly greater than zero. Supply arrives as a string, so parse rather than compare.
 *
 * Custom adapter stats deliberately do NOT pass through here — those are hand-written per slug and
 * a jackpot that is genuinely empty right now is real information.
 */
export function isMeaningfulStat(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) && n > 0
}
