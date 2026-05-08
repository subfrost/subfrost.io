//! Wallet signature verification for BTC addresses.
//!
//! Replaces the stub in `lib/wallet-verify.ts`. Supports:
//!
//! - **BIP-322 simple** for P2WPKH (`bc1q…`) and P2TR (`bc1p…`).
//! - **BIP-137** legacy "Bitcoin Signed Message" (P2PKH and P2WPKH via Trezor flag bytes).
//!
//! Dispatch is by address type + signature shape:
//! - 65-byte signature (after base64 decode) → BIP-137
//! - any other length → BIP-322 simple

use bitcoin::{
    address::NetworkUnchecked,
    hashes::{sha256d, Hash},
    secp256k1::{ecdsa::RecoverableSignature, ecdsa::RecoveryId, Message, Secp256k1},
    sighash::{Prevouts, SighashCache},
    Address, Amount, OutPoint, PublicKey, Script, ScriptBuf, Sequence, TapSighashType, Transaction,
    TxIn, TxOut, Witness, WitnessProgram, WitnessVersion,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum VerifyError {
    #[error("address parse failed: {0}")]
    BadAddress(String),
    #[error("signature decode failed: {0}")]
    BadSignature(String),
    #[error("signature does not match address")]
    Mismatch,
    #[error("unsupported address type")]
    UnsupportedAddress,
    #[error("internal: {0}")]
    Internal(String),
}

/// Verify a wallet-signed message against a claimed address.
///
/// Auto-detects between BIP-137 (65-byte sig) and BIP-322 simple (witness blob).
pub fn verify(address: &str, message: &str, signature_b64: &str) -> Result<(), VerifyError> {
    let sig_bytes = B64
        .decode(signature_b64.trim())
        .map_err(|e| VerifyError::BadSignature(e.to_string()))?;

    let addr = parse_address(address)?;

    if sig_bytes.len() == 65 {
        verify_bip137(&addr, message, &sig_bytes)
    } else {
        verify_bip322_simple(&addr, message, &sig_bytes)
    }
}

fn parse_address(s: &str) -> Result<Address, VerifyError> {
    let unchecked: Address<NetworkUnchecked> = s
        .parse()
        .map_err(|e: bitcoin::address::ParseError| VerifyError::BadAddress(e.to_string()))?;
    // We accept any network here; downstream checks the script_pubkey shape, not the network.
    Ok(unchecked.assume_checked())
}

// ---------------------------------------------------------------------------
// BIP-137 — legacy "Bitcoin Signed Message"
// ---------------------------------------------------------------------------

const BIP137_MAGIC: &[u8] = b"\x18Bitcoin Signed Message:\n";

fn bip137_message_hash(message: &str) -> sha256d::Hash {
    let mut buf = Vec::with_capacity(BIP137_MAGIC.len() + 9 + message.len());
    buf.extend_from_slice(BIP137_MAGIC);
    write_varint(&mut buf, message.len() as u64);
    buf.extend_from_slice(message.as_bytes());
    sha256d::Hash::hash(&buf)
}

fn write_varint(buf: &mut Vec<u8>, n: u64) {
    if n < 0xfd {
        buf.push(n as u8);
    } else if n <= 0xffff {
        buf.push(0xfd);
        buf.extend_from_slice(&(n as u16).to_le_bytes());
    } else if n <= 0xffff_ffff {
        buf.push(0xfe);
        buf.extend_from_slice(&(n as u32).to_le_bytes());
    } else {
        buf.push(0xff);
        buf.extend_from_slice(&n.to_le_bytes());
    }
}

fn verify_bip137(address: &Address, message: &str, sig: &[u8]) -> Result<(), VerifyError> {
    if sig.len() != 65 {
        return Err(VerifyError::BadSignature("expected 65 bytes".into()));
    }
    let header = sig[0];
    if !(27..=42).contains(&header) {
        return Err(VerifyError::BadSignature("header byte out of range".into()));
    }

    // Trezor convention: header encodes both the recovery id and the address type.
    //   27..=30 → P2PKH uncompressed
    //   31..=34 → P2PKH compressed
    //   35..=38 → P2SH-P2WPKH (segwit-in-P2SH)
    //   39..=42 → P2WPKH (native segwit)
    let recid_byte = (header - 27) % 4;
    let recovery_id = RecoveryId::from_i32(recid_byte as i32)
        .map_err(|_| VerifyError::BadSignature("recovery id".into()))?;

    let mut compact = [0u8; 64];
    compact.copy_from_slice(&sig[1..]);
    let recoverable = RecoverableSignature::from_compact(&compact, recovery_id)
        .map_err(|e| VerifyError::BadSignature(e.to_string()))?;

    let hash = bip137_message_hash(message);
    let msg = Message::from_digest(*hash.as_ref());

    let secp = Secp256k1::verification_only();
    let pubkey = secp
        .recover_ecdsa(&msg, &recoverable)
        .map_err(|e| VerifyError::BadSignature(e.to_string()))?;

    let compressed = header >= 31;
    let pk = PublicKey {
        compressed,
        inner: pubkey,
    };

    // Derive the candidate scriptPubKeys for the recovered key and check the
    // address's script_pubkey matches one of them.
    let target = address.script_pubkey();
    let candidates = candidate_scripts_for_pubkey(&pk, header);
    if candidates.iter().any(|s| s == &target) {
        Ok(())
    } else {
        Err(VerifyError::Mismatch)
    }
}

fn candidate_scripts_for_pubkey(pk: &PublicKey, header: u8) -> Vec<ScriptBuf> {
    let mut out = Vec::new();
    // P2PKH (uncompressed or compressed)
    if header < 35 {
        out.push(ScriptBuf::new_p2pkh(&pk.pubkey_hash()));
    }
    // P2SH-P2WPKH
    if (35..=38).contains(&header) || header < 35 {
        if let Ok(wpkh) = pk.wpubkey_hash() {
            let redeem = ScriptBuf::new_p2wpkh(&wpkh);
            out.push(ScriptBuf::new_p2sh(&redeem.script_hash()));
        }
    }
    // P2WPKH (header in 39..=42, but accept the 27..=30 generic range too — some signers
    // don't encode the address type and the verifier just checks all candidates)
    if let Ok(wpkh) = pk.wpubkey_hash() {
        out.push(ScriptBuf::new_p2wpkh(&wpkh));
    }
    out
}

// ---------------------------------------------------------------------------
// BIP-322 simple
// ---------------------------------------------------------------------------

/// BIP-322 tagged hash of the message. Tag is "BIP0322-signed-message".
fn bip322_message_hash(message: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let tag_hash = Sha256::digest(b"BIP0322-signed-message");
    let mut h = Sha256::new();
    h.update(tag_hash);
    h.update(tag_hash);
    h.update(message.as_bytes());
    h.finalize().into()
}

/// Build the virtual `to_spend` transaction per BIP-322.
fn bip322_to_spend(address: &Address, message: &str) -> Transaction {
    let msg_hash = bip322_message_hash(message);

    // scriptSig = OP_0 PUSH32 msg_hash
    let mut script_sig = ScriptBuf::new();
    script_sig.push_opcode(bitcoin::opcodes::OP_0);
    script_sig.push_slice(<&bitcoin::script::PushBytes>::try_from(&msg_hash[..]).unwrap());

    Transaction {
        version: bitcoin::transaction::Version(0),
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint {
                txid: bitcoin::Txid::all_zeros(),
                vout: 0xffff_ffff,
            },
            script_sig,
            sequence: Sequence(0),
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::ZERO,
            script_pubkey: address.script_pubkey(),
        }],
    }
}

