//! Metashrew rockshrew-mono WASM entrypoint for the frBTC-on-BRC20-Prog volume
//! indexer.
//!
//! This is the deployable form of the [pure net-BTC-flow model](crate) — it is
//! the SAME classification (proven on real mainnet fixtures in
//! `tests/volume_model.rs`) applied to consensus-decoded `bitcoin::Block`s under
//! the metashrew host ABI, exactly like the alkanes `frbtc-volume-indexer`
//! (32:0). It reads ONLY Bitcoin — never BRC20-Prog EVM state.
//!
//! ## Accounting (identical shape to the alkanes indexer's views, so
//! `lib/financials/frbtc-indexer.ts` reads either indexer unchanged)
//!
//! * **Wrap** — a tx carrying the `OP_RETURN "BRC20PROG"` marker with value
//!   output(s) to the signer, funded externally (not by the signer). We credit
//!   `wrapped_sats += Σ outputs to signer` (gross deposit). frBTC minted =
//!   `wrapped − 0.1% premium`; the premium is the only protocol fee (BTC that
//!   stays in the signer), derived in the view.
//! * **Unwrap** — the signer settles a redemption by SPENDING its own live
//!   UTXOs and paying the redeemer; change returns to the signer. Unlike alkanes
//!   op-78 (which drops an on-chain anchor + recipient pointer), BRC20-Prog's
//!   on-chain envelope carries no recipient, so we count a signer spend's
//!   non-signer, non-dust outputs as settled unwrap volume. Production data
//!   (872 distinct one-off payees, no repeated reserve-sweep address) shows this
//!   is close-to-exact: 21.92 BTC wrapped vs 20.94 BTC unwrapped ≈ 0.98 BTC
//!   reserve.
//! * **Miner fees** — for fully-signer-funded spends, `Σ spent − Σ out`.
//!
//! # Host ABI
//! `input()` = `[u32 height LE] ++ consensus-encoded bitcoin::Block`.
//!
//! # KV schema
//! * `/frbtc_brc20/daily/<YYYY-MM-DD>` -> 72-byte LE `Daily`.
//! * `/frbtc_brc20/tip`               -> `height: u32` LE.
//! * `/frbtc_brc20/u/<txid:32><vout:u32-le>` -> `value:u64 LE` while a live
//!   signer UTXO; empty once spent.

use std::io::Cursor;
use std::str::FromStr;
use std::sync::Arc;

use bitcoin::consensus::Decodable;
use bitcoin::hashes::Hash;
use bitcoin::{Address, Block, Network, Txid};
use metashrew_core::{export_bytes, flush, get, input, set};
use serde::Serialize;

use crate::{BRC20PROG_MARKER, DUST_SATS, SIGNER_P2TR_MAINNET};

/// Wrap premium (fee) numerator over 1e8. `100_000` = 0.1% — the frBTC wrap
/// premium; the BTC never minted is the only protocol fee.
const PREMIUM: u128 = 100_000;
const PREMIUM_DENOM: u128 = 100_000_000;

fn signer_script() -> Vec<u8> {
    Address::from_str(SIGNER_P2TR_MAINNET)
        .expect("valid BRC20-Prog signer P2TR")
        .require_network(Network::Bitcoin)
        .expect("signer must be Bitcoin mainnet")
        .script_pubkey()
        .as_bytes()
        .to_vec()
}

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

const TIP_KEY: &[u8] = b"/frbtc_brc20/tip";
const UTXO_PREFIX: &[u8] = b"/frbtc_brc20/u/";
const DAILY_PREFIX: &str = "/frbtc_brc20/daily/";

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

/// An OP_RETURN output whose scriptPubKey begins with `OP_RETURN PUSH9
/// "BRC20PROG"` — the BRC20-Prog protocol marker.
fn has_marker(block_tx: &bitcoin::Transaction) -> bool {
    block_tx
        .output
        .iter()
        .any(|o| o.script_pubkey.as_bytes().starts_with(BRC20PROG_MARKER))
}

// ---------------------------------------------------------------------------
// Daily record (72 bytes LE packed — same layout as the alkanes indexer)
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Copy)]
struct Daily {
    wrapped_sats: u128,
    unwrapped_sats: u128,
    swept_sats: u128,
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
    if let Ok(block) = Block::consensus_decode(&mut Cursor::new(&data[4..])) {
        index_block(&block);
    }
    kv_set(TIP_KEY, height.to_le_bytes().to_vec());
    flush();
}

