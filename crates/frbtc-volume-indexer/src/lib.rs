//! frBTC volume indexer — a lightweight metashrew WASM indexer.
//!
//! Indexes wrap / unwrap BTC volume of frBTC by **signer-reserve accounting**
//! and buckets satoshi volume by UTC day, so the protocol fee revenue
//! (0.3% = 3/1000 of wrap+unwrap volume) can be computed from a single view
//! call.
//!
//! The frBTC signer is a single fixed P2TR reserve address that never rotated.
//! Rather than decoding alkanes protostones (which over-counts unwraps because
//! the unwrap cellpack's `amount_requested` is not the BTC actually released),
//! we track the signer's Bitcoin UTXO set and account real BTC flows:
//!
//! * **wrap volume**  = BTC paid *into* the signer reserve (deposits).
//! * **unwrap volume** = BTC the signer pays *out to others* (its own change is
//!   excluded, since change simply becomes a new signer UTXO).
//!
//! # Host ABI (metashrew)
//! `input()` returns `[u32 height (LE)] ++ consensus-encoded bitcoin::Block`.
//! We `get`/`set` a handful of keys and `flush()` at the end of `_start`.
//!
//! # KV schema
//! * `/frbtc_volume/daily/<YYYY-MM-DD>` -> 40 bytes, little-endian packed:
//!   `[wrapped_sats: u128][unwrapped_sats: u128][wrap_count: u32][unwrap_count: u32]`
//! * `/frbtc_volume/tip`               -> `height: u32` (LE)
//! * `/frbtc_volume/u/<txid:32><vout:u32-le>` -> the outpoint's value as
//!   `u64` LE (8 bytes) while it is an unspent signer UTXO; empty once spent.
//!   A non-empty `get` means "this outpoint is a live signer UTXO".
//!
//! # View functions (metashrew_view)
//! * `frbtc_volume_range` — input is JSON `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}`,
//!   returns `{ daily: [...], totals: {...} }`.
//! * `frbtc_volume_tip`   — no input, returns `{ "tip": <height> }`.

use std::io::Cursor;
use std::str::FromStr;
use std::sync::Arc;

use bitcoin::consensus::Decodable;
use bitcoin::hashes::Hash;
use bitcoin::{Address, Block, Network, Txid};
use metashrew_core::{export_bytes, flush, get, input, set};
use serde::Serialize;

// ---------------------------------------------------------------------------
// frBTC protocol facts.
// ---------------------------------------------------------------------------

/// The frBTC signer's fixed P2TR reserve address (mainnet). This address never
/// rotated — see `SIGNER_P2TR_MAINNET` in subfrost-wallet-api/src/unwrap.rs.
const SIGNER_P2TR_MAINNET: &str = "bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7";

const FEE_PER_1000: u128 = 3; // 0.3% protocol fee on wrap + unwrap volume.

/// The signer's scriptPubKey bytes, derived once from `SIGNER_P2TR_MAINNET`.
/// Requires the address to be Bitcoin mainnet.
fn signer_script() -> Vec<u8> {
    let addr = Address::from_str(SIGNER_P2TR_MAINNET)
        .expect("valid signer P2TR address")
        .require_network(Network::Bitcoin)
        .expect("signer address must be Bitcoin mainnet");
    addr.script_pubkey().as_bytes().to_vec()
}

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

const TIP_KEY: &[u8] = b"/frbtc_volume/tip";
const UTXO_PREFIX: &[u8] = b"/frbtc_volume/u/";
const DAILY_PREFIX: &str = "/frbtc_volume/daily/";

fn daily_key(date: &str) -> Vec<u8> {
    format!("{DAILY_PREFIX}{date}").into_bytes()
}

/// KV key identifying a signer UTXO: `/frbtc_volume/u/<txid:32><vout:u32-le>`.
fn utxo_key(txid: &Txid, vout: u32) -> Vec<u8> {
    let mut k = Vec::with_capacity(UTXO_PREFIX.len() + 32 + 4);
    k.extend_from_slice(UTXO_PREFIX);
    k.extend_from_slice(&txid.to_byte_array());
    k.extend_from_slice(&vout.to_le_bytes());
    k
}

fn kv_get(key: &[u8]) -> Vec<u8> {
    get(Arc::new(key.to_vec())).as_ref().clone()
}

