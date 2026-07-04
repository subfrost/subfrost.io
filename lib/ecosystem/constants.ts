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
