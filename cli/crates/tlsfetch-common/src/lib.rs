//! `tlsfetch-common` — pure-Rust TLS + HTTP client over abstract sockets.
//!
//! The goal is "rustls + h2 + quiche behind one trait surface, BYO
//! transport, runs in browser and Node and native". Everything in this
//! crate is `no_std`-friendly and compiles cleanly to
//! `wasm32-unknown-unknown` because rustls is paired with the `ring`
//! crypto provider (no native deps, no system OpenSSL).
//!
//! # Architecture
//!
//! ```text
//!          ┌───────────────────────────────────────────────┐
//!          │                tlsfetch-common                │
//!          │                                               │
//!          │  ┌───────────┐    ┌──────────────────────┐    │
//!          │  │ HttpClient│←──→│     TlsConnection    │    │
//!          │  └───────────┘    │      (rustls)        │    │
//!          │       ▲           └──────────────────────┘    │
//!          │       │ uses                  ▲               │
//!          │  ┌────┴────────────┐          │ wraps         │
//!          │  │ SocketFactory   │          │               │
//!          │  └─────────────────┘     ┌────┴────┐          │
//!          │                          │ Socket  │          │
//!          │                          └─────────┘          │
//!          │                                               │
//!          │  ┌───────────────┐    ┌─────────────────┐     │
//!          │  │ DatagramSock. │    │ HTTP/1.1, /2, /3│     │
//!          │  │ (for QUIC+H3) │    │ codecs          │     │
//!          │  └───────────────┘    └─────────────────┘     │
//!          │                                               │
//!          │  cli::run<F>(args, factory) — shared CLI      │
//!          └──────────────┬──────────────┬─────────────────┘
//!                         │              │
//!                         ▼              ▼
//!              tlsfetch-sys       tlsfetch-web-sys
//!              (std::net::Tcp/    (JS net.Socket /
//!               UdpSocket)         dgram.Socket adapters)
//! ```
//!
//! Consumers implement [`Socket`] (and [`DatagramSocket`] for QUIC)
//! plus their factories, then call [`HttpClient::request`] which picks
//! the right protocol based on URL/config.
//!
//! # Status
//!
//! - [x] TLS 1.2 + 1.3 via rustls
//! - [x] HTTP/1.1 over TLS
//! - [x] Generic over Socket + SocketFactory
//! - [x] Shared `cli` module behind the `cli` feature, used by both
//!       `tlsfetch-cli` (native bin) and the `@tlsfetch/ts-sdk` CLI
//!       export
//! - [x] HTTP/2 — h2 crate over tokio-rustls (`http2` feature)
//! - [x] HTTP/3 — quinn + h3 over rustls (`http3` feature, native);
//!       wasm side via DatagramSocketFactory is a follow-up
//! - [x] JA3 fingerprint customization via custom CryptoProvider

#![cfg_attr(docsrs, feature(doc_cfg))]

pub mod client;
#[cfg(feature = "http2")]
pub mod client_async;
pub mod datagram;
#[cfg(feature = "http3")]
pub mod dgram_quinn;
pub mod error;
pub mod fingerprint;
pub mod handshake_shim;
/// JA3-hash + JA4 fingerprint builders (see [`ja4`]).
pub mod ja4;
pub(crate) mod mlkem_static;
pub mod x25519_mlkem768;
pub mod http1;
pub mod http2;
pub mod http3;
pub mod kerberos;
#[cfg(feature = "ntlm")]
pub mod ntlm;
pub mod protocol;
pub mod proxy;
pub mod socket;
pub mod tls;

#[cfg(feature = "cli")]
pub mod cli;

pub use client::{HttpClient, RequestOptions};
pub use datagram::{DatagramSocket, DatagramSocketFactory};
pub use error::TlsFetchError;
pub use fingerprint::{Fingerprint, KnownFingerprint, ParsedJa3};
pub use http1::{HttpRequest, HttpResponse};
pub use protocol::Protocol;
pub use proxy::{HttpConnectProxy, ProxyAuth, ProxyError, Socks5Proxy, Socks5Resolution};
pub use socket::{IntoStdTcpStream, Socket, SocketFactory};
pub use tls::{HttpStream, PlainConnection, TlsConfig, TlsConnection};