/// Build the virtual `to_sign` transaction per BIP-322.
fn bip322_to_sign(to_spend_txid: bitcoin::Txid, witness: Witness) -> Transaction {
    let mut script_pubkey = ScriptBuf::new();
    script_pubkey.push_opcode(bitcoin::opcodes::all::OP_RETURN);

    Transaction {
        version: bitcoin::transaction::Version(0),
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint {
                txid: to_spend_txid,
                vout: 0,
            },
            script_sig: ScriptBuf::new(),
            sequence: Sequence(0),
            witness,
        }],
        output: vec![TxOut {
            value: Amount::ZERO,
            script_pubkey,
        }],
    }
}

/// Decode a BIP-322 simple signature blob (a serialized witness) into a `Witness`.
fn decode_witness(bytes: &[u8]) -> Result<Witness, VerifyError> {
    bitcoin::consensus::deserialize::<Witness>(bytes)
        .map_err(|e| VerifyError::BadSignature(format!("witness decode: {}", e)))
}

fn verify_bip322_simple(
    address: &Address,
    message: &str,
    sig_bytes: &[u8],
) -> Result<(), VerifyError> {
    let witness = decode_witness(sig_bytes)?;
    let to_spend = bip322_to_spend(address, message);
    let to_spend_txid = to_spend.compute_txid();
    let to_sign = bip322_to_sign(to_spend_txid, witness.clone());

    // Inspect the address's script_pubkey to dispatch on type.
    let spk = address.script_pubkey();

    if let Some(program) = witness_program(&spk) {
        match program.version() {
            WitnessVersion::V0 if program.program().len() == 20 => {
                verify_p2wpkh(&to_spend, &to_sign, &witness, program.program().as_bytes())
            }
            WitnessVersion::V1 if program.program().len() == 32 => {
                verify_p2tr(&to_spend, &to_sign, &witness, program.program().as_bytes())
            }
            _ => Err(VerifyError::UnsupportedAddress),
        }
    } else {
        Err(VerifyError::UnsupportedAddress)
    }
}

