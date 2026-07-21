//! Proof that the frBTC-on-BRC20-Prog volume model reproduces the alkanes
//! net-BTC-flow model on REAL mainnet transactions.
//!
//! Fixtures were pulled from the production signer address
//! (bc1pxn3gr0hy70exhdqjzawtuygppzdrk3mer3wlaa2gzkmruk3rrt4qga2qaj) via the
//! `esplora_*` JSON-RPC (self-hosted subfrost esplora) — the same API the
//! indexer uses. They are verbatim `esplora_tx` responses.

use frbtc_brc20_volume_indexer::{classify_tx, esplora::Tx, index, TxKind, SIGNER_P2TR_MAINNET};

fn load(name: &str) -> Tx {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    let raw = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("parse {name}: {e}"))
}

/// A small wrap: `OP_RETURN "BRC20PROG"` + 330 sats to the signer, externally
/// funded. (tx 3573080d…, height 958931)
#[test]
fn small_wrap_is_detected() {
    let tx = load("wrap_small.json");
    assert_eq!(
        classify_tx(&tx, SIGNER_P2TR_MAINNET),
        TxKind::Wrap { sats: 330 },
        "marker + signer deposit, external-funded => wrap"
    );
}

/// A large wrap: 1.6M sats to the signer with the marker. (tx b47b302d…, h 956359)
#[test]
fn large_wrap_amount_matches_deposit() {
    let tx = load("wrap_large.json");
    assert_eq!(
        classify_tx(&tx, SIGNER_P2TR_MAINNET),
        TxKind::Wrap { sats: 1_600_000 }
    );
}

/// An unwrap settlement: the signer spends its own UTXOs, pays the redeemer
/// 18568 sats, returns 273186 change. (tx d70863…, height 958937)
#[test]
fn unwrap_settlement_is_a_signer_spend_paying_the_redeemer() {
    let tx = load("unwrap_settle.json");
    match classify_tx(&tx, SIGNER_P2TR_MAINNET) {
        TxKind::SignerSpend { paid, to_signer } => {
            assert_eq!(paid, 18_568, "redeemer payout");
            assert_eq!(to_signer, 273_186, "change back to signer reserve");
        }
        other => panic!("expected a signer spend, got {other:?}"),
    }
}

/// The full model over the fixture "block": 2 wraps (330 + 1_600_000) and one
/// unwrap settlement (18568 paid). Mirrors the alkanes `BtcVolume` accounting.
#[test]
fn aggregate_volume_over_production_fixtures() {
    let txs = vec![
        load("wrap_small.json"),
        load("wrap_large.json"),
        load("unwrap_settle.json"),
    ];
    let v = index(&txs, SIGNER_P2TR_MAINNET);

    assert_eq!(v.wrap_count, 2);
    assert_eq!(v.wrapped_sats, 1_600_330); // 330 + 1_600_000
    assert_eq!(v.unwrap_count, 1);
    assert_eq!(v.unwrapped_sats, 18_568);
}
