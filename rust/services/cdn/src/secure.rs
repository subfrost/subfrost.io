//! `/secure/<object>` token verification — replaces the Go server's HTTP
//! Basic Auth on `/private/*`.
//!
//! The subfrost.io app mints a short-lived HMAC token bound to the exact
//! object path:
//!
//!     payload   = "<object>\n<exp-unix-seconds>"
//!     signature = HMAC_SHA256(SECURE_HMAC_KEY, payload)
//!     sig       = base64url_nopad(signature)            (hex also accepted)
//!
//! Request carries `?exp=<unix>&sig=<b64url>` (or `Authorization: Bearer
//! <exp>.<sig>`). Verification recomputes the MAC, constant-time compares,
//! and checks `now <= exp`. Path is bound into the MAC, so a token for
//! `private/asilos.ovpn` can't be replayed against another object.
//!
//! Node minting reference (subfrost.io app):
//!     const exp = Math.floor(Date.now()/1000) + 300;
//!     const sig = crypto.createHmac('sha256', KEY)
//!                       .update(`${object}\n${exp}`).digest('base64url');
//!     url = `/secure/${object}?exp=${exp}&sig=${sig}`;

use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, PartialEq)]
pub enum Denied {
    NotConfigured,
    MissingToken,
    BadEncoding,
    Expired,
    BadSignature,
}

impl Denied {
    pub fn message(&self) -> &'static str {
        match self {
            Denied::NotConfigured => "secure auth not configured",
            Denied::MissingToken => "missing token",
            Denied::BadEncoding => "malformed token",
            Denied::Expired => "token expired",
            Denied::BadSignature => "invalid token",
        }
    }
}

/// Verify `(exp, sig)` for `object` against `key` at wall-clock `now`
/// (unix seconds). Empty `key` => fail closed.
pub fn verify(
    key: &[u8],
    object: &str,
    exp: Option<i64>,
    sig_b64_or_hex: Option<&str>,
    now: i64,
) -> Result<(), Denied> {
    if key.is_empty() {
        return Err(Denied::NotConfigured);
    }
    let exp = exp.ok_or(Denied::MissingToken)?;
    let sig_str = sig_b64_or_hex.ok_or(Denied::MissingToken)?;
    if sig_str.is_empty() {
        return Err(Denied::MissingToken);
    }
    if now > exp {
        return Err(Denied::Expired);
    }

    let provided = decode_sig(sig_str).ok_or(Denied::BadEncoding)?;

    let payload = format!("{object}\n{exp}");
    let mut mac = HmacSha256::new_from_slice(key).map_err(|_| Denied::NotConfigured)?;
    mac.update(payload.as_bytes());
    let expected = mac.finalize().into_bytes();

    // Length-checked, constant-time compare.
    if provided.len() != expected.len() {
        return Err(Denied::BadSignature);
    }
    if provided.ct_eq(expected.as_slice()).into() {
        Ok(())
    } else {
        Err(Denied::BadSignature)
    }
}

/// Accept base64url (no pad), standard base64, or hex signatures so the
/// minting side can use whichever is convenient. The HMAC-SHA256 output
/// is 32 bytes, and a 64-char hex string is *also* valid base64 — so
/// prefer whichever decoding yields exactly 32 bytes.
const SIG_LEN: usize = 32;

fn decode_sig(s: &str) -> Option<Vec<u8>> {
    let candidates = [
        base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).ok(),
        base64::engine::general_purpose::STANDARD.decode(s).ok(),
        hex::decode(s).ok(),
    ];
    // First, any candidate of the expected length.
    if let Some(b) = candidates
        .iter()
        .flatten()
        .find(|b| b.len() == SIG_LEN)
        .cloned()
    {
        return Some(b);
    }
    // Otherwise the first that decoded at all (verify() length-checks).
    candidates.into_iter().flatten().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(key: &[u8], object: &str, exp: i64) -> String {
        let mut mac = HmacSha256::new_from_slice(key).unwrap();
        mac.update(format!("{object}\n{exp}").as_bytes());
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    }

    const KEY: &[u8] = b"super-secret-shared-hmac-key-0001";

    #[test]
    fn valid_token_passes() {
        let exp = 2_000_000_000;
        let sig = sign(KEY, "private/asilos.ovpn", exp);
        assert_eq!(
            verify(KEY, "private/asilos.ovpn", Some(exp), Some(&sig), 1_000),
            Ok(())
        );
    }

    #[test]
    fn expired_token_denied() {
        let exp = 1_000;
        let sig = sign(KEY, "private/x", exp);
        assert_eq!(
            verify(KEY, "private/x", Some(exp), Some(&sig), 2_000),
            Err(Denied::Expired)
        );
    }

    #[test]
    fn path_binding_enforced() {
        let exp = 2_000_000_000;
        // Token minted for object A, replayed against object B.
        let sig = sign(KEY, "private/a", exp);
        assert_eq!(
            verify(KEY, "private/b", Some(exp), Some(&sig), 1_000),
            Err(Denied::BadSignature)
        );
    }

    #[test]
    fn wrong_key_denied() {
        let exp = 2_000_000_000;
        let sig = sign(b"the-wrong-key-the-wrong-key-00001", "private/x", exp);
        assert_eq!(
            verify(KEY, "private/x", Some(exp), Some(&sig), 1_000),
            Err(Denied::BadSignature)
        );
    }

    #[test]
    fn unconfigured_denies() {
        assert_eq!(
            verify(b"", "private/x", Some(2_000_000_000), Some("zzz"), 1),
            Err(Denied::NotConfigured)
        );
    }

    #[test]
    fn missing_sig_denied() {
        assert_eq!(
            verify(KEY, "private/x", Some(2_000_000_000), None, 1),
            Err(Denied::MissingToken)
        );
    }

    #[test]
    fn hex_signature_accepted() {
        let exp = 2_000_000_000;
        let mut mac = HmacSha256::new_from_slice(KEY).unwrap();
        mac.update(format!("private/x\n{exp}").as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());
        assert_eq!(verify(KEY, "private/x", Some(exp), Some(&sig), 1_000), Ok(()));
    }
}
