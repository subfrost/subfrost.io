//! Ad-hoc decode harness: feed raw tx hex (one per CLI arg, or one per line on
//! stdin) and it reports what the frBTC volume indexer would detect for each tx,
//! using the exact same decode path (ordinals::Runestone -> Protostone ->
//! varint cellpack). Also prints the derived genesis default signer address.
//!
//!   cargo run --example decode -- <rawhex> [<rawhex> ...]
//!   printf '%s\n' <rawhex1> <rawhex2> | cargo run --example decode

use std::io::{BufRead, Cursor};

use bitcoin::consensus::Decodable;
use bitcoin::key::TapTweak;
use bitcoin::{Address, Network, ScriptBuf, Transaction};
use ordinals::{Artifact, Runestone};
use protorune_support::protostone::Protostone;
use protorune_support::utils::decode_varint_list;

const FRBTC_BLOCK: u128 = 32;
const FRBTC_TX: u128 = 0;
const ALKANES_PROTOCOL_TAG: u128 = 1;
const DEFAULT_SIGNER_PUBKEY: [u8; 32] = [
    0x79, 0x40, 0xef, 0x3b, 0x65, 0x91, 0x79, 0xa1, 0x37, 0x1d, 0xec, 0x05, 0x79, 0x3c, 0xb0, 0x27,
    0xcd, 0xe4, 0x78, 0x06, 0xfb, 0x66, 0xce, 0x1e, 0x3d, 0x1b, 0x69, 0xd5, 0x6d, 0xe6, 0x29, 0xdc,
];

fn default_signer_script() -> ScriptBuf {
    let secp = bitcoin::secp256k1::Secp256k1::verification_only();
    let xonly = bitcoin::secp256k1::XOnlyPublicKey::from_slice(&DEFAULT_SIGNER_PUBKEY).unwrap();
    let (tweaked, _) = xonly.tap_tweak(&secp, None);
    ScriptBuf::new_p2tr_tweaked(tweaked)
}

fn inspect(hex_str: &str, signer_script: &ScriptBuf) {
    let hex_str = hex_str.trim();
    if hex_str.is_empty() {
        return;
    }
    let bytes = match hex::decode(hex_str) {
        Ok(b) => b,
        Err(e) => {
            println!("  ! bad hex: {e}");
            return;
        }
    };
    let tx = match Transaction::consensus_decode(&mut Cursor::new(&bytes)) {
        Ok(t) => t,
        Err(e) => {
            println!("  ! bad tx: {e}");
            return;
        }
    };
    let txid = tx.compute_txid();
    let runestone = match Runestone::decipher(&tx) {
        Some(Artifact::Runestone(rs)) => rs,
        Some(Artifact::Cenotaph(_)) => {
            println!("{txid}: cenotaph (no protostones)");
            return;
        }
        None => {
            println!("{txid}: no runestone");
            return;
        }
    };
    let protostones = Protostone::from_runestone(&runestone).unwrap_or_default();
    let mut found = false;
    for (i, ps) in protostones.iter().enumerate() {
        if ps.protocol_tag != ALKANES_PROTOCOL_TAG || ps.message.is_empty() {
            continue;
        }
        let vals = match decode_varint_list(&mut Cursor::new(ps.message.clone())) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if vals.len() < 3 || vals[0] != FRBTC_BLOCK || vals[1] != FRBTC_TX {
            // Still show non-frBTC alkanes cellpacks briefly.
            if vals.len() >= 3 {
                println!("{txid}: protostone[{i}] alkane cellpack target {}:{} op {}", vals[0], vals[1], vals[2]);
            }
            continue;
        }
        found = true;
        let opcode = vals[2];
        match opcode {
            77 => {
                let wrapped: u128 = tx
                    .output
                    .iter()
                    .filter(|o| o.script_pubkey.as_bytes() == signer_script.as_bytes())
                    .map(|o| o.value.to_sat() as u128)
                    .sum();
                println!(
                    "{txid}: WRAP (op 77) -> {wrapped} sats to genesis-default signer (coinbase={})",
                    tx.is_coinbase()
                );
            }
            78 => {
                let requested = vals.get(4).copied().unwrap_or(0);
                let edict_sum: u128 = ps
                    .edicts
                    .iter()
                    .filter(|e| e.id.block == FRBTC_BLOCK && e.id.tx == FRBTC_TX)
                    .map(|e| e.amount)
                    .sum();
                println!(
                    "{txid}: UNWRAP (op 78) vout={} amount_requested={requested} edict_frbtc={edict_sum}",
                    vals.get(3).copied().unwrap_or(0)
                );
            }
            1 => println!("{txid}: SET-SIGNER (op 1) vout={}", vals.get(3).copied().unwrap_or(0)),
            0 => println!("{txid}: INITIALIZE (op 0)"),
            other => println!("{txid}: frBTC op {other} (uncounted)"),
        }
    }
    if !found && protostones.is_empty() {
        println!("{txid}: runestone but no protostones");
    }
}

fn main() {
    let signer_script = default_signer_script();
    let addr = Address::from_script(&signer_script, Network::Bitcoin)
        .map(|a| a.to_string())
        .unwrap_or_else(|_| "<unrepresentable>".to_string());
    println!(
        "genesis-default signer P2TR: {addr}\n  scriptPubKey: {}",
        hex::encode(signer_script.as_bytes())
    );
    println!("---");

    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(l) = line {
                inspect(&l, &signer_script);
            }
        }
    } else {
        for a in &args {
            inspect(a, &signer_script);
        }
    }
}
