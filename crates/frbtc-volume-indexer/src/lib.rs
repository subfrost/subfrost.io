//! frBTC volume indexer — a lightweight metashrew WASM indexer.
//!
//! Indexes wrap (opcode 77) / unwrap (opcode 78) BTC volume of the frBTC alkane
//! (`AlkaneId 32:0`) per UTC day, faithfully to the on-chain contract
//! (`subfrost-alkanes/alkanes/fr-btc/src/lib.rs`), so protocol fee revenue and
//! settlement flows can be read from a single view call.
//!
//! ## Contract-faithful accounting
//!
//! * **Wrap (op 77):** the user pays BTC to the signer P2TR; the contract mints
//!   `deposit − deposit·premium/1e8` frBTC (premium default `100_000` = 0.1%).
//!   We credit `wrapped_sats += Σ outputs to signer` (gross, `compute_output()`)
//!   and derive minted/fee from the premium. The 0.1% never-minted remainder is
//!   the *only* protocol fee and stays as BTC in the signer wallet.
//!
//! * **Unwrap (op 78):** the user burns frBTC; the contract records a
//!   `Payment{recipient, value = frBTC burned}` and drops a **signer-owned
//!   anchor output** (`tx.output[vout]`, the "546-sat dust") which the signer
//!   later spends to settle. Payout is **1:1** with frBTC burned — no unwrap
//!   fee. Because the burned amount is not observable from the burn tx alone
//!   (it needs alkanes state), we measure unwrap volume by **payout-matching**:
//!   we flag the burn's anchor output, and when a later signer tx *spends* that
//!   anchor we count the BTC it pays to non-signer recipients as the settled
//!   unwrap volume. This is exactly `value_to_burn` and cannot be inflated by a
//!   hostile `amount_requested` (the old bug).
//!
//! * **Sweeps:** a signer spend that does *not* spend an anchor is a reserve /
//!   fee withdrawal (subfrost moving BTC off the signer), tracked separately —
//!   NOT counted as unwrap volume.
//!
//! * **Miner fees:** for fully-signer-funded spends we add `Σ spent signer
//!   value − Σ outputs`. Reported as a single cumulative total (the BTC the
//!   signer pays Bitcoin miners to settle unwraps / consolidate).
//!
//! # Host ABI (metashrew)
//! `input()` = `[u32 height (LE)] ++ consensus-encoded bitcoin::Block`.
//!
//! # KV schema
//! * `/frbtc_volume/daily/<YYYY-MM-DD>` -> 72 bytes LE packed (see `Daily`).
//! * `/frbtc_volume/tip`               -> `height: u32` (LE)
//! * `/frbtc_volume/signer_script`     -> active signer P2TR scriptPubKey.
//! * `/frbtc_volume/u/<txid:32><vout:u32-le>` -> `[value:u64 LE][anchor:u8]`
//!   while a live signer UTXO; empty once spent. `anchor=1` ⇒ created by an
//!   op-78 burn (its spend settles an unwrap).

use std::io::Cursor;
use std::str::FromStr;
use std::sync::Arc;

use bitcoin::consensus::Decodable;
use bitcoin::hashes::Hash;
use bitcoin::{Address, Block, Network, Transaction, Txid};
use metashrew_core::{export_bytes, flush, get, input, set};
use ordinals::{Artifact, Runestone};
use protorune_support::protostone::Protostone;
use protorune_support::utils::decode_varint_list;
use serde::Serialize;

// ---------------------------------------------------------------------------
// frBTC protocol facts (subfrost-alkanes/alkanes/fr-btc + fr-btc-support).
// ---------------------------------------------------------------------------

const FRBTC_BLOCK: u128 = 32;
const FRBTC_TX: u128 = 0;
const ALKANES_PROTOCOL_TAG: u128 = 1;

const OP_INITIALIZE: u128 = 0;
const OP_SET_SIGNER: u128 = 1;
const OP_WRAP: u128 = 77;
const OP_UNWRAP: u128 = 78;

