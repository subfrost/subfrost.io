//! frBTC volume indexer — a lightweight metashrew WASM indexer.
//!
//! Indexes wrap (opcode 77) and unwrap (opcode 78) activity of the frBTC
//! alkane (AlkaneId `32:0`) and buckets satoshi volume by UTC day, so the
//! protocol fee revenue (0.3% = 3/1000 of wrap+unwrap volume) can be computed
//! from a single view call.
//!
//! It is intentionally standalone: it decodes each block's transactions with
//! the same consensus-accurate runestone/protostone decoder the real alkanes
//! indexer uses (`ordinals` + `protorune-support`), but keeps its own tiny
//! key-value schema instead of tracking full protorune balances.
//!
//! # Host ABI (metashrew)
//! `input()` returns `[u32 height (LE)] ++ consensus-encoded bitcoin::Block`.
//! We `get`/`set` a handful of keys and `flush()` at the end of `_start`.
//!
//! # KV schema
//! * `/frbtc_volume/daily/<YYYY-MM-DD>` -> 40 bytes, little-endian packed:
//!   `[wrapped_sats: u128][unwrapped_sats: u128][wrap_count: u32][unwrap_count: u32]`
//! * `/frbtc_volume/tip`               -> `height: u32` (LE)
//! * `/frbtc_volume/signer_script`     -> the currently-active signer P2TR
//!   scriptPubKey bytes (34 bytes for P2TR). Tracks `set-signer`/`initialize`
//!   rotations so wrap-crediting stays correct across key rotation.
//!
//! # View functions (metashrew_view)
//! * `frbtc_volume_range` — input is JSON `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}`,
//!   returns `{ daily: [...], totals: {...} }`.
//! * `frbtc_volume_tip`   — no input, returns `{ "tip": <height> }`.

use std::cmp::min;
use std::io::Cursor;
use std::sync::Arc;

use bitcoin::consensus::Decodable;
use bitcoin::{Block, ScriptBuf, Transaction};
use metashrew_core::{export_bytes, flush, get, input, set};
use ordinals::{Artifact, Runestone};
use protorune_support::protostone::Protostone;
use protorune_support::utils::decode_varint_list;
use serde::Serialize;

// ---------------------------------------------------------------------------
// frBTC protocol facts (see subfrost-alkanes/alkanes/fr-btc/{alkanes.toml,src/lib.rs}
// and crates/fr-btc-support/src/lib.rs).
// ---------------------------------------------------------------------------

/// frBTC alkane id: block 32, tx 0.
const FRBTC_BLOCK: u128 = 32;
const FRBTC_TX: u128 = 0;

/// Alkanes protocol tag (AlkaneMessageContext::protocol_tag()).
const ALKANES_PROTOCOL_TAG: u128 = 1;

// Opcodes from alkanes/fr-btc/alkanes.toml
const OP_INITIALIZE: u128 = 0;
const OP_SET_SIGNER: u128 = 1;
const OP_WRAP: u128 = 77;
const OP_UNWRAP: u128 = 78;

/// Genesis default signer x-only pubkey (fr-btc-support DEFAULT_SIGNER_PUBKEY).
/// The active signer scriptPubKey is BIP86 tap-tweak(this) unless rotated via
/// `set-signer` / `initialize`.
const DEFAULT_SIGNER_PUBKEY: [u8; 32] = [
    0x79, 0x40, 0xef, 0x3b, 0x65, 0x91, 0x79, 0xa1, 0x37, 0x1d, 0xec, 0x05, 0x79, 0x3c, 0xb0, 0x27,
    0xcd, 0xe4, 0x78, 0x06, 0xfb, 0x66, 0xce, 0x1e, 0x3d, 0x1b, 0x69, 0xd5, 0x6d, 0xe6, 0x29, 0xdc,
];

const FEE_PER_1000: u128 = 3; // 0.3% protocol fee on wrap + unwrap volume.

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

const TIP_KEY: &[u8] = b"/frbtc_volume/tip";
const SIGNER_KEY: &[u8] = b"/frbtc_volume/signer_script";
const DAILY_PREFIX: &str = "/frbtc_volume/daily/";

