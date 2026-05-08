//! coturn `use-auth-secret` HMAC credential minting.
//!
//! coturn checks `username == "<expiry_unix>:<arbitrary>"` and `password ==
//! base64(HMAC-SHA1(turn_secret, username))`. The expiry is enforced server-side
//! by coturn; we just need to format and sign correctly.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use hmac::{Hmac, Mac};
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

pub struct TurnCredential {
    pub username: String,
    pub credential: String,
}

pub fn mint(turn_secret: &str, address: &str, ttl_secs: u32) -> TurnCredential {
    let expiry = chrono::Utc::now().timestamp() + ttl_secs as i64;
    // Embed the address so coturn logs are auditable, but it's not load-bearing
    // for auth — the HMAC is.
    let username = format!("{expiry}:{address}");
    let mut mac = HmacSha1::new_from_slice(turn_secret.as_bytes()).expect("hmac-sha1 key");
    mac.update(username.as_bytes());
    let credential = B64.encode(mac.finalize().into_bytes());
    TurnCredential {
        username,
        credential,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_for_fixed_inputs() {
        // The username includes a timestamp so we can't compare across calls easily,
        // but we can confirm shape and that the HMAC over the same username is stable.
        let secret = "shared-with-coturn";
        let cred = mint(secret, "bc1qexample", 3600);
        assert!(cred.username.contains(":bc1qexample"));
        assert!(!cred.credential.is_empty());

        // Re-sign manually and compare.
        let mut mac = HmacSha1::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(cred.username.as_bytes());
        let expected = B64.encode(mac.finalize().into_bytes());
        assert_eq!(cred.credential, expected);
    }
}