/// Wrap premium (fee) numerator over 1e8. Default `100_000` = 0.1% (fr-btc
/// `premium()`); owner-settable via op 4 but static on mainnet. frBTC minted =
/// `deposit − deposit·PREMIUM/1e8`; the difference is subfrost revenue.
const PREMIUM: u128 = 100_000;
const PREMIUM_DENOM: u128 = 100_000_000;

/// The frBTC signer's fixed mainnet P2TR reserve (DEFAULT_SIGNER_PUBKEY
/// tap-tweaked). Never rotated. Used as the default when no `set-signer` seen.
const SIGNER_P2TR_MAINNET: &str = "bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7";

/// Bitcoin dust threshold for P2TR — the anchor / alkane-refund marker size.
const DUST_SATS: u64 = 546;

fn default_signer_script() -> Vec<u8> {
    Address::from_str(SIGNER_P2TR_MAINNET)
        .expect("valid signer P2TR address")
        .require_network(Network::Bitcoin)
        .expect("signer address must be Bitcoin mainnet")
        .script_pubkey()
        .as_bytes()
        .to_vec()
}

fn is_p2tr(spk: &[u8]) -> bool {
    spk.len() == 34 && spk[0] == 0x51 && spk[1] == 0x20
}

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

const TIP_KEY: &[u8] = b"/frbtc_volume/tip";
const SIGNER_KEY: &[u8] = b"/frbtc_volume/signer_script";
const UTXO_PREFIX: &[u8] = b"/frbtc_volume/u/";
const DAILY_PREFIX: &str = "/frbtc_volume/daily/";

fn daily_key(date: &str) -> Vec<u8> {
    format!("{DAILY_PREFIX}{date}").into_bytes()
}

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

fn load_signer_script() -> Vec<u8> {
    let raw = kv_get(SIGNER_KEY);
    if is_p2tr(&raw) {
        raw
    } else {
        default_signer_script()
    }
}

// ---------------------------------------------------------------------------
// Daily record (72 bytes LE packed)
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Copy)]
struct Daily {
    /// Gross BTC deposited to the signer on op-77 wraps (`compute_output`).
    wrapped_sats: u128,
    /// BTC settled to redeemers on op-78 unwraps (payout-matched, 1:1 w/ burn).
    unwrapped_sats: u128,
    /// BTC swept off the signer that is NOT an unwrap settlement (reserve/fee
    /// withdrawals — subfrost moving BTC to its own external addresses).
    swept_sats: u128,
    /// Bitcoin miner fees the signer paid on fully-signer-funded spends.
    miner_sats: u128,
    wrap_count: u32,
    unwrap_count: u32,
}

impl Daily {
    fn decode(b: &[u8]) -> Daily {
        if b.len() < 72 {
            return Daily::default();
        }
        Daily {
            wrapped_sats: u128::from_le_bytes(b[0..16].try_into().unwrap()),
            unwrapped_sats: u128::from_le_bytes(b[16..32].try_into().unwrap()),
            swept_sats: u128::from_le_bytes(b[32..48].try_into().unwrap()),
            miner_sats: u128::from_le_bytes(b[48..64].try_into().unwrap()),
            wrap_count: u32::from_le_bytes(b[64..68].try_into().unwrap()),
            unwrap_count: u32::from_le_bytes(b[68..72].try_into().unwrap()),
        }
    }

