//! X25519MLKEM768 hybrid key-exchange group (NamedGroup 0x11EC),
//! per `draft-ietf-tls-ecdhe-mlkem`.
//!
//! Composes X25519 (classical) with ML-KEM 768 (post-quantum) using
//! the `ml-kem` crate's pure-Rust FIPS 203 implementation.
//!
//! Why this exists: `rustls-tlsfetch` ships a `Hybrid` /
//! `X25519MLKEM768` impl, but it's hard-coded to the `aws_lc_rs`
//! provider. We use the `rustls-rustcrypto` provider for pure-Rust
//! / mobile / wasm builds, and that one only ships classical
//! groups. Sucuri-class WAFs reject any Chrome-shaped ClientHello
//! whose `supported_groups` doesn't advertise `4588`
//! (X25519MLKEM768), AND require a matching key_share entry, AND
//! happily pick `4588` server-side when offered — meaning the
//! encoder has to actually complete the hybrid handshake, not just
//! paste a placeholder pubkey.
//!
//! Wire layout per the draft:
//!
//! ```text
//! key_share (client)  ::= mlkem768_encapsulation_key (1184) ||
//!                         x25519_public_key (32)            = 1216 bytes
//! key_share (server)  ::= mlkem768_ciphertext (1088) ||
//!                         x25519_public_key (32)            = 1120 bytes
//! shared_secret        ::= mlkem768_shared_secret (32) ||
//!                         x25519_shared_secret (32)         = 64 bytes
//! ```
//!
//! Note: X25519MLKEM768 puts the PQ element FIRST in both shares
//! and the combined shared secret — opposite from SECP256R1MLKEM768
//! (classical first). This matches the IANA registration and
//! BoringSSL's `Layout::post_quantum_first` flag.

// std-only crate — drop the `alloc::` prefix used in rustls's own
// no_std-friendly modules; `Box` + `Vec` come from the prelude here.

use rustls::crypto::{ActiveKeyExchange, SharedSecret, SupportedKxGroup};
use rustls::{Error, NamedGroup, PeerMisbehaved, ProtocolVersion};

use ml_kem::{
    array::Array,
    kem::{Decapsulate, Kem},
    KeyExport, MlKem768,
};

/// Length of the ML-KEM 768 encapsulation key (= client share).
const MLKEM768_ENCAP_LEN: usize = 1184;
/// Length of the ML-KEM 768 ciphertext (= server share).
const MLKEM768_CIPHERTEXT_LEN: usize = 1088;
const X25519_LEN: usize = 32;

/// The X25519MLKEM768 hybrid `SupportedKxGroup`. Register this with a
/// `CryptoProvider`'s `kx_groups` vec to make rustls offer + complete
/// the hybrid handshake.
pub static X25519MLKEM768: &dyn SupportedKxGroup = &X25519MlKem768Group;

#[derive(Debug)]
struct X25519MlKem768Group;

impl SupportedKxGroup for X25519MlKem768Group {
    fn start(&self) -> Result<Box<dyn ActiveKeyExchange>, Error> {
        // Generate both halves of the hybrid keypair. We hold onto
        // the private keys (X25519 EphemeralSecret + ML-KEM
        // DecapsulationKey) until the server replies and we run
        // `complete()`.
        //
        // rand 0.8 and ml-kem use different `rand_core` major versions
        // (rand_core 0.6 vs 0.9), so we can't share a single RNG
        // handle. Use rand for X25519 (which depends on rand_core 0.6
        // through x25519-dalek 2.0), and let ml-kem use its bundled
        // `getrandom`-backed default via `generate_keypair()`.
        let mut rng = rand::rngs::OsRng;
        let x25519_secret = x25519_dalek::EphemeralSecret::random_from_rng(&mut rng);
        let x25519_public = x25519_dalek::PublicKey::from(&x25519_secret);

        let (dk, ek) = MlKem768::generate_keypair();

        // Combined pub_key = ml_kem_pub (1184) || x25519_pub (32).
        // PQ-first layout — see module docs.
        let mut combined = Vec::with_capacity(MLKEM768_ENCAP_LEN + X25519_LEN);
        let ek_bytes = ek.to_bytes();
        combined.extend_from_slice(&ek_bytes);
        combined.extend_from_slice(x25519_public.as_bytes());

        Ok(Box::new(ActiveX25519MlKem768 {
            x25519_secret: Some(x25519_secret),
            mlkem_decaps: dk,
            combined_pub_key: combined,
        }))
    }

