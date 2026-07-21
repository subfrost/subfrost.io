//! frBTC-on-BRC20-Prog net-BTC-flow model.
//!
//! This mirrors the alkanes `frbtc-volume-indexer` (32:0) model, which does NOT
//! index the metaprotocol — it watches the **signer address** on Bitcoin and
//! tallies net BTC flow:
//!
//!   * **wrap**  — a deposit tx carrying the protocol marker with a value output
//!     to the signer. On alkanes the marker is an op-77 runestone protostone;
//!     on BRC20-Prog it is an `OP_RETURN "BRC20PROG"` output. The satoshis sent
//!     to the signer are the gross wrapped amount.
//!   * **unwrap** — the signer settles a redemption by SPENDING its own UTXOs
//!     and paying the redeemer; change returns to the signer. On alkanes the
//!     op-78 burn flags a specific anchor output + records the recipient so the
//!     later settlement is exactly payout-matched. BRC20-Prog's on-chain
//!     envelope is only the `"BRC20PROG"` marker (no cellpack/pointer), so exact
//!     payout-matching needs the EVM frBTC `Payment{recipient,value}` records
//!     (via `getPayment`/`brc20shrew-rs`). Until that is wired, a signer spend's
//!     non-signer, non-dust outputs are the redemption+sweep envelope.
//!
//! The frBTC (0xdBB5…8337) contract on BRC20-Prog was deployed at Bitcoin height
//! **928317**, so a production scan starts there. Signer / start-height come
//! from `alkanes-rs` (`FRBTC_ADDRESS_MAINNET` + `getSignerAddress()`).

pub mod esplora;

/// The deployable metashrew rockshrew-mono WASM indexer (the SAME model as the
/// pure functions below, over consensus-decoded `bitcoin::Block`s). Gated behind
/// the `metashrew` feature so the pure model + fixture tests build with zero
/// heavy deps on the host target.
#[cfg(feature = "metashrew")]
pub mod metashrew;

use esplora::Tx;

/// BRC20-Prog frBTC signer P2TR (mainnet) — `getSignerAddress()` on
/// 0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337, tap key
/// 34e281bee4f3f26bb412175cbe1101089a3b47791c5dfef54815b63e5a231aea.
pub const SIGNER_P2TR_MAINNET: &str =
    "bc1pxn3gr0hy70exhdqjzawtuygppzdrk3mer3wlaa2gzkmruk3rrt4qga2qaj";

/// frBTC BRC20-Prog contract deployment height — production scan start block.
pub const FRBTC_BRC20_START_HEIGHT: u32 = 928_317;

/// `OP_RETURN OP_PUSHBYTES_9 "BRC20PROG"` — the BRC20-Prog protocol marker
/// script_pubkey (hex `6a09425243323050524f47`).
pub const BRC20PROG_MARKER: &[u8] = b"\x6a\x09BRC20PROG";

/// Bitcoin P2TR dust threshold — ignored as reserve movement, not volume.
pub const DUST_SATS: u64 = 330;

/// Net-BTC-flow tally (same shape as the alkanes `Daily`/`BtcVolume`).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct BtcVolume {
    /// Gross BTC deposited to the signer on wraps.
    pub wrapped_sats: u64,
    /// BTC settled to redeemers on unwraps (payout side of a signer spend).
    pub unwrapped_sats: u64,
    /// BTC swept off the signer that is NOT an unwrap settlement (reserve/fee).
    pub swept_sats: u64,
    pub wrap_count: u32,
    pub unwrap_count: u32,
}

/// What a single tx is, relative to the signer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TxKind {
    /// Wrap: `"BRC20PROG"` marker + `sats` deposited to the signer.
    Wrap { sats: u64 },
    /// The signer spent its own UTXO(s): `paid` to non-signer non-dust outputs
    /// (redemption+sweep envelope), `to_signer` returned as change.
    SignerSpend { paid: u64, to_signer: u64 },
    /// Not signer-related.
    Other,
}

fn has_marker(tx: &Tx) -> bool {
    tx.vout
        .iter()
        .any(|o| o.scriptpubkey_bytes().as_deref() == Some(BRC20PROG_MARKER))
}

fn sats_to_signer(tx: &Tx, signer: &str) -> u64 {
    tx.vout
        .iter()
        .filter(|o| o.scriptpubkey_address.as_deref() == Some(signer))
        .map(|o| o.value)
        .sum()
}

fn spends_signer(tx: &Tx, signer: &str) -> bool {
    tx.vin.iter().any(|i| {
        i.prevout
            .as_ref()
            .and_then(|p| p.scriptpubkey_address.as_deref())
            == Some(signer)
    })
}

/// Classify one tx relative to `signer`. Wrap wins (marker + deposit, external
/// funded); otherwise a signer-funded spend is a settlement/sweep.
pub fn classify_tx(tx: &Tx, signer: &str) -> TxKind {
    let from_signer = spends_signer(tx, signer);
    let to_signer = sats_to_signer(tx, signer);

    if !from_signer && has_marker(tx) && to_signer > 0 {
        return TxKind::Wrap { sats: to_signer };
    }
    if from_signer {
        let paid: u64 = tx
            .vout
            .iter()
            .filter(|o| {
                o.scriptpubkey_address.as_deref() != Some(signer)
                    && o.scriptpubkey_type.as_deref() != Some("op_return")
                    && o.value > DUST_SATS
            })
            .map(|o| o.value)
            .sum();
        return TxKind::SignerSpend {
            paid,
            to_signer,
        };
    }
    TxKind::Other
}

/// Fold a set of txs (a block, or a fixture set) into a [`BtcVolume`].
///
/// NOTE: a `SignerSpend`'s `paid` is the redemption+sweep envelope; the
/// unwrap-vs-sweep split is exact only once the EVM `Payment` recipient list is
/// available (see module docs). Here every signer-spend payout is counted as an
/// unwrap so the wrap side and the settlement side can both be asserted against
/// production fixtures.
pub fn index(txs: &[Tx], signer: &str) -> BtcVolume {
    let mut v = BtcVolume::default();
    for tx in txs {
        match classify_tx(tx, signer) {
            TxKind::Wrap { sats } => {
                v.wrapped_sats = v.wrapped_sats.saturating_add(sats);
                v.wrap_count += 1;
            }
            TxKind::SignerSpend { paid, .. } => {
                v.unwrapped_sats = v.unwrapped_sats.saturating_add(paid);
                v.unwrap_count += 1;
            }
            TxKind::Other => {}
        }
    }
    v
}
