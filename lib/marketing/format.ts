export const DASH = "—"
export const fmtInt = (v: number | null): string =>
  v === null ? DASH : v.toLocaleString("en-US", { maximumFractionDigits: 0 })
export const fmtUsd = (v: number | null): string =>
  v === null ? DASH : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const fmtNum = (v: number | null, dp = 2): string =>
  v === null ? DASH : v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
