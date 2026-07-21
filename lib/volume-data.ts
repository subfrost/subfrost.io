/**
 * Volume data service — fetches wrap/unwrap transaction history from:
 *   1. Alkanes: Subfrost data API (same source as subfrost-app)
 *   2. BRC20:   Subfrost JSON-RPC via rpc-client (same as landing page metrics)
 *
 * Results are cached in-memory with a 15-minute TTL.
 */

import { getAddressTxs, getAddressTxsChain, getBrc20SignerAddress, type AddressTx } from "./rpc-client";
import { getFrbtcVolumeRange } from "./financials/frbtc-indexer";

// Alkanes wrap/unwrap history lives on canon Espo at alkanode. The subfrost.io
// REST sub-paths return empty data — per flex (alkanes-rs maintainer): all
// /v4/subfrost/* REST routes other than BTC pricing are espo routes that
// should be bypassed and go directly to alkanode.
const DATA_API = process.env.ALKANODE_DATA_API || "https://oyl.alkanode.com";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const PAGE_SIZE = 200; // Data API max per request
const MIN_DATE = new Date("2025-10-01T00:00:00Z");
const DUST_THRESHOLDS = [546, 330];
const BRC20_PAGE_DELAY_MS = 200;
const BRC20_PAGE_MAX_RETRIES = 6;

// ---------- Shared types ----------

