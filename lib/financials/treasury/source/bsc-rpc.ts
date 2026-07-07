// BSC JSON-RPC transport for the treasury balance reader.
//
// We do NOT hit the RPC with a plain `fetch`: from the backend, public BSC RPCs
// (and NodeReal) frequently block or rate-limit datacenter egress by TLS/JA4
// fingerprint. Instead every JSON-RPC POST is routed through `tlsfetch` — a
// pure-Rust TLS engine compiled to wasm — with the Firefox fingerprint + the
// exact headers the Venus Protocol dapp (app.venus.io) sends to the same
// NodeReal endpoint, so the handshake and request look like a real browser.
//
// `tlsfetch` is a `serverExternalPackage` (see next.config.mjs) so Next.js does
// not bundle its wasm; it is `require`d at runtime and loads the wasm from its
// own `pkg/` via `__dirname`. We import it lazily (dynamic `import`) so the wasm
// only instantiates on first RPC call, never at build/prerender time.

import { BSC_RPC_URL } from "@/lib/financials/treasury/config"
import type { NetModule } from "tlsfetch"

// Connect-only timeout handed to the (proxy or direct) net module.
const CONNECT_TIMEOUT_MS = 10_000
// Hard ceiling on the whole tlsfetch call (connect + TLS + request + response).
// If the proxy or upstream stalls, we throw instead of hanging forever — the
// treasury action catches this and degrades to the last-good snapshot.
const OVERALL_TIMEOUT_MS = 20_000

/** Headers Venus Protocol sends to the NodeReal BSC RPC — replicated so the
 *  request is indistinguishable from the real dapp. The Firefox UA matches the
 *  `firefox120` TLS fingerprint below. */
const VENUS_HEADERS: Record<string, string> = {
  origin: "https://venus.io",
  referer: "https://venus.io/",
  "content-type": "application/json",
  accept: "*/*",
  "sec-fetch-site": "cross-site",
  "sec-fetch-mode": "cors",
  "accept-language": "en-US,en;q=0.5",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0",
}

/** Loaded once — the wasm instantiates on first access, then is reused. */
let tlsfetchFn: Promise<typeof import("tlsfetch").tlsfetch> | null = null
function getTlsfetch(): Promise<typeof import("tlsfetch").tlsfetch> {
  if (!tlsfetchFn) {
    tlsfetchFn = import("tlsfetch").then((m) => m.tlsfetch)
  }
  return tlsfetchFn
}

/** Built once when `IPROYAL_PROXY` is set — routes the tlsfetch TCP leg through
 *  the residential proxy (HTTP CONNECT) so NodeReal sees a clean, non-datacenter
 *  IP. Absent env => `null` and we dial direct (dev/local keeps working). */
let proxyNetFn: Promise<NetModule> | null = null
function getProxyNet(): Promise<NetModule> | null {
  const url = process.env.IPROYAL_PROXY
  if (!url) return null
  if (!proxyNetFn) {
    proxyNetFn = import("./proxy-net").then((m) => m.proxyNetModule(url))
  }
  return proxyNetFn
}

/** Reject after `ms` so a stalled connect/handshake/response can never hang the
 *  treasury snapshot — the caller catches and degrades to last-good. */
function deadline(ms: number): Promise<never> {
  return new Promise((_resolve, reject) =>
    setTimeout(() => reject(new Error(`BSC RPC timeout after ${ms}ms`)), ms),
  )
}

/** POST a JSON-RPC payload to the BSC RPC over tlsfetch (browser-emulated TLS),
 *  returning the parsed JSON. Routes through the IPROYAL residential proxy when
 *  `IPROYAL_PROXY` is set (GKE), else dials direct (dev/local). Throws on
 *  transport/HTTP error — including a hard overall timeout — so the caller can
 *  degrade to last-good rather than serve a partial snapshot or hang. */
export async function bscRpcCall(payload: unknown): Promise<unknown> {
  const tlsfetch = await getTlsfetch()
  const net = await getProxyNet()?.catch((e) => {
    throw new Error(`IPROYAL proxy init failed: ${e instanceof Error ? e.message : e}`)
  })
  const resp = await Promise.race([
    tlsfetch(
      BSC_RPC_URL,
      {
        method: "POST",
        headers: VENUS_HEADERS,
        body: JSON.stringify(payload),
        fingerprint: "firefox120",
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
      },
      net ?? undefined,
    ),
    deadline(OVERALL_TIMEOUT_MS),
  ])
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`BSC RPC ${resp.status}`)
  }
  return resp.json()
}
