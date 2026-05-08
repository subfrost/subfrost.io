//! Session bearer tokens for meet-api.
//!
//! Token shape (snorchat-style, but `uid` is the BTC wallet address):
//!
//! ```text
//! <sid_hex>.<address>.<exp_ms>.<hmac_sha256_b64url>
//! ```
//!
//! - `sid_hex` — 16 random bytes, hex-encoded (32 chars). Identifies the session for revocation.
//! - `address` — BTC address (validated upstream via wallet signature).
//! - `exp_ms` — expiry Unix epoch milliseconds (decimal).
//! - `hmac_sha256_b64url` — HMAC-SHA256(secret, "<sid>.<address>.<exp_ms>"), URL-safe base64, no padding.
//!
//! Stateless: validation requires only the signing secret. No DB lookup on the hot path.
//! For revocation, hold a small Redis set of revoked sids.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine as _};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;
use thiserror::Error;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("malformed token")]
    Malformed,
    #[error("token expired")]
    Expired,
    #[error("signature invalid")]
    BadSignature,
    #[error("internal: {0}")]
    Internal(String),
}

#[derive(Debug, Clone)]
pub struct Session {
    pub sid: String,
    pub address: String,
    pub expires_at_ms: i64,
}

#[derive(Clone)]
pub struct SessionSigner {
    secret: Vec<u8>,
}

impl SessionSigner {
    pub fn new(secret: impl AsRef<[u8]>) -> Self {
        Self {
            secret: secret.as_ref().to_vec(),
        }
    }

    /// Mint a token for a freshly-verified wallet address. `ttl_ms` from now.
    pub fn mint(&self, address: &str, now_ms: i64, ttl_ms: i64) -> String {
        let mut sid_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut sid_bytes);
        let sid = hex::encode(sid_bytes);
        let expires_at_ms = now_ms.saturating_add(ttl_ms);

        let body = format!("{sid}.{address}.{expires_at_ms}");
        let sig = self.sign(&body);
        format!("{body}.{sig}")
    }

    /// Verify a token and extract the session.
    pub fn verify(&self, token: &str, now_ms: i64) -> Result<Session, SessionError> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 4 {
            return Err(SessionError::Malformed);
        }
        let (sid, address, exp_str, sig) = (parts[0], parts[1], parts[2], parts[3]);

        let body = format!("{sid}.{address}.{exp_str}");
        let expected = self.sign(&body);
        if !constant_time_eq::constant_time_eq(sig.as_bytes(), expected.as_bytes()) {
            return Err(SessionError::BadSignature);
        }

        let expires_at_ms: i64 = exp_str.parse().map_err(|_| SessionError::Malformed)?;
        if expires_at_ms < now_ms {
            return Err(SessionError::Expired);
        }

        Ok(Session {
            sid: sid.to_string(),
            address: address.to_string(),
            expires_at_ms,
        })
    }

    fn sign(&self, body: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(&self.secret).expect("hmac key");
        mac.update(body.as_bytes());
        B64.encode(mac.finalize().into_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let signer = SessionSigner::new(b"test-secret-32-bytes-padded-xxxx");
        let now = 1_700_000_000_000_i64;
        let ttl = 3600_000_i64;
        let token = signer.mint("bc1qexample", now, ttl);
        let session = signer.verify(&token, now + 1000).expect("verify");
        assert_eq!(session.address, "bc1qexample");
        assert_eq!(session.expires_at_ms, now + ttl);
        assert_eq!(session.sid.len(), 32);
    }

    #[test]
    fn rejects_expired() {
        let signer = SessionSigner::new(b"test-secret");
        let token = signer.mint("bc1qexample", 0, 1000);
        let result = signer.verify(&token, 2000);
        assert!(matches!(result, Err(SessionError::Expired)));
    }

    #[test]
    fn rejects_tampered_address() {
        let signer = SessionSigner::new(b"test-secret");
        let token = signer.mint("bc1qexample", 0, 60_000);
        let parts: Vec<&str> = token.split('.').collect();
        let bad = format!("{}.bc1qattacker.{}.{}", parts[0], parts[2], parts[3]);
        let result = signer.verify(&bad, 1000);
        assert!(matches!(result, Err(SessionError::BadSignature)));
    }

    #[test]
    fn rejects_wrong_secret() {
        let signer = SessionSigner::new(b"secret-A");
        let token = signer.mint("bc1qexample", 0, 60_000);
        let other = SessionSigner::new(b"secret-B");
        let result = other.verify(&token, 1000);
        assert!(matches!(result, Err(SessionError::BadSignature)));
    }

    #[test]
    fn rejects_malformed() {
        let signer = SessionSigner::new(b"secret");
        assert!(matches!(
            signer.verify("not.a.token", 0),
            Err(SessionError::Malformed)
        ));
    }
}