interface ClassifiedTx {
  txid: string;
  direction: "wrap" | "unwrap";
  source: "alkanes" | "brc20";
  volume_sats: number;
  block_time: Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Public result types ----------

export interface VolumeStats {
  wrap_volume_sats: string;
  unwrap_volume_sats: string;
  total_volume_sats: string;
  wrap_24h_sats: string;
  unwrap_24h_sats: string;
  wrap_7d_sats: string;
  unwrap_7d_sats: string;
}

export interface CandleRow {
  bucket: string;
  wrap_sats: string;
  unwrap_sats: string;
  alkanes_wrap_sats: string;
  alkanes_unwrap_sats: string;
  brc20_wrap_sats: string;
  brc20_unwrap_sats: string;
}

// ============================================================================
// Alkanes — Subfrost Data API
// ============================================================================

interface DataApiItem {
  address: string;
  amount: string;
  timestamp: string;
  transactionId: string;
}

interface DataApiResponse {
  data: {
    items: DataApiItem[];
    total: number;
    count: number;
    offset: number;
  };
  statusCode: number;
}

async function fetchDataApiPage(endpoint: string, offset: number): Promise<DataApiResponse> {
  const res = await fetch(`${DATA_API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: PAGE_SIZE, offset }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
  return res.json();
}

async function fetchAlkanes(endpoint: string, direction: "wrap" | "unwrap"): Promise<ClassifiedTx[]> {
  const first = await fetchDataApiPage(endpoint, 0);
  const total = first.data.total;
  const results: ClassifiedTx[] = [];

  const processItems = (items: DataApiItem[]) => {
    for (const item of items) {
      const dt = new Date(item.timestamp);
      if (dt < MIN_DATE) continue;
      results.push({
        txid: item.transactionId,
        direction,
        source: "alkanes",
        volume_sats: Number(item.amount),
        block_time: dt,
      });
    }
  };

  processItems(first.data.items);

  if (total > PAGE_SIZE) {
    const pages: Promise<DataApiResponse>[] = [];
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
      pages.push(fetchDataApiPage(endpoint, offset));
    }
    const responses = await Promise.all(pages);
    for (const resp of responses) {
      processItems(resp.data.items);
    }
  }

  return results;
}

async function fetchAllAlkanes(): Promise<ClassifiedTx[]> {
  const [wraps, unwraps] = await Promise.all([
    fetchAlkanes("get-all-wrap-history", "wrap"),
    fetchAlkanes("get-all-unwrap-history", "unwrap"),
  ]);
  console.log(`[volume-data] Alkanes: ${wraps.length} wraps, ${unwraps.length} unwraps`);
  return [...wraps, ...unwraps];
}

// ============================================================================
// BRC20 — Esplora address scanning
// ============================================================================

function classifyBrc20Tx(tx: AddressTx, address: string): ClassifiedTx | null {
  if (!tx.status?.confirmed || !tx.status.block_time) return null;

  const blockTime = new Date(tx.status.block_time * 1000);
  if (blockTime < MIN_DATE) return null;

  const incoming = tx.vout.some((o) => o.scriptpubkey_address === address);
  const outgoing = tx.vin.some((i) => i.prevout?.scriptpubkey_address === address);
  const opReturn = tx.vout.some((o) => o.scriptpubkey_type === "op_return");

  if (incoming && opReturn) {
    const volume = tx.vout
      .filter((o) => o.scriptpubkey_address === address && !DUST_THRESHOLDS.includes(o.value))
      .reduce((sum, o) => sum + o.value, 0);
    if (volume === 0) return null;
    return { txid: tx.txid, direction: "wrap", source: "brc20", volume_sats: volume, block_time: blockTime };
  }

  if (outgoing && !opReturn) {
    const volume = tx.vout
      .filter((o) => o.scriptpubkey_address !== address && o.scriptpubkey_address)
      .reduce((sum, o) => sum + o.value, 0);
    if (volume === 0) return null;
    return { txid: tx.txid, direction: "unwrap", source: "brc20", volume_sats: volume, block_time: blockTime };
  }

  return null;
}

async function fetchAllBrc20(knownTxids?: Set<string>): Promise<ClassifiedTx[]> {
  const address = getBrc20SignerAddress();
  const results: ClassifiedTx[] = [];
  let lastSeenTxid: string | undefined;
  let pageNum = 0;
  const minDateEpoch = MIN_DATE.getTime() / 1000;

  while (true) {
    pageNum++;
    let page: AddressTx[] | null = null;

    for (let attempt = 0; attempt < BRC20_PAGE_MAX_RETRIES; attempt++) {
      try {
        page = lastSeenTxid
          ? await getAddressTxsChain(address, lastSeenTxid)
          : await getAddressTxs(address);
        break;
      } catch (error) {
        const waitMs = Math.min(10_000, 400 * (2 ** attempt));
        const isFinalAttempt = attempt === BRC20_PAGE_MAX_RETRIES - 1;
        console.warn(
          `[volume-data] BRC20: page ${pageNum} fetch failed (attempt ${attempt + 1}/${BRC20_PAGE_MAX_RETRIES})` +
            `${isFinalAttempt ? '' : `, retrying in ${waitMs}ms`}`,
          error
        );

        if (isFinalAttempt) {
          console.error(`[volume-data] BRC20: exhausted retries on page ${pageNum}, stopping`);
          break;
        }

        await sleep(waitMs);
      }
    }

    if (!page) {
      break;
    }

    if (!page || page.length === 0) break;

    let hitKnown = false;
    let allBeforeMinDate = true;
    for (const tx of page) {
      // Incremental mode: stop when we reach a transaction we already have
      if (knownTxids?.has(tx.txid)) {
        hitKnown = true;
        break;
      }
      if (tx.status?.block_time && tx.status.block_time >= minDateEpoch) {
        allBeforeMinDate = false;
      }
      const classified = classifyBrc20Tx(tx, address);
      if (classified) results.push(classified);
    }

    if (hitKnown) {
      console.log(`[volume-data] BRC20: caught up at page ${pageNum} (incremental)`);
      break;
    }

    // Txs are returned newest-first; if all on this page are before MIN_DATE, stop
    if (allBeforeMinDate) {
      console.log(`[volume-data] BRC20: all txs on page ${pageNum} before MIN_DATE, stopping`);
      break;
    }

    lastSeenTxid = page[page.length - 1].txid;
    if (page.length < 25) break;

    // Keep pressure low on mempool.space when scanning deep history.
    await sleep(BRC20_PAGE_DELAY_MS);

    if (pageNum % 20 === 0) {
      console.log(`[volume-data] BRC20: fetched ${pageNum} pages, ${results.length} txs so far...`);
    }
  }

  const wraps = results.filter(t => t.direction === "wrap").length;
  const unwraps = results.filter(t => t.direction === "unwrap").length;
  console.log(`[volume-data] BRC20: ${wraps} wraps, ${unwraps} unwraps (${pageNum} pages)`);
  return results;
}

// ============================================================================
// BRC20 — dedicated metashrew indexer (source of truth)
// ============================================================================

// The rockshrew-mono frBTC-on-BRC20-Prog volume indexer
// (crates/frbtc-brc20-volume-indexer) is the authoritative wrap/unwrap source:
// it processes Bitcoin blocks deterministically into per-day buckets, so we read
// it in one cheap `frbtc_volume_range` call instead of scanning the signer's
// whole tx history live on mempool.space (slow + rate-limited + truncates). Each
// day's gross wrapped / settled-unwrapped sats becomes one synthetic wrap and one
// unwrap ClassifiedTx (dated at UTC day-start) so it flows through the existing
// stats/candle aggregation unchanged. Returns null when the indexer env
// (FRBTC_BRC20_INDEXER_RPC_URL) is unset/unreachable, so the caller can fall back
// to the legacy esplora scan during the pre-deploy window.
async function fetchBrc20FromIndexer(): Promise<ClassifiedTx[] | null> {
  const from = truncDate(MIN_DATE, "day"); // e.g. "2025-10-01"
  const to = new Date().toISOString().slice(0, 10);
  let range;
  try {
    range = await getFrbtcVolumeRange(from, to, "brc20");
  } catch (error) {
    console.warn("[volume-data] BRC20 indexer unreachable, will fall back to scan:", error);
    return null;
  }
  if (!range) return null; // env unset → let the caller fall back

  const out: ClassifiedTx[] = [];
  for (const d of range.daily) {
    const blockTime = new Date(`${d.date}T00:00:00.000Z`);
    if (blockTime < MIN_DATE) continue;
    if (d.wrapped_sats > 0) {
      out.push({ txid: `brc20-wrap-${d.date}`, direction: "wrap", source: "brc20", volume_sats: d.wrapped_sats, block_time: blockTime });
    }
    if (d.unwrapped_sats > 0) {
      out.push({ txid: `brc20-unwrap-${d.date}`, direction: "unwrap", source: "brc20", volume_sats: d.unwrapped_sats, block_time: blockTime });
    }
  }
  console.log(`[volume-data] BRC20: ${range.daily.length} indexer day-buckets → ${out.length} synthetic txs (source of truth)`);
  return out;
}

// ============================================================================
// Aggregation
// ============================================================================

function aggregateStats(txs: ClassifiedTx[]): VolumeStats {
  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  const d7 = now - 7 * 24 * 60 * 60 * 1000;

  let wrap = 0, unwrap = 0, wrap24h = 0, unwrap24h = 0, wrap7d = 0, unwrap7d = 0;

  for (const tx of txs) {
    const t = tx.block_time.getTime();
    if (tx.direction === "wrap") {
      wrap += tx.volume_sats;
      if (t >= h24) wrap24h += tx.volume_sats;
      if (t >= d7) wrap7d += tx.volume_sats;
    } else {
      unwrap += tx.volume_sats;
      if (t >= h24) unwrap24h += tx.volume_sats;
      if (t >= d7) unwrap7d += tx.volume_sats;
    }
  }

  return {
    wrap_volume_sats: String(wrap),
    unwrap_volume_sats: String(unwrap),
    total_volume_sats: String(wrap + unwrap),
    wrap_24h_sats: String(wrap24h),
    unwrap_24h_sats: String(unwrap24h),
    wrap_7d_sats: String(wrap7d),
    unwrap_7d_sats: String(unwrap7d),
  };
}

function truncDate(d: Date, mode: "day" | "week"): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (mode === "week") {
    const day = utc.getUTCDay();
    utc.setUTCDate(utc.getUTCDate() - day);
  }
  return utc.toISOString().slice(0, 10);
}

interface BucketData {
  wrap: number;
  unwrap: number;
  alkanes_wrap: number;
  alkanes_unwrap: number;
  brc20_wrap: number;
  brc20_unwrap: number;
}

function emptyBucket(): BucketData {
  return { wrap: 0, unwrap: 0, alkanes_wrap: 0, alkanes_unwrap: 0, brc20_wrap: 0, brc20_unwrap: 0 };
}

function aggregateCandles(txs: ClassifiedTx[], interval: string, cumulative: boolean): CandleRow[] {
  const mode = interval === "1w" ? "week" : "day";
  const buckets = new Map<string, BucketData>();

  // Pre-fill every bucket from MIN_DATE to today so charts always start in early October
  const start = new Date(MIN_DATE);
  const today = new Date();
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (cursor <= today) {
    const key = truncDate(cursor, mode);
    if (!buckets.has(key)) buckets.set(key, emptyBucket());
    cursor.setUTCDate(cursor.getUTCDate() + (mode === "week" ? 7 : 1));
  }

  for (const tx of txs) {
    const key = truncDate(tx.block_time, mode);
    const b = buckets.get(key) || emptyBucket();
    const srcPrefix = tx.source === "alkanes" ? "alkanes" : "brc20";
    if (tx.direction === "wrap") {
      b.wrap += tx.volume_sats;
      b[`${srcPrefix}_wrap`] += tx.volume_sats;
    } else {
      b.unwrap += tx.volume_sats;
      b[`${srcPrefix}_unwrap`] += tx.volume_sats;
    }
    buckets.set(key, b);
  }

  const sorted = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));

  const toRow = (bucket: string, v: BucketData): CandleRow => ({
    bucket: new Date(bucket + "T00:00:00Z").toISOString(),
    wrap_sats: String(v.wrap),
    unwrap_sats: String(v.unwrap),
    alkanes_wrap_sats: String(v.alkanes_wrap),
    alkanes_unwrap_sats: String(v.alkanes_unwrap),
    brc20_wrap_sats: String(v.brc20_wrap),
    brc20_unwrap_sats: String(v.brc20_unwrap),
  });

  if (!cumulative) {
    return sorted.map(([bucket, v]) => toRow(bucket, v));
  }

  const cum = emptyBucket();
  return sorted.map(([bucket, v]) => {
    cum.wrap += v.wrap;
    cum.unwrap += v.unwrap;
    cum.alkanes_wrap += v.alkanes_wrap;
    cum.alkanes_unwrap += v.alkanes_unwrap;
    cum.brc20_wrap += v.brc20_wrap;
    cum.brc20_unwrap += v.brc20_unwrap;
    return toRow(bucket, { ...cum });
  });
}

// ============================================================================
// In-memory cache
// ============================================================================

let cachedTxs: ClassifiedTx[] | null = null;
let cacheTimestamp = 0;
let fetchPromise: Promise<ClassifiedTx[]> | null = null;

async function getAllTxs(): Promise<ClassifiedTx[]> {
  const now = Date.now();
  if (cachedTxs && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTxs;
  }

  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      console.log("[volume-data] Refreshing Alkanes + BRC20 volume data...");

      const [alkanesTxs, brc20Txs] = await Promise.all([
        fetchAllAlkanes(),
        // BRC20 source of truth = the dedicated metashrew indexer. Fall back to
        // the legacy esplora scan only while its env is unwired (pre-deploy).
        fetchBrc20FromIndexer().then((r) => r ?? fetchAllBrc20()),
      ]);

      // Deduplicate by txid (alkanes may repeat across data-API pages; the brc20
      // indexer's synthetic ids are unique per day+direction).
      const seen = new Set<string>();
      const deduped = [...alkanesTxs, ...brc20Txs].filter((tx) => {
        if (seen.has(tx.txid)) return false;
        seen.add(tx.txid);
        return true;
      });

      cachedTxs = deduped;
      cacheTimestamp = Date.now();
      console.log(`[volume-data] Cached ${deduped.length} transactions total`);
      return deduped;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

// ============================================================================
// Public API
// ============================================================================

export type SourceFilter = "both" | "alkanes" | "brc20";

function filterBySource(txs: ClassifiedTx[], source: SourceFilter): ClassifiedTx[] {
  if (source === "both") return txs;
  return txs.filter((tx) => tx.source === source);
}

export async function getVolumeStats(source: SourceFilter = "both"): Promise<VolumeStats> {
  const txs = await getAllTxs();
  return aggregateStats(filterBySource(txs, source));
}

export async function getVolumeCandles(interval: string, cumulative: boolean, source: SourceFilter = "both"): Promise<CandleRow[]> {
  const txs = await getAllTxs();
  return aggregateCandles(filterBySource(txs, source), interval, cumulative);
}

// Pre-warm cache on module load
getAllTxs().catch(() => {});