fn daily_key(date: &str) -> Vec<u8> {
    format!("{DAILY_PREFIX}{date}").into_bytes()
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
// Signer script handling
// ---------------------------------------------------------------------------

fn is_p2tr(script: &[u8]) -> bool {
    script.len() == 34 && script[0] == 0x51 && script[1] == 0x20
}

/// Derive the BIP86 tap-tweaked P2TR scriptPubKey for the genesis default
/// signer x-only key — mirrors `get_signer_script()` in the frBTC contract.
fn default_signer_script() -> ScriptBuf {
    use bitcoin::key::TapTweak;
    let secp = bitcoin::secp256k1::Secp256k1::verification_only();
    let xonly = bitcoin::secp256k1::XOnlyPublicKey::from_slice(&DEFAULT_SIGNER_PUBKEY)
        .expect("invalid default signer x-only pubkey");
    let (tweaked, _parity) = xonly.tap_tweak(&secp, None);
    ScriptBuf::new_p2tr_tweaked(tweaked)
}

/// Load the currently-active signer scriptPubKey bytes. Falls back to the
/// tap-tweaked genesis default when nothing has been persisted yet.
fn load_signer_script() -> Vec<u8> {
    let stored = kv_get(SIGNER_KEY);
    if is_p2tr(&stored) {
        stored
    } else {
        default_signer_script().as_bytes().to_vec()
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

    // Active signer script, updated live so a `set-signer` earlier in the
    // block affects wraps later in the same block (matches contract ordering).
    let mut signer_script = load_signer_script();
    let mut signer_dirty = false;

    for tx in &block.txdata {
        let runestone = match Runestone::decipher(tx) {
            Some(Artifact::Runestone(rs)) => rs,
            _ => continue,
        };
        let protostones = Protostone::from_runestone(&runestone).unwrap_or_default();

        for ps in &protostones {
            if ps.protocol_tag != ALKANES_PROTOCOL_TAG || ps.message.is_empty() {
                continue;
            }
            // The protostone message is the LEB-encoded cellpack:
            // [block, tx, opcode, ..inputs] as a varint list.
            let vals = match decode_varint_list(&mut Cursor::new(ps.message.clone())) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if vals.len() < 3 || vals[0] != FRBTC_BLOCK || vals[1] != FRBTC_TX {
                continue;
            }
            let opcode = vals[2];

            match opcode {
                OP_WRAP => {
                    // Coinbase wraps mint ftr-btc futures from the block
                    // subsidy — protocol-internal, not user wrap volume.
                    if tx.is_coinbase() {
                        continue;
                    }
                    let wrapped = wrap_value(tx, &signer_script);
                    if wrapped > 0 {
                        acc.wrapped_sats = acc.wrapped_sats.saturating_add(wrapped);
                        acc.wrap_count = acc.wrap_count.saturating_add(1);
                    }
                }
                OP_UNWRAP => {
                    let burned = unwrap_value(&vals, ps);
                    if burned > 0 {
                        acc.unwrapped_sats = acc.unwrapped_sats.saturating_add(burned);
                        acc.unwrap_count = acc.unwrap_count.saturating_add(1);
                    }
                }
                OP_SET_SIGNER => {
                    // set-signer(vout): new signer = tx.output[vout].script_pubkey
                    if let Some(vout) = vals.get(3).and_then(|v| usize::try_from(*v).ok()) {
                        if let Some(out) = tx.output.get(vout) {
                            let spk = out.script_pubkey.as_bytes();
                            if is_p2tr(spk) {
                                signer_script = spk.to_vec();
                                signer_dirty = true;
                            }
                        }
                    }
                }
                OP_INITIALIZE => {
                    // initialize(): if the first output is P2TR it becomes the signer.
                    if let Some(out) = tx.output.first() {
                        let spk = out.script_pubkey.as_bytes();
                        if is_p2tr(spk) {
                            signer_script = spk.to_vec();
                            signer_dirty = true;
                        }
                    }
                }
                _ => {}
            }
        }
    }

    if signer_dirty {
        kv_set(SIGNER_KEY, signer_script);
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

/// Wrapped volume for a wrap tx = sum of output values whose scriptPubKey
/// matches the active signer script (exactly `compute_output()` in the
/// contract). This is the pre-fee BTC deposited to the signer.
fn wrap_value(tx: &Transaction, signer_script: &[u8]) -> u128 {
    tx.output
        .iter()
        .filter(|o| o.script_pubkey.as_bytes() == signer_script)
        .fold(0u128, |acc, o| acc.saturating_add(o.value.to_sat() as u128))
}

/// Unwrapped volume for an unwrap protostone.
///
/// The frBTC contract burns `min(amount_requested, frbtc_sent)` where
/// `amount_requested` is cellpack input[2] (vals\[4]) and `frbtc_sent` is the
/// incoming 32:0 alkane balance routed into the protomessage.
///
/// ASSUMPTION: a standalone indexer that does not track full protorune
/// balances cannot always observe `frbtc_sent` — the frBTC being unwrapped
/// usually enters as the protomessage's runtime balance (from a spent frBTC
/// UTXO) rather than as an explicit edict, so protostone edicts are frequently
/// empty on a valid unwrap. We therefore use `amount_requested` as the
/// unwrapped volume, and when 32:0 edicts *are* present in the same protostone
/// we take `min(amount_requested, edict_sum)` to mirror the contract's cap.
/// In the normal wallet-constructed flow `amount_requested == frbtc_sent`, so
/// this equals the true burned amount; a hostile over-request would be capped
/// on-chain but slightly over-counted here (negligible for revenue estimation).
fn unwrap_value(vals: &[u128], ps: &Protostone) -> u128 {
    let amount_requested = vals.get(4).copied().unwrap_or(0);

    let edict_sum: u128 = ps
        .edicts
        .iter()
        .filter(|e| e.id.block == FRBTC_BLOCK && e.id.tx == FRBTC_TX)
        .fold(0u128, |acc, e| acc.saturating_add(e.amount));

    if edict_sum > 0 {
        min(amount_requested, edict_sum)
    } else {
        amount_requested
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
    fn default_signer_is_p2tr() {
        let s = default_signer_script();
        assert!(is_p2tr(s.as_bytes()));
    }
}