fn kv_set(key: &[u8], val: Vec<u8>) {
    set(Arc::new(key.to_vec()), Arc::new(val));
}

// ---------------------------------------------------------------------------
// Daily record (40 bytes LE packed)
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Copy)]
struct Daily {
    wrapped_sats: u128,
    unwrapped_sats: u128,
    wrap_count: u32,
    unwrap_count: u32,
}

impl Daily {
    fn decode(bytes: &[u8]) -> Daily {
        if bytes.len() < 40 {
            return Daily::default();
        }
        Daily {
            wrapped_sats: u128::from_le_bytes(bytes[0..16].try_into().unwrap()),
            unwrapped_sats: u128::from_le_bytes(bytes[16..32].try_into().unwrap()),
            wrap_count: u32::from_le_bytes(bytes[32..36].try_into().unwrap()),
            unwrap_count: u32::from_le_bytes(bytes[36..40].try_into().unwrap()),
        }
    }

    fn encode(&self) -> Vec<u8> {
        let mut v = Vec::with_capacity(40);
        v.extend_from_slice(&self.wrapped_sats.to_le_bytes());
        v.extend_from_slice(&self.unwrapped_sats.to_le_bytes());
        v.extend_from_slice(&self.wrap_count.to_le_bytes());
        v.extend_from_slice(&self.unwrap_count.to_le_bytes());
        v
    }
}

// ---------------------------------------------------------------------------
// Indexer entrypoint
// ---------------------------------------------------------------------------

#[cfg(not(test))]
#[no_mangle]
pub extern "C" fn _start() {
    let data = input();
    if data.len() < 4 {
        flush();
        return;
    }
    let height = u32::from_le_bytes(data[0..4].try_into().unwrap());
    let block = match Block::consensus_decode(&mut Cursor::new(&data[4..])) {
        Ok(b) => b,
        Err(_) => {
            // Not a decodable bitcoin block — still advance the tip.
            kv_set(TIP_KEY, height.to_le_bytes().to_vec());
            flush();
            return;
        }
    };

    index_block(height, &block);

    // Always advance the tip so `frbtc_volume_tip` reflects real progress
    // even for blocks with no frBTC activity.
    kv_set(TIP_KEY, height.to_le_bytes().to_vec());
    flush();
}

fn index_block(_height: u32, block: &Block) {
    // All txs in a block share one UTC day (derived from the block timestamp).
    let (y, m, d) = civil_from_days((block.header.time as i64) / 86_400);
    let date = format!("{y:04}-{m:02}-{d:02}");

    // Per-block accumulators (folded into the daily record once at the end).
    let mut acc = Daily::default();

    let signer = signer_script();

    for tx in &block.txdata {
        // Coinbase txs never spend or fund the signer meaningfully.
        if tx.is_coinbase() {
            continue;
        }

        // 1) Detect (and consume) any inputs spending a live signer UTXO.
        let mut is_signer_spend = false;
        for input in &tx.input {
            let key = utxo_key(&input.previous_output.txid, input.previous_output.vout);
            if !kv_get(&key).is_empty() {
                is_signer_spend = true;
                kv_set(&key, Vec::new()); // consume
            }
        }

        // 2) Sum outputs paying the signer vs. everyone else.
        let mut to_signer = 0u128;
        let mut to_others = 0u128;
        for out in &tx.output {
            let val = out.value.to_sat() as u128;
            if out.script_pubkey.as_bytes() == signer.as_slice() {
                to_signer = to_signer.saturating_add(val);
            } else {
                to_others = to_others.saturating_add(val);
            }
        }

        // 3) Register every signer-paying output of this tx as a new signer UTXO.
        let txid = tx.compute_txid();
        for (vout, out) in tx.output.iter().enumerate() {
            if out.script_pubkey.as_bytes() == signer.as_slice() {
                let key = utxo_key(&txid, vout as u32);
                kv_set(&key, out.value.to_sat().to_le_bytes().to_vec());
            }
        }

        // 4) Classify.
        if is_signer_spend {
            // Unwrap (or self-consolidation). The signer released `to_others`
            // BTC; any output back to the signer is its own change (already
            // registered in step 3) and is correctly excluded here.
            acc.unwrapped_sats = acc.unwrapped_sats.saturating_add(to_others);
            if to_others > 0 {
                acc.unwrap_count = acc.unwrap_count.saturating_add(1);
            }
        } else if to_signer > 0 {
            // Wrap deposit: BTC flowing into the signer reserve.
            acc.wrapped_sats = acc.wrapped_sats.saturating_add(to_signer);
            acc.wrap_count = acc.wrap_count.saturating_add(1);
        }
        // else: unrelated tx — skip.
    }

    if acc.wrap_count > 0 || acc.unwrap_count > 0 {
        let key = daily_key(&date);
        let mut daily = Daily::decode(&kv_get(&key));
        daily.wrapped_sats = daily.wrapped_sats.saturating_add(acc.wrapped_sats);
        daily.unwrapped_sats = daily.unwrapped_sats.saturating_add(acc.unwrapped_sats);
        daily.wrap_count = daily.wrap_count.saturating_add(acc.wrap_count);
        daily.unwrap_count = daily.unwrap_count.saturating_add(acc.unwrap_count);
        kv_set(&key, daily.encode());
    }
}

