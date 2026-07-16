// lib/ecosystem/constants.ts
/**
 * Curated lists for the Alkanes ecosystem directory. Plain strings (not DB
 * enums) so adding a category is a code-only change — server actions validate
 * against these before writing.
 */
export const ECOSYSTEM_CATEGORIES = [
  "DeFi", "Wallet", "Tooling", "Launchpad", "NFT", "Gaming", "Social", "Other",
] as const
export type EcosystemCategory = (typeof ECOSYSTEM_CATEGORIES)[number]

export const ECOSYSTEM_STATUSES = ["Live", "Beta", "Building"] as const
export type EcosystemStatus = (typeof ECOSYSTEM_STATUSES)[number]

export function isValidCategory(v: string): v is EcosystemCategory {
  return (ECOSYSTEM_CATEGORIES as readonly string[]).includes(v)
}

export function isValidStatus(v: string): v is EcosystemStatus {
  return (ECOSYSTEM_STATUSES as readonly string[]).includes(v)
}

export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

export function isValidOptionalHttpUrl(v: string | null | undefined): boolean {
  if (v == null || v === "") return true
  return isValidHttpUrl(v)
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const ECOSYSTEM_KINDS = ["App", "Contract"] as const
export type EcosystemKind = (typeof ECOSYSTEM_KINDS)[number]

export function isValidKind(v: string): v is EcosystemKind {
  return (ECOSYSTEM_KINDS as readonly string[]).includes(v)
}

/** Alkane id in canonical `block:tx` form (e.g. "2:0"). Empty/null = not set. */
export function isValidOptionalAlkaneId(v: string | null | undefined): boolean {
  if (v == null || v === "") return true
  return isValidAlkaneId(v)
}

/** Alkane id in canonical `block:tx` form (e.g. "2:0"). */
export function isValidAlkaneId(v: string): boolean {
  return /^\d+:\d+$/.test(v)
}

/**
 * SUBFROST's own products (not third-party). The directory-wide "SUBFROST did not build / does
 * not control / has not audited these projects" notice is self-contradictory on their profiles,
 * so it is suppressed there. The directory-level notice still frames the directory as a whole.
 * Small and stable, so it lives in code rather than the DB.
 */
export const FIRST_PARTY_SLUGS = new Set(["diesel", "frbtc", "fire", "subfrost"])

export function isFirstParty(slug: string): boolean {
  return FIRST_PARTY_SLUGS.has(slug)
}
