/**
 * Volume data service — fetches wrap/unwrap volume from:
 *   1. Alkanes: Subfrost data API (same source as subfrost-app)
 *   2. BRC20:   the dedicated frBTC-on-BRC20-Prog volume indexer
 *               (lib/frbtc-brc20-volume.ts) — the authoritative on-chain source,
 *               replacing the old mempool.space signer-address heuristic.
 *
 * Results are cached in-memory with a 15-minute TTL.
 */

import { getBrc20VolumeRange } from "./frbtc-brc20-volume";

// Alkanes wrap/unwrap history lives on canon Espo at alkanode. The subfrost.io
// REST sub-paths return empty data — per flex (alkanes-rs maintainer): all
// /v4/subfrost/* REST routes other than BTC pricing are espo routes that
// should be bypassed and go directly to alkanode.
const DATA_API = process.env.ALKANODE_DATA_API || "https://oyl.alkanode.com";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const PAGE_SIZE = 200; // Data API max per request
const MIN_DATE = new Date("2025-10-01T00:00:00Z");

// ---------- Shared types ----------

interface ClassifiedTx {
  txid: string;
  direction: "wrap" | "unwrap";
  source: "alkanes" | "brc20";
  volume_sats: number;
  block_time: Date;
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
// BRC20 (frBTC on BRC20-Prog) — dedicated volume indexer
// ============================================================================
//
// frBTC-on-BRC20-Prog wrap/unwrap volume comes from the dedicated
// frbtc-brc20-volume-indexer (subvh), read via lib/frbtc-brc20-volume.ts. It is
// the sibling of the alkanes frBTC indexer — an authoritative on-chain
// net-BTC-flow model that returns pre-aggregated per-UTC-day wrap/unwrap sats,
// replacing the old mempool.space signer-address-scanning heuristic.
//
// The daily buckets are projected into the shared ClassifiedTx shape — one wrap
// + one unwrap synthetic record per day, timestamped at the bucket's UTC
// midnight — so the existing stats/candles aggregation (incl. the per-source
// alkanes/brc20 split) is unchanged. Day granularity is inherent to the indexer;
// the 24h/7d windows therefore resolve to whole UTC days on the BRC20 side.

async function fetchAllBrc20(): Promise<ClassifiedTx[]> {
  const range = await getBrc20VolumeRange();
  if (!range) {
    console.log("[volume-data] BRC20: indexer unset/unreachable — 0 records");
    return [];
  }

  const results: ClassifiedTx[] = [];
  for (const day of range.daily) {
    const blockTime = new Date(`${day.date}T00:00:00Z`);
    if (Number.isNaN(blockTime.getTime())) continue;
    if (day.wrapped_sats > 0) {
      results.push({
        txid: `brc20:wrap:${day.date}`,
        direction: "wrap",
        source: "brc20",
        volume_sats: day.wrapped_sats,
        block_time: blockTime,
      });
    }
    if (day.unwrapped_sats > 0) {
      results.push({
        txid: `brc20:unwrap:${day.date}`,
        direction: "unwrap",
        source: "brc20",
        volume_sats: day.unwrapped_sats,
        block_time: blockTime,
      });
    }
  }

  console.log(
    `[volume-data] BRC20: ${range.daily.length} day-buckets ` +
      `(${range.totals.wrap_count} wraps / ${range.totals.unwrap_count} unwraps total)`
  );
  return results;
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
      // Alkanes = full data-API fetch; BRC20 = one pre-aggregated indexer call.
      // Both are cheap enough to refresh wholesale, and their id spaces never
      // collide (alkanes txids vs synthetic `brc20:<dir>:<date>` keys).
      console.log("[volume-data] Fetching Alkanes + BRC20 volume data...");

      const [alkanesTxs, brc20Txs] = await Promise.all([
        fetchAllAlkanes(),
        fetchAllBrc20(),
      ]);

      cachedTxs = [...alkanesTxs, ...brc20Txs];
      cacheTimestamp = Date.now();
      console.log(`[volume-data] Cached ${cachedTxs.length} records total`);
      return cachedTxs;
    } catch (error) {
      // On a refresh failure, keep serving the last good cache rather than
      // dropping the whole surface to empty.
      if (cachedTxs) {
        console.warn("[volume-data] refresh failed, serving stale cache", error);
        return cachedTxs;
      }
      throw error;
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