// ---------------------------------------------------------------------------
// View functions
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct DailyEntry {
    date: String,
    wrapped_sats: String,
    unwrapped_sats: String,
    wrap_count: u32,
    unwrap_count: u32,
}

#[derive(Serialize)]
struct Totals {
    wrapped_sats: String,
    unwrapped_sats: String,
    volume_sats: String,
    wrap_count: u32,
    unwrap_count: u32,
    /// 0.3% (3/1000) of (wrapped + unwrapped) volume, in sats.
    fee_revenue_sats: String,
}

#[derive(Serialize)]
struct RangeResponse {
    daily: Vec<DailyEntry>,
    totals: Totals,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

/// Strip an optional leading 4-byte height prefix some RPC callers prepend,
/// returning the JSON argument bytes.
fn view_arg_bytes(data: &[u8]) -> &[u8] {
    if data.first() == Some(&b'{') {
        data
    } else if data.len() > 4 && data[4] == b'{' {
        &data[4..]
    } else {
        data
    }
}

fn json_bytes<T: Serialize>(v: &T) -> Vec<u8> {
    serde_json::to_vec(v).unwrap_or_else(|_| b"{\"error\":\"serialize\"}".to_vec())
}

/// `frbtc_volume_range` — input JSON `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}`.
#[cfg(not(test))]
#[no_mangle]
pub extern "C" fn frbtc_volume_range() -> i32 {
    let data = input();
    let arg = view_arg_bytes(&data);

    let req: serde_json::Value = match serde_json::from_slice(arg) {
        Ok(v) => v,
        Err(e) => {
            return export_bytes(json_bytes(&ErrorResponse {
                error: format!("invalid JSON input: {e}"),
            }))
        }
    };

    let from = req.get("from").and_then(|v| v.as_str()).unwrap_or("");
    let to = req.get("to").and_then(|v| v.as_str()).unwrap_or("");

    let (from_day, to_day) = match (parse_date(from), parse_date(to)) {
        (Some(a), Some(b)) => (a, b),
        _ => {
            return export_bytes(json_bytes(&ErrorResponse {
                error: "missing or invalid 'from'/'to' (expected YYYY-MM-DD)".to_string(),
            }))
        }
    };
    let (lo, hi) = if from_day <= to_day {
        (from_day, to_day)
    } else {
        (to_day, from_day)
    };
    // Guard against absurd ranges.
    if hi - lo > 366 * 50 {
        return export_bytes(json_bytes(&ErrorResponse {
            error: "range too large (max ~50 years)".to_string(),
        }));
    }

    let mut daily = Vec::new();
    let mut tot_wrapped = 0u128;
    let mut tot_unwrapped = 0u128;
    let mut tot_wrap_count = 0u32;
    let mut tot_unwrap_count = 0u32;

    for day in lo..=hi {
        let (y, m, d) = civil_from_days(day);
        let date = format!("{y:04}-{m:02}-{d:02}");
        let raw = kv_get(&daily_key(&date));
        if raw.len() < 40 {
            continue;
        }
        let rec = Daily::decode(&raw);
        tot_wrapped = tot_wrapped.saturating_add(rec.wrapped_sats);
        tot_unwrapped = tot_unwrapped.saturating_add(rec.unwrapped_sats);
        tot_wrap_count = tot_wrap_count.saturating_add(rec.wrap_count);
        tot_unwrap_count = tot_unwrap_count.saturating_add(rec.unwrap_count);
        daily.push(DailyEntry {
            date,
            wrapped_sats: rec.wrapped_sats.to_string(),
            unwrapped_sats: rec.unwrapped_sats.to_string(),
            wrap_count: rec.wrap_count,
            unwrap_count: rec.unwrap_count,
        });
    }

    let volume = tot_wrapped.saturating_add(tot_unwrapped);
    let fee = volume.saturating_mul(FEE_PER_1000) / 1000;

    let resp = RangeResponse {
        daily,
        totals: Totals {
            wrapped_sats: tot_wrapped.to_string(),
            unwrapped_sats: tot_unwrapped.to_string(),
            volume_sats: volume.to_string(),
            wrap_count: tot_wrap_count,
            unwrap_count: tot_unwrap_count,
            fee_revenue_sats: fee.to_string(),
        },
    };
    export_bytes(json_bytes(&resp))
}

#[derive(Serialize)]
struct TipResponse {
    tip: u32,
}

/// `frbtc_volume_tip` — no input, returns the highest indexed height.
#[cfg(not(test))]
#[no_mangle]
pub extern "C" fn frbtc_volume_tip() -> i32 {
    let raw = kv_get(TIP_KEY);
    let tip = if raw.len() >= 4 {
        u32::from_le_bytes(raw[0..4].try_into().unwrap())
    } else {
        0
    };
    export_bytes(json_bytes(&TipResponse { tip }))
}

// ---------------------------------------------------------------------------
// Civil calendar helpers (Howard Hinnant's algorithms, public domain).
// Convert between a UTC date and a day-count since 1970-01-01.
// ---------------------------------------------------------------------------

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

/// Parse `YYYY-MM-DD` into a day-count since the unix epoch.
fn parse_date(s: &str) -> Option<i64> {
    let mut it = s.split('-');
    let y: i64 = it.next()?.parse().ok()?;
    let m: i64 = it.next()?.parse().ok()?;
    let d: i64 = it.next()?.parse().ok()?;
    if it.next().is_some() || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(days_from_civil(y, m, d))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_roundtrip() {
        for &(y, m, d) in &[
            (1970, 1, 1),
            (2009, 1, 3),
            (2024, 2, 29),
            (2025, 12, 31),
            (2000, 3, 1),
        ] {
            let days = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(days), (y, m, d));
            assert_eq!(parse_date(&format!("{y:04}-{m:02}-{d:02}")), Some(days));
        }
    }