fn witness_program(spk: &Script) -> Option<WitnessProgram> {
    if !spk.is_witness_program() {
        return None;
    }
    let bytes = spk.as_bytes();
    let version = WitnessVersion::try_from(bytes[0]).ok()?;
    let program = &bytes[2..];
    WitnessProgram::new(version, program).ok()
}

fn verify_p2wpkh(
    to_spend: &Transaction,
    to_sign: &Transaction,
    witness: &Witness,
    expected_program: &[u8],
) -> Result<(), VerifyError> {
    if witness.len() != 2 {
        return Err(VerifyError::BadSignature("p2wpkh witness must be [sig, pubkey]".into()));
    }
    let sig_with_hashtype = witness.nth(0).unwrap();
    let pubkey_bytes = witness.nth(1).unwrap();

    let pk = PublicKey::from_slice(pubkey_bytes)
        .map_err(|e| VerifyError::BadSignature(e.to_string()))?;
    let wpkh = pk
        .wpubkey_hash()
        .map_err(|_| VerifyError::BadSignature("not a compressed pubkey".into()))?;
    if wpkh.as_byte_array() != expected_program {
        return Err(VerifyError::Mismatch);
    }

    // Strip the trailing sighash byte. `split_last` returns `(last, rest)`.
    let (hashtype_byte, sig_bytes) = sig_with_hashtype
        .split_last()
        .ok_or_else(|| VerifyError::BadSignature("empty p2wpkh signature".into()))?;
    let hashtype = bitcoin::EcdsaSighashType::from_consensus(*hashtype_byte as u32);

    let prev_spk = to_spend.output[0].script_pubkey.clone();
    let prev_value = to_spend.output[0].value;

    let mut cache = SighashCache::new(to_sign);
    let sighash = cache
        .p2wpkh_signature_hash(0, &prev_spk, prev_value, hashtype)
        .map_err(|e| VerifyError::Internal(e.to_string()))?;

    let msg = Message::from_digest(sighash.to_byte_array());
    let sig = secp256k1::ecdsa::Signature::from_der(sig_bytes)
        .map_err(|e| VerifyError::BadSignature(e.to_string()))?;

    let secp = Secp256k1::verification_only();
    secp.verify_ecdsa(&msg, &sig, &pk.inner)
        .map_err(|_| VerifyError::Mismatch)?;

    Ok(())
}

