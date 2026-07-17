// Versioned shape of EcosystemStatSnapshot.stats (Json).
export interface GenericTokenStats { name: string | null; symbol: string | null; holders: number | null; supply: string | null; priceUsd: number | null; marketcapUsd: number | null; volume24hUsd: number | null }
export interface CustomStat { key: string; label: string; labelZh?: string; value: string; unit?: string }
export interface ProjectStats { generic: Record<string, GenericTokenStats>; custom: CustomStat[] }