    #[test]
    fn timestamp_to_date() {
        // 2024-01-01 00:00:00 UTC = 1704067200
        let (y, m, d) = civil_from_days(1_704_067_200i64 / 86_400);
        assert_eq!((y, m, d), (2024, 1, 1));
    }

    #[test]
    fn daily_codec() {
        let rec = Daily {
            wrapped_sats: 123_456_789,
            unwrapped_sats: 987_654_321,
            wrap_count: 7,
            unwrap_count: 3,
        };
        let bytes = rec.encode();
        assert_eq!(bytes.len(), 40);
        let back = Daily::decode(&bytes);
        assert_eq!(back.wrapped_sats, rec.wrapped_sats);
        assert_eq!(back.unwrapped_sats, rec.unwrapped_sats);
        assert_eq!(back.wrap_count, rec.wrap_count);
        assert_eq!(back.unwrap_count, rec.unwrap_count);
    }

    #[test]
    fn signer_script_is_mainnet_p2tr() {
        // The fixed signer reserve must resolve to a 34-byte P2TR
        // scriptPubKey (OP_1 <0x20> <32-byte x-only key>).
        let s = signer_script();
        assert_eq!(s.len(), 34);
        assert_eq!(s[0], 0x51);
        assert_eq!(s[1], 0x20);
    }

    #[test]
    fn utxo_key_layout() {
        let txid = Txid::from_byte_array([0xabu8; 32]);
        let k = utxo_key(&txid, 7);
        assert_eq!(k.len(), UTXO_PREFIX.len() + 32 + 4);
        assert!(k.starts_with(UTXO_PREFIX));
        assert_eq!(&k[UTXO_PREFIX.len()..UTXO_PREFIX.len() + 32], &[0xabu8; 32]);
        assert_eq!(&k[UTXO_PREFIX.len() + 32..], &7u32.to_le_bytes());
    }
}