fn verify_p2tr(
    to_spend: &Transaction,
    to_sign: &Transaction,
    witness: &Witness,
    expected_xonly: &[u8],
) -> Result<(), VerifyError> {
    if witness.len() != 1 {
        return Err(VerifyError::BadSignature(
            "p2tr key-path witness must be [schnorr_sig]".into(),
        ));
    }
    let sig_bytes = witness.nth(0).unwrap();
    if sig_bytes.len() != 64 && sig_bytes.len() != 65 {
        return Err(VerifyError::BadSignature(
            "schnorr sig must be 64 or 65 bytes".into(),
        ));
    }

    let (sig_64, sighash_type) = if sig_bytes.len() == 65 {
        (
            &sig_bytes[..64],
            TapSighashType::from_consensus_u8(sig_bytes[64])
                .map_err(|e| VerifyError::BadSignature(e.to_string()))?,
        )
    } else {
        (sig_bytes, TapSighashType::Default)
    };

    let xonly = secp256k1::XOnlyPublicKey::from_slice(expected_xonly)
        .map_err(|e| VerifyError::BadSignature(e.to_string()))?;

    let prevouts = vec![to_spend.output[0].clone()];
    let mut cache = SighashCache::new(to_sign);
    let sighash = cache
        .taproot_key_spend_signature_hash(0, &Prevouts::All(&prevouts), sighash_type)
        .map_err(|e| VerifyError::Internal(e.to_string()))?;

    let msg = Message::from_digest(sighash.to_byte_array());
    let sig = secp256k1::schnorr::Signature::from_slice(sig_64)
        .map_err(|e| VerifyError::BadSignature(e.to_string()))?;

    let secp = Secp256k1::verification_only();
    secp.verify_schnorr(&sig, &msg, &xonly)
        .map_err(|_| VerifyError::Mismatch)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::{
        secp256k1::{rand::SeedableRng, SecretKey},
        EcdsaSighashType, Network,
    };

    /// Sign a message using BIP-322 simple over a freshly-generated P2WPKH key.
    /// Used by round-trip tests; not part of the public API.
    fn sign_p2wpkh_bip322(seed: [u8; 32], message: &str) -> (String, String) {
        let mut rng = bitcoin::secp256k1::rand::rngs::StdRng::from_seed(seed);
        let secp = Secp256k1::new();
        let sk = SecretKey::new(&mut rng);
        let pk_inner = sk.public_key(&secp);
        let pk = PublicKey {
            inner: pk_inner,
            compressed: true,
        };
        let wpkh = pk.wpubkey_hash().unwrap();
        let address = Address::p2wpkh(&pk.try_into().unwrap(), Network::Bitcoin);

        let to_spend = bip322_to_spend(&address, message);
        let to_spend_txid = to_spend.compute_txid();

        // Compute sighash with empty witness (segwit v0 sighash doesn't include witness).
        let to_sign = bip322_to_sign(to_spend_txid, Witness::new());
        let mut cache = SighashCache::new(&to_sign);
        let sighash = cache
            .p2wpkh_signature_hash(
                0,
                &to_spend.output[0].script_pubkey,
                Amount::ZERO,
                EcdsaSighashType::All,
            )
            .unwrap();

        let msg = Message::from_digest(sighash.to_byte_array());
        let sig = secp.sign_ecdsa(&msg, &sk);

        // Witness = [DER-sig || sighash_byte, compressed_pubkey]
        let mut sig_with_hashtype = sig.serialize_der().to_vec();
        sig_with_hashtype.push(EcdsaSighashType::All as u8);

        let mut witness = Witness::new();
        witness.push(sig_with_hashtype);
        witness.push(pk.to_bytes());

        let sig_bytes = bitcoin::consensus::serialize(&witness);
        let sig_b64 = B64.encode(&sig_bytes);

        let _ = wpkh; // confirm wpkh derived without side effects
        (address.to_string(), sig_b64)
    }

    #[test]
    fn bip322_p2wpkh_round_trip() {
        let (address, sig) = sign_p2wpkh_bip322([0xab; 32], "Hello World");
        verify(&address, "Hello World", &sig).expect("round trip should verify");
    }

    #[test]
    fn bip322_p2wpkh_empty_message_round_trip() {
        let (address, sig) = sign_p2wpkh_bip322([0xcd; 32], "");
        verify(&address, "", &sig).expect("empty-message round trip should verify");
    }

    #[test]
    fn bip322_p2wpkh_tampered_message_fails() {
        let (address, sig) = sign_p2wpkh_bip322([0xef; 32], "Hello World");
        assert!(matches!(
            verify(&address, "Goodbye World", &sig),
            Err(VerifyError::Mismatch)
        ));
    }

    #[test]
    fn bip322_p2wpkh_wrong_address_fails() {
        let (_, sig) = sign_p2wpkh_bip322([0x01; 32], "Hello World");
        let other = sign_p2wpkh_bip322([0x02; 32], "Hello World").0;
        // Signature from key #1, claimed against address from key #2.
        assert!(verify(&other, "Hello World", &sig).is_err());
    }

    #[test]
    fn parse_address_taproot() {
        let addr = parse_address("bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr")
            .expect("parse taproot");
        assert!(addr.script_pubkey().is_p2tr());
    }

    #[test]
    fn parse_address_p2wpkh() {
        let addr = parse_address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")
            .expect("parse p2wpkh");
        assert!(addr.script_pubkey().is_p2wpkh());
    }

    #[test]
    fn bad_signature_rejected() {
        let result = verify(
            "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
            "Hello",
            "not-base64!!!",
        );
        assert!(matches!(result, Err(VerifyError::BadSignature(_))));
    }
}