    fn encode(&self) -> Vec<u8> {
        let mut v = Vec::with_capacity(72);
        v.extend_from_slice(&self.wrapped_sats.to_le_bytes());
        v.extend_from_slice(&self.unwrapped_sats.to_le_bytes());
        v.extend_from_slice(&self.swept_sats.to_le_bytes());
        v.extend_from_slice(&self.miner_sats.to_le_bytes());
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
    match Block::consensus_decode(&mut Cursor::new(&data[4..])) {
        Ok(block) => index_block(height, &block),
        Err(_) => {}
    }
    kv_set(TIP_KEY, height.to_le_bytes().to_vec());
    flush();
}

/// Returns the frBTC opcode this tx invokes (via its protostone cellpack), if
/// any, plus a live-updatable signer rotation side effect handled by the caller.
fn frbtc_opcode(tx: &Transaction) -> Option<(u128, Vec<u128>)> {
    let runestone = match Runestone::decipher(tx) {
        Some(Artifact::Runestone(rs)) => rs,
        _ => return None,
    };
    let protostones = Protostone::from_runestone(&runestone).unwrap_or_default();
    for ps in &protostones {
        if ps.protocol_tag != ALKANES_PROTOCOL_TAG || ps.message.is_empty() {
            continue;
        }
        let vals = match decode_varint_list(&mut Cursor::new(ps.message.clone())) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if vals.len() < 3 || vals[0] != FRBTC_BLOCK || vals[1] != FRBTC_TX {
            continue;
        }
        return Some((vals[2], vals));
    }
    None
}

fn index_block(_height: u32, block: &Block) {
    let (y, m, d) = civil_from_days((block.header.time as i64) / 86_400);
    let date = format!("{y:04}-{m:02}-{d:02}");

    let mut acc = Daily::default();
    let mut signer = load_signer_script();
    let mut signer_dirty = false;

    for tx in &block.txdata {
        if tx.is_coinbase() {
            continue;
        }
        let txid = tx.compute_txid();
        let op = frbtc_opcode(tx);
        let opcode = op.as_ref().map(|(o, _)| *o);

        // ── 1) Consume any inputs spending a live signer UTXO. Track whether
        //       ALL inputs are signer-owned (for miner fee) and whether an
        //       anchor was spent (⇒ this is an unwrap settlement / payout). ──
        let mut is_signer_spend = false;
        let mut all_inputs_signer = true;
        let mut spent_value = 0u128;
        let mut anchors_spent = 0u32;
        for input in &tx.input {
            let key = utxo_key(&input.previous_output.txid, input.previous_output.vout);
            let rec = kv_get(&key);
            if rec.len() >= 8 {
                is_signer_spend = true;
                spent_value =
                    spent_value.saturating_add(u64::from_le_bytes(rec[0..8].try_into().unwrap()) as u128);
                if rec.get(8) == Some(&1u8) {
                    anchors_spent += 1;
                }
                kv_set(&key, Vec::new()); // consume
            } else {
                all_inputs_signer = false;
            }
        }

        // ── 2) Tally outputs: to signer vs. to others (non-dust). ──
        let mut to_signer = 0u128;
        let mut to_others_nondust = 0u128;
        let mut total_out = 0u128;
        for out in &tx.output {
            let val = out.value.to_sat();
            total_out = total_out.saturating_add(val as u128);
            if out.script_pubkey.as_bytes() == signer.as_slice() {
                to_signer = to_signer.saturating_add(val as u128);
            } else if val != DUST_SATS {
                to_others_nondust = to_others_nondust.saturating_add(val as u128);
            }
        }

        // ── 3) Register every signer-paying output as a live signer UTXO.
        //       Flag as an anchor when this tx is an op-78 unwrap burn. ──
        let is_unwrap_burn = opcode == Some(OP_UNWRAP);
        for (vout, out) in tx.output.iter().enumerate() {
            if out.script_pubkey.as_bytes() == signer.as_slice() {
                let mut v = out.value.to_sat().to_le_bytes().to_vec();
                v.push(if is_unwrap_burn { 1u8 } else { 0u8 });
                kv_set(&utxo_key(&txid, vout as u32), v);
            }
        }

        // ── 4) Classify + accumulate. ──
        match opcode {
            Some(OP_WRAP) => {
                // Gross deposit to the signer = compute_output(). Minted/fee are
                // derived from PREMIUM in the view.
                if to_signer > 0 {
                    acc.wrapped_sats = acc.wrapped_sats.saturating_add(to_signer);
                    acc.wrap_count = acc.wrap_count.saturating_add(1);
                }
            }
            Some(OP_SET_SIGNER) => {
                if let Some((_, vals)) = &op {
                    if let Some(vout) = vals.get(3).and_then(|v| usize::try_from(*v).ok()) {
                        if let Some(o) = tx.output.get(vout) {
                            let spk = o.script_pubkey.as_bytes();
                            if is_p2tr(spk) {
                                signer = spk.to_vec();
                                signer_dirty = true;
                            }
                        }
                    }
                }
            }
            Some(OP_INITIALIZE) => {
                if let Some(o) = tx.output.first() {
                    let spk = o.script_pubkey.as_bytes();
                    if is_p2tr(spk) {
                        signer = spk.to_vec();
                        signer_dirty = true;
                    }
                }
            }
            _ => {}
        }

        // Settlement / sweep classification for signer spends (these are the
        // signer's own txs, distinct from the user's op-77/op-78 txs above).
        if is_signer_spend {
            if all_inputs_signer && spent_value > total_out {
                acc.miner_sats = acc.miner_sats.saturating_add(spent_value - total_out);
            }
            if anchors_spent > 0 {
                // Unwrap settlement: BTC paid to redeemers = value_to_burn (1:1).
                acc.unwrapped_sats = acc.unwrapped_sats.saturating_add(to_others_nondust);
                acc.unwrap_count = acc.unwrap_count.saturating_add(anchors_spent);
            } else if to_others_nondust > 0 {
                // Reserve / fee withdrawal off the signer — not an unwrap.
                acc.swept_sats = acc.swept_sats.saturating_add(to_others_nondust);
            }
        }
    }

    if signer_dirty {
        kv_set(SIGNER_KEY, signer);
    }

    if acc.wrapped_sats > 0
        || acc.unwrapped_sats > 0
        || acc.swept_sats > 0
        || acc.miner_sats > 0
    {
        let key = daily_key(&date);
        let mut daily = Daily::decode(&kv_get(&key));
        daily.wrapped_sats = daily.wrapped_sats.saturating_add(acc.wrapped_sats);
        daily.unwrapped_sats = daily.unwrapped_sats.saturating_add(acc.unwrapped_sats);
        daily.swept_sats = daily.swept_sats.saturating_add(acc.swept_sats);
        daily.miner_sats = daily.miner_sats.saturating_add(acc.miner_sats);
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
    swept_sats: String,
    miner_sats: String,
    wrap_count: u32,
    unwrap_count: u32,
}

#[derive(Serialize)]
struct Totals {
    /// Gross BTC deposited on wraps (compute_output sum).
    wrapped_sats: String,
    /// frBTC minted = wrapped − premium fee (0.999× at default premium).
    minted_sats: String,
    /// BTC settled to redeemers on unwraps (1:1 with frBTC burned).
    unwrapped_sats: String,
    /// wrapped + unwrapped BTC that moved through the protocol.
    volume_sats: String,
    /// Protocol fee revenue = 0.1% wrap premium (the ONLY protocol fee).
    fee_revenue_sats: String,
    /// BTC swept off the signer that is not an unwrap settlement.
    swept_sats: String,
    /// Total Bitcoin miner fees the signer paid to settle/consolidate.
    miner_sats: String,
    wrap_count: u32,
    unwrap_count: u32,
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
    if hi - lo > 366 * 50 {
        return export_bytes(json_bytes(&ErrorResponse {
            error: "range too large (max ~50 years)".to_string(),
        }));
    }

    let mut daily = Vec::new();
    let mut tot_wrapped = 0u128;
    let mut tot_unwrapped = 0u128;
    let mut tot_swept = 0u128;
    let mut tot_miner = 0u128;
    let mut tot_wrap_count = 0u32;
    let mut tot_unwrap_count = 0u32;

    for day in lo..=hi {
        let (y, m, d) = civil_from_days(day);
        let date = format!("{y:04}-{m:02}-{d:02}");
        let raw = kv_get(&daily_key(&date));
        if raw.len() < 72 {
            continue;
        }
        let rec = Daily::decode(&raw);
        tot_wrapped = tot_wrapped.saturating_add(rec.wrapped_sats);
        tot_unwrapped = tot_unwrapped.saturating_add(rec.unwrapped_sats);
        tot_swept = tot_swept.saturating_add(rec.swept_sats);
        tot_miner = tot_miner.saturating_add(rec.miner_sats);
        tot_wrap_count = tot_wrap_count.saturating_add(rec.wrap_count);
        tot_unwrap_count = tot_unwrap_count.saturating_add(rec.unwrap_count);
        daily.push(DailyEntry {
            date,
            wrapped_sats: rec.wrapped_sats.to_string(),
            unwrapped_sats: rec.unwrapped_sats.to_string(),
            swept_sats: rec.swept_sats.to_string(),
            miner_sats: rec.miner_sats.to_string(),
            wrap_count: rec.wrap_count,
            unwrap_count: rec.unwrap_count,
        });
    }

    let fee = tot_wrapped.saturating_mul(PREMIUM) / PREMIUM_DENOM;
    let minted = tot_wrapped.saturating_sub(fee);
    let volume = tot_wrapped.saturating_add(tot_unwrapped);

    let resp = RangeResponse {
        daily,
        totals: Totals {
            wrapped_sats: tot_wrapped.to_string(),
            minted_sats: minted.to_string(),
            unwrapped_sats: tot_unwrapped.to_string(),
            volume_sats: volume.to_string(),
            fee_revenue_sats: fee.to_string(),
            swept_sats: tot_swept.to_string(),
            miner_sats: tot_miner.to_string(),
            wrap_count: tot_wrap_count,
            unwrap_count: tot_unwrap_count,
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
// ---------------------------------------------------------------------------

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

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
        for &(y, m, d) in &[(1970, 1, 1), (2009, 1, 3), (2024, 2, 29), (2025, 12, 31)] {
            let days = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(days), (y, m, d));
            assert_eq!(parse_date(&format!("{y:04}-{m:02}-{d:02}")), Some(days));
        }
    }

    #[test]
    fn daily_codec() {
        let rec = Daily {
            wrapped_sats: 123_456_789,
            unwrapped_sats: 987_654_321,
            swept_sats: 42,
            miner_sats: 7,
            wrap_count: 7,
            unwrap_count: 3,
        };
        let bytes = rec.encode();
        assert_eq!(bytes.len(), 72);
        let back = Daily::decode(&bytes);
        assert_eq!(back.wrapped_sats, rec.wrapped_sats);
        assert_eq!(back.unwrapped_sats, rec.unwrapped_sats);
        assert_eq!(back.swept_sats, rec.swept_sats);
        assert_eq!(back.miner_sats, rec.miner_sats);
        assert_eq!(back.wrap_count, rec.wrap_count);
        assert_eq!(back.unwrap_count, rec.unwrap_count);
    }

    #[test]
    fn signer_script_is_mainnet_p2tr() {
        let s = default_signer_script();
        assert_eq!(s.len(), 34);
        assert_eq!(s[0], 0x51);
        assert_eq!(s[1], 0x20);
        assert!(is_p2tr(&s));
    }

    #[test]
    fn premium_math() {
        // 100 BTC gross → 0.1% fee = 0.1 BTC, minted 99.9 BTC.
        let gross = 100u128 * 100_000_000;
        let fee = gross.saturating_mul(PREMIUM) / PREMIUM_DENOM;
        assert_eq!(fee, 10_000_000); // 0.1 BTC
        assert_eq!(gross - fee, 9_990_000_000); // 99.9 BTC
    }
}