    fn name(&self) -> NamedGroup {
        NamedGroup::X25519MLKEM768
    }

    fn usable_for_version(&self, version: ProtocolVersion) -> bool {
        version == ProtocolVersion::TLSv1_3
    }
}

struct ActiveX25519MlKem768 {
    /// `Option` so `complete()` can move the X25519 secret out (the
    /// `EphemeralSecret::diffie_hellman` API consumes self by value).
    x25519_secret: Option<x25519_dalek::EphemeralSecret>,
    mlkem_decaps: <MlKem768 as Kem>::DecapsulationKey,
    combined_pub_key: Vec<u8>,
}

impl core::fmt::Debug for ActiveX25519MlKem768 {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("ActiveX25519MlKem768")
            .field("combined_pub_key_len", &self.combined_pub_key.len())
            .finish()
    }
}

impl ActiveKeyExchange for ActiveX25519MlKem768 {
    fn complete(mut self: Box<Self>, peer_pub_key: &[u8]) -> Result<SharedSecret, Error> {
        // Server share is mlkem_ciphertext (1088) || x25519_pubkey (32).
        if peer_pub_key.len() != MLKEM768_CIPHERTEXT_LEN + X25519_LEN {
            return Err(Error::PeerMisbehaved(PeerMisbehaved::InvalidKeyShare));
        }
        let (mlkem_ct_bytes, x25519_peer_bytes) = peer_pub_key.split_at(MLKEM768_CIPHERTEXT_LEN);

        // ML-KEM decapsulation. The `Ciphertext<MlKem768>` is a
        // fixed-size `Array<u8, U1088>`; build it via TryFrom<&[u8]>.
        let ct_array: Array<u8, _> = Array::try_from(mlkem_ct_bytes)
            .map_err(|_| Error::PeerMisbehaved(PeerMisbehaved::InvalidKeyShare))?;
        // `Decapsulate::decapsulate` is infallible in the `kem` crate
        // — it returns `SharedKey<MlKem768>` directly, performing
        // implicit-rejection internally per FIPS 203.
        let mlkem_secret = self.mlkem_decaps.decapsulate(&ct_array);

        // X25519 ECDH.
        let peer_x25519 = <[u8; X25519_LEN]>::try_from(x25519_peer_bytes)
            .map_err(|_| Error::PeerMisbehaved(PeerMisbehaved::InvalidKeyShare))?;
        let peer_pubkey = x25519_dalek::PublicKey::from(peer_x25519);
        let x25519_secret = self
            .x25519_secret
            .take()
            .ok_or(Error::General("X25519MLKEM768: secret already consumed".into()))?;
        let x25519_shared = x25519_secret.diffie_hellman(&peer_pubkey);

        // Combined secret = ml_kem_secret (32) || x25519_secret (32).
        // PQ-first, same as the share layout.
        let mut combined = Vec::with_capacity(64);
        combined.extend_from_slice(mlkem_secret.as_ref());
        combined.extend_from_slice(x25519_shared.as_bytes());
        Ok(SharedSecret::from(combined.as_slice()))
    }

    fn pub_key(&self) -> &[u8] {
        &self.combined_pub_key
    }

    fn group(&self) -> NamedGroup {
        NamedGroup::X25519MLKEM768
    }

    fn hybrid_component(&self) -> Option<(NamedGroup, &[u8])> {
        // The classical X25519 portion is the last 32 bytes of the
        // combined pubkey. Servers that opt to use the classical
        // half alone (via the HelloRetryRequest path) pull this
        // slice instead of the hybrid concat.
        let x25519_offset = self.combined_pub_key.len() - X25519_LEN;
        Some((NamedGroup::X25519, &self.combined_pub_key[x25519_offset..]))
    }