fn index_block(block: &Block) {
    let (y, m, d) = civil_from_days((block.header.time as i64) / 86_400);
    let date = format!("{y:04}-{m:02}-{d:02}");
    let signer = signer_script();

    let mut acc = Daily::default();

    for tx in &block.txdata {
        if tx.is_coinbase() {
            continue;
        }
        let txid = tx.compute_txid();

        // ── 1) Consume inputs that spend a live signer UTXO. A tx spending any
        //       signer UTXO is a signer settlement/sweep. ──
        let mut is_signer_spend = false;
        let mut all_inputs_signer = true;
        let mut spent_value = 0u128;
        for vin in &tx.input {
            let key = utxo_key(&vin.previous_output.txid, vin.previous_output.vout);
            let rec = kv_get(&key);
            if rec.len() >= 8 {
                is_signer_spend = true;
                spent_value = spent_value
                    .saturating_add(u64::from_le_bytes(rec[0..8].try_into().unwrap()) as u128);
                kv_set(&key, Vec::new()); // consume
            } else {
                all_inputs_signer = false;
            }
        }

        // ── 2) Tally outputs: value returning to the signer vs paid out to
        //       external, non-dust recipients (the redemption envelope). ──
        let mut to_signer = 0u128;
        let mut total_out = 0u128;
        let mut paid_external = 0u128;
        for out in &tx.output {
            let val = out.value.to_sat();
            total_out = total_out.saturating_add(val as u128);
            let spk = out.script_pubkey.as_bytes();
            if spk == signer.as_slice() {
                to_signer = to_signer.saturating_add(val as u128);
            } else if !out.script_pubkey.is_op_return() && val > DUST_SATS {
                paid_external = paid_external.saturating_add(val as u128);
            }
        }

        // ── 3) Register signer-paying outputs as live signer UTXOs. ──
        for (vout, out) in tx.output.iter().enumerate() {
            if out.script_pubkey.as_bytes() == signer.as_slice() {
                kv_set(
                    &utxo_key(&txid, vout as u32),
                    out.value.to_sat().to_le_bytes().to_vec(),
                );
            }
        }

        // ── 4) Classify. A signer spend is a settlement (unwrap payout); an
        //       externally-funded marker+deposit is a wrap. ──
        if is_signer_spend {
            acc.unwrapped_sats = acc.unwrapped_sats.saturating_add(paid_external);
            if paid_external > 0 {
                acc.unwrap_count = acc.unwrap_count.saturating_add(1);
            }
            if all_inputs_signer && spent_value > total_out {
                acc.miner_sats = acc.miner_sats.saturating_add(spent_value - total_out);
            }
        } else if to_signer > 0 && has_marker(tx) {
            acc.wrapped_sats = acc.wrapped_sats.saturating_add(to_signer);
            acc.wrap_count = acc.wrap_count.saturating_add(1);
        }
    }

    if acc.wrapped_sats > 0 || acc.unwrapped_sats > 0 || acc.miner_sats > 0 {
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
// View functions (identical JSON shape to the alkanes frbtc-volume-indexer)
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
    wrapped_sats: String,
    minted_sats: String,
    unwrapped_sats: String,
    volume_sats: String,
    fee_revenue_sats: String,
    swept_sats: String,
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
        for &(y, m, d) in &[(1970, 1, 1), (2025, 6, 15), (2024, 2, 29), (2025, 12, 31)] {
            let days = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(days), (y, m, d));
            assert_eq!(parse_date(&format!("{y:04}-{m:02}-{d:02}")), Some(days));
        }
    }

    #[test]
    fn daily_codec_roundtrips() {
        let rec = Daily {
            wrapped_sats: 2_192_249_668,
            unwrapped_sats: 2_093_801_496,
            swept_sats: 0,
            miner_sats: 12_345,
            wrap_count: 3577,
            unwrap_count: 1363,
        };
        let back = Daily::decode(&rec.encode());
        assert_eq!(back.wrapped_sats, rec.wrapped_sats);
        assert_eq!(back.unwrapped_sats, rec.unwrapped_sats);
        assert_eq!(back.wrap_count, rec.wrap_count);
        assert_eq!(back.unwrap_count, rec.unwrap_count);
    }

    #[test]
    fn signer_script_is_mainnet_p2tr() {
        let s = signer_script();
        assert_eq!(s.len(), 34);
        assert_eq!(s[0], 0x51); // OP_1
        assert_eq!(s[1], 0x20); // push 32
    }

    #[test]
    fn premium_is_ten_bps() {
        // 21.92249668 BTC wrapped → 0.1% ≈ 0.02192 BTC fee revenue.
        let gross = 2_192_249_668u128;
        let fee = gross.saturating_mul(PREMIUM) / PREMIUM_DENOM;
        assert_eq!(fee, 2_192_249);
    }
}
