// BSC JSON-RPC transport for the treasury balance reader.
//
// Uses the OPEN BNB Chain dataseeds (and publicnode) with a plain server-side
// `fetch`. These are the same RPCs the Venus dapp (app.venus.io) uses, but the
// dataseed/publicnode endpoints have no Cloudflare bot-protection, so a plain
// datacenter `fetch` works reliably — unlike the NodeReal endpoint, which sits
// behind Cloudflare and blocks/challenges datacenter (and even residential
// proxy) IPs, hanging the snapshot. We try each endpoint in order and fall back
// on any failure, with a hard per-attempt timeout so the treasury snapshot can
// never hang — the caller catches and degrades to the last-good snapshot.

import { BSC_RPC_URL } from "@/lib/financials/treasury/config"

const TIMEOUT_MS = 12_000

/** Open BSC JSON-RPC endpoints, tried in order. `BSC_RPC_URL` (env override, if
 *  set) is tried first; the rest are independent public fallbacks. */
const RPC_ENDPOINTS: string[] = [
  BSC_RPC_URL,
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc.publicnode.com",
  "https://bsc-dataseed2.bnbchain.org",
].filter((u, i, a) => u && a.indexOf(u) === i)

/** POST a JSON-RPC payload (single or batch) to an open BSC dataseed, returning
 *  the parsed JSON. Tries each endpoint with a hard timeout and falls back on
 *  failure; throws only if every endpoint fails, so the caller can degrade to
 *  last-good rather than serve a partial snapshot or hang. */
export async function bscRpcCall(payload: unknown): Promise<unknown> {
  let lastErr: unknown
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
      if (!res.ok) {
        lastErr = new Error(`BSC RPC ${res.status} (${url})`)
        continue
      }
      return await res.json()
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(
    `BSC RPC failed on all endpoints: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  )
}
