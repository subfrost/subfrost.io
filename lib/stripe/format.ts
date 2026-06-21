/** Currency formatting helpers for the billing console UI. Client-safe (no imports). */
export function centsToUsd(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`
}
export function centsToDisplay(cents: number): string {
  return `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`
}
