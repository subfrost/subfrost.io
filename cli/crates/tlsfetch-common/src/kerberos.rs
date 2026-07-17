//! Kerberos / Negotiate / SPNEGO authentication.
//!
//! ## Status
//!
//! **Stub.** The CLI surface (`--negotiate`) is wired and the module
//! exposes the same shape as [`crate::ntlm`] (Type1/Type2/Type3
//! analogue: initial token → server challenge → response token).
//! The actual GSS-API calls are not implemented in the default
//! build because they require linking against the system
//! `libgssapi` / MIT `krb5-libs` shared libraries, which breaks the
//! "pure Rust, single static binary" property the rest of tlsfetch
//! preserves.
//!
//! ## Why pure Rust isn't an option
//!
//! There is no production-quality pure-Rust Kerberos implementation
//! today. The closest is the `rsasl` crate which only covers
//! GSSAPI-via-system-libs. The `cross-krb5` crate is sysapi-bound
//! the same way. A real ground-up Rust port of MIT krb5 would be a
//! multi-thousand-line undertaking covering ASN.1, AS-REQ/TGS-REQ,
//! pre-auth, all of the encryption types, the credential cache
//! format, etc. — out of scope for tlsfetch.
//!
//! ## How to wire it in if you need it
//!
//! Enable the `kerberos` cargo feature:
//!
//! ```toml
//! tlsfetch-common = { version = "0.1", features = ["kerberos"] }
//! ```
//!
//! Then provide an implementation of [`KerberosAuthenticator`] that
//! talks to your platform's GSS-API binding (e.g. the `libgssapi`
//! crate on Linux, or `windows-sys`'s SSPI on Windows). The trait
//! is intentionally minimal — feed it the server's `Www-Authenticate:
//! Negotiate <token>` payload, get back the next token to send.
//!
//! Once a real backend lands, plumb it through `HttpClient` the
//! same way [`crate::client::HttpClient::send_http1_ntlm`] handles
//! NTLM: send the initial token, parse the 401 response, send the
//! follow-up on the same connection.

#![allow(dead_code)]

use crate::error::TlsFetchError;

/// Trait for any concrete Kerberos / SPNEGO backend.
pub trait KerberosAuthenticator {
    /// Build the initial Negotiate token (the SPNEGO `NegTokenInit`
    /// containing the AP-REQ for the target service principal).
    fn initial_token(&mut self) -> Result<Vec<u8>, TlsFetchError>;

    /// Process a server token (from `Www-Authenticate: Negotiate
    /// <base64>`) and produce the next client token, if any. A
    /// return value of `None` means the handshake is complete.
    fn step(&mut self, server_token: &[u8]) -> Result<Option<Vec<u8>>, TlsFetchError>;
}

/// Service principal name builder. Curl computes this as
/// `HTTP@<host>` (or `HTTP/<host>` for `--negotiate-with-cname`).
/// Exposed here so the future backend has a single place to ask for it.
pub fn http_service_name(host: &str) -> String {
    format!("HTTP@{host}")
}

/// Returned from the default build (no `kerberos` feature). Carries
/// a clear, actionable error message instead of silently failing.
pub fn unsupported_error() -> TlsFetchError {
    TlsFetchError::Other(
        "tlsfetch was built without the `kerberos` cargo feature, so \
         --negotiate / SPNEGO auth is unavailable. Rebuild with \
         `--features kerberos` and provide a KerberosAuthenticator \
         implementation backed by your system's GSS-API library \
         (libgssapi on Linux/BSD, SSPI on Windows). See the \
         `tlsfetch_common::kerberos` module docs for details."
            .to_string(),
    )
}