    fn complete_hybrid_component(
        mut self: Box<Self>,
        peer_pub_key: &[u8],
    ) -> Result<SharedSecret, Error> {
        // Server picked the classical (X25519-only) half of the
        // hybrid via HelloRetryRequest — sucuri-class WAFs do this
        // because their TLS edge can't (or won't) decapsulate the
        // ML-KEM half. Drop the ML-KEM decapsulation key and run
        // plain X25519 ECDH against the server's pubkey.
        let peer_x25519 = <[u8; X25519_LEN]>::try_from(peer_pub_key)
            .map_err(|_| Error::PeerMisbehaved(PeerMisbehaved::InvalidKeyShare))?;
        let peer_pubkey = x25519_dalek::PublicKey::from(peer_x25519);
        let x25519_secret = self
            .x25519_secret
            .take()
            .ok_or(Error::General("X25519MLKEM768: secret already consumed".into()))?;
        let shared = x25519_secret.diffie_hellman(&peer_pubkey);
        Ok(SharedSecret::from(shared.as_bytes().as_slice()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ml_kem::{kem::Encapsulate, ml_kem_768::EncapsulationKey};

    #[test]
    fn start_emits_1216_byte_pubkey() {
        let active = X25519MLKEM768.start().expect("start");
        assert_eq!(active.pub_key().len(), MLKEM768_ENCAP_LEN + X25519_LEN);
        assert_eq!(active.group(), NamedGroup::X25519MLKEM768);
    }

    #[test]
    fn hybrid_component_returns_x25519_tail() {
        let active = X25519MLKEM768.start().expect("start");
        let (group, bytes) = active.hybrid_component().expect("hybrid_component");
        assert_eq!(group, NamedGroup::X25519);
        assert_eq!(bytes.len(), X25519_LEN);
        assert_eq!(bytes, &active.pub_key()[MLKEM768_ENCAP_LEN..]);
    }

    #[test]
    fn self_kex_round_trip() {
        let active_client = X25519MLKEM768.start().expect("start");
        let client_pub = active_client.pub_key().to_vec();
        assert_eq!(client_pub.len(), MLKEM768_ENCAP_LEN + X25519_LEN);

        let (mlkem_pub_bytes, x25519_client_bytes) = client_pub.split_at(MLKEM768_ENCAP_LEN);

        // Server side: reconstruct EncapsulationKey, encapsulate.
        let ek_array: Array<u8, _> = Array::try_from(mlkem_pub_bytes).expect("ek len");
        let ek = EncapsulationKey::new(&ek_array).expect("ek init");
        // `Encapsulate::encapsulate` is infallible in the `kem` crate
        // — returns `(Ciphertext, SharedKey)` directly.
        let (mlkem_ct, mlkem_server_secret) = ek.encapsulate();
        let mut rng = rand::rngs::OsRng;

        // Server X25519 ECDH.
        let x25519_client_pub_arr =
            <[u8; X25519_LEN]>::try_from(x25519_client_bytes).expect("x25519 len");
        let x25519_client_pub = x25519_dalek::PublicKey::from(x25519_client_pub_arr);
        let x25519_server_secret = x25519_dalek::EphemeralSecret::random_from_rng(&mut rng);
        let x25519_server_pub = x25519_dalek::PublicKey::from(&x25519_server_secret);
        let x25519_server_shared = x25519_server_secret.diffie_hellman(&x25519_client_pub);

        // Build server share = mlkem_ct (1088) || x25519_server_pub (32).
        let mut server_share = Vec::new();
        server_share.extend_from_slice(mlkem_ct.as_ref());
        server_share.extend_from_slice(x25519_server_pub.as_bytes());
        assert_eq!(server_share.len(), MLKEM768_CIPHERTEXT_LEN + X25519_LEN);

        let client_secret = active_client.complete(&server_share).expect("complete");

        let mut expected = Vec::with_capacity(64);
        expected.extend_from_slice(mlkem_server_secret.as_ref());
        expected.extend_from_slice(x25519_server_shared.as_bytes());
        assert_eq!(client_secret.secret_bytes(), expected.as_slice());
    }
}
