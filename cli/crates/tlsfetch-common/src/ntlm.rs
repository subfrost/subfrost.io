//! NTLMv2 authentication, behind the `ntlm` cargo feature.
//!
//! NTLM is a connection-bound, three-message handshake (Type1
//! Negotiate → Type2 Challenge → Type3 Authenticate) layered on top
//! of HTTP via the `Authorization: NTLM <base64>` header. The same
//! mechanism is used for both server auth (`Www-Authenticate: NTLM`)
//! and proxy auth (`Proxy-Authenticate: NTLM`); only the header
//! names differ.
//!
//! ## Connection binding
//!
//! Because NTLM authenticates the *connection* rather than the
//! request, the Type3 Authenticate must travel on the same TCP
//! connection that received the Type2 Challenge. The
//! [`crate::HttpClient`] HTTP/1.1 path supports this via the
//! existing `TlsConnection::write_request` / `read_response`
//! methods — we just call them twice on a single connection
//! instead of opening a fresh socket for the second request.
//!
//! ## Why a third-party crate
//!
//! NTLMv2 message encoding is straightforward but the crypto
//! (NTOWFv2 = HMAC-MD5(MD4(unicode-le(password)), upper(user)+domain),
//! plus the time-versioned response blob) is fiddly to get right
//! and easy to get subtly wrong. The `ntlmclient` crate (CC0,
//! pure Rust, ~700 LOC) handles message round-tripping and
//! crypto correctly. We just plumb its output into our
//! `HttpRequest` headers.

#![cfg(feature = "ntlm")]

use base64::Engine;

use crate::error::TlsFetchError;

/// User credentials for an NTLM exchange. `domain` may be empty for
/// workgroup / non-AD targets.
#[derive(Debug, Clone)]
pub struct NtlmCredentials {
    pub user: String,
    pub password: String,
    pub domain: String,
    /// Hostname the client identifies itself as in the Type1/Type3
    /// messages. Servers usually ignore it; pick anything stable
    /// like `gethostname()` or just `tlsfetch`.
    pub workstation: String,
}

/// Build the Type1 (Negotiate) message and base64-encode it for an
/// `Authorization: NTLM <…>` header.
pub fn build_type1(creds: &NtlmCredentials) -> Result<String, TlsFetchError> {
    let nego_flags = ntlmclient::Flags::NEGOTIATE_UNICODE
        | ntlmclient::Flags::REQUEST_TARGET
        | ntlmclient::Flags::NEGOTIATE_NTLM
        | ntlmclient::Flags::NEGOTIATE_WORKSTATION_SUPPLIED;
    let nego = ntlmclient::Message::Negotiate(ntlmclient::NegotiateMessage {
        flags: nego_flags,
        supplied_domain: creds.domain.clone(),
        supplied_workstation: creds.workstation.clone(),
        os_version: Default::default(),
    });
    let bytes = nego
        .to_bytes()
        .map_err(|e| TlsFetchError::Other(format!("ntlm type1 encode: {e:?}")))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Parse a base64-encoded Type2 (Challenge) message from a
/// `Www-Authenticate: NTLM <…>` (or `Proxy-Authenticate`) header
/// value, and produce the base64-encoded Type3 (Authenticate)
/// response to send back on the same connection.
pub fn build_type3(
    creds: &NtlmCredentials,
    challenge_b64: &str,
) -> Result<String, TlsFetchError> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(challenge_b64.trim())
        .map_err(|e| TlsFetchError::Other(format!("ntlm type2 base64: {e}")))?;
    let parsed = ntlmclient::Message::try_from(raw.as_slice())
        .map_err(|e| TlsFetchError::Other(format!("ntlm type2 decode: {e:?}")))?;
    let challenge = match parsed {
        ntlmclient::Message::Challenge(c) => c,
        other => {
            return Err(TlsFetchError::Other(format!(
                "ntlm: expected Challenge message, got {:?}",
                std::mem::discriminant(&other)
            )));
        }
    };

    // The `target_information` field on the Challenge is already a
    // parsed Vec<TargetInfoEntry>. We need to flatten it back to
    // wire bytes for the response computation.
    let target_info_bytes: Vec<u8> = challenge
        .target_information
        .iter()
        .flat_map(|ie| ie.to_bytes())
        .collect();

    let lib_creds = ntlmclient::Credentials {
        username: creds.user.clone(),
        password: creds.password.clone(),
        domain: creds.domain.clone(),
    };
    let response = ntlmclient::respond_challenge_ntlm_v2(
        challenge.challenge,
        &target_info_bytes,
        ntlmclient::get_ntlm_time(),
        &lib_creds,
    );

    let auth_flags = ntlmclient::Flags::NEGOTIATE_UNICODE | ntlmclient::Flags::NEGOTIATE_NTLM;
    let auth_msg = response.to_message(&lib_creds, &creds.workstation, auth_flags);
    let bytes = auth_msg
        .to_bytes()
        .map_err(|e| TlsFetchError::Other(format!("ntlm type3 encode: {e:?}")))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Strip the `NTLM ` prefix from a `Www-Authenticate` /
/// `Proxy-Authenticate` header value, returning the base64 challenge
/// payload. Returns `None` if the header doesn't carry an NTLM
/// challenge or doesn't include the base64 portion (i.e. the bare
/// `NTLM` solicit that the server emits before we send Type1).
pub fn parse_challenge_header(value: &str) -> Option<&str> {
    // Header may contain multiple comma-separated schemes; pick
    // the NTLM one.
    for scheme in value.split(',') {
        let scheme = scheme.trim();
        if let Some(rest) = scheme.strip_prefix("NTLM ").or_else(|| scheme.strip_prefix("ntlm ")) {
            return Some(rest.trim());
        }
    }
    None
}

/// Parse a `user[:password][@domain]` string into [`NtlmCredentials`].
/// Curl accepts the `--user user:pass` form for both basic and NTLM,
/// with the domain optionally embedded as `domain\user` or `user@domain`.
pub fn parse_user_string(s: &str, workstation: &str) -> NtlmCredentials {
    let (creds_part, password) = match s.split_once(':') {
        Some((u, p)) => (u, p.to_string()),
        None => (s, String::new()),
    };
    // domain\user is the Windows form; user@domain is the UPN form.
    let (user, domain) = if let Some((d, u)) = creds_part.split_once('\\') {
        (u.to_string(), d.to_string())
    } else if let Some((u, d)) = creds_part.split_once('@') {
        (u.to_string(), d.to_string())
    } else {
        (creds_part.to_string(), String::new())
    };
    NtlmCredentials {
        user,
        password,
        domain,
        workstation: workstation.to_string(),
    }
}
