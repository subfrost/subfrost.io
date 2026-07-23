/**
 * Verified-source attestation for one alkane, read from the SUBFROST explorer's
 * source-browser API (explorer.subfrost.io/docs/source-browser, shipped 2026-07-23).
 *
 * Returns null on ANY failure and on any alkane that has not verified, so the caller can
 * treat "this contract has no attestation" and "the explorer is down" identically. That
 * matters: the explorer's own alkane pages were serving "Backend temporarily unavailable"
 * for at least 13 minutes on 2026-07-23 while this API answered 200 throughout.
 *
 * Server-side only. The API key travels as a PATH SEGMENT, so calling this from a client
 * component would publish it.
 */
import { isValidAlkaneId, isValidHttpUrl } from "@/lib/ecosystem/constants"

/**
 * Default carries the working service key, matching how SUBFROST_RPC_URL is handled in
 * lib/ecosystem/simulate.ts. `subfrost` is the gateway's service key (flex, 2026-07-22:
 * "subfrost key should just be /v4/subfrost"), and it is the literal `/v1/subfrost/` segment
 * of API_BASE below; the source API validates against the same key store. No secret has to
 * exist for this to work in CI or locally.
 */
const API_BASE =
  process.env.EXPLORER_SOURCE_API || "https://explorer.subfrost.io/api/v1/subfrost/source"

/** `reproducible` = byte-exact rebuild. `verified` = same logic, small host-dependent residual. */
export type SourceVerdict = "reproducible" | "verified"

/**
 * Where the explorer serves the source from. `db` is its own byte-for-byte copy of the tree
 * the sandbox reproduced, which is how private repos stay browsable. `github` means it lists
 * the repo live at request time, which is the only reliable proof the repo is publicly
 * readable: the API's own `private` flag comes back true even for kungfuflex/alkanes-rs,
 * which is public.
 */
export type SourceOrigin = "db" | "github"

export interface VerifiedSource {
  alkaneId: string
  verdict: SourceVerdict
  matchPct: number
  origin: SourceOrigin
  repo: string
  commit: string
}

export async function fetchVerifiedSource(
  alkaneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedSource | null> {
  if (!isValidAlkaneId(alkaneId)) return null
  const [block, tx] = alkaneId.split(":")
  try {
    const res = await fetchImpl(`${API_BASE}/${block}/${tx}`, {
      signal: AbortSignal.timeout(8_000),
      // Verdicts change rarely, so the profile page pays the 0.4s to 0.85s call once an hour.
      next: { revalidate: 3600 },
    } as RequestInit)
    if (!res.ok) return null

    const json = (await res.json()) as { ok?: unknown; source?: unknown }
    if (json.ok !== true) return null
    const s = json.source
    if (!s || typeof s !== "object") return null
    const src = s as Record<string, unknown>
    if (src.verified !== true) return null

    const verdict = src.verdict
    if (verdict !== "reproducible" && verdict !== "verified") return null

    const origin = src.origin
    if (origin !== "db" && origin !== "github") return null

    const matchPct = src.match_pct
    if (typeof matchPct !== "number" || !Number.isFinite(matchPct)) return null
    if (matchPct < 0 || matchPct > 100) return null

    // `reproducible` is the explorer's byte-exact verdict, and the panel's note says so in
    // as many words. A sub-100 match under that verdict would print a claim the number
    // contradicts, so drop the attestation rather than render it.
    if (verdict === "reproducible" && matchPct !== 100) return null

    const repo = src.repo
    if (typeof repo !== "string" || !isValidHttpUrl(repo)) return null

    const commit = src.commit
    if (typeof commit !== "string" || !/^[0-9a-f]{7,64}$/i.test(commit)) return null

    return { alkaneId, verdict, matchPct, origin, repo, commit }
  } catch {
    return null
  }
}

/** "https://github.com/subfrost/subfrost-alkanes" becomes "subfrost/subfrost-alkanes". */
export function repoShortName(repo: string): string {
  const stripped = repo.replace(/^https?:\/\/(www\.)?github\.com\//i, "")
  if (stripped === repo) return repo // not a GitHub URL: leave it legible
  return stripped.replace(/\.git$/i, "").replace(/\/+$/, "")
}
