//! Async HTTP/1.1 client over tokio + tokio-rustls.
//!
//! This sits next to the blocking [`HttpClient::send`] path and is
//! intended for callers that are already inside a tokio runtime and
//! don't want to spawn-blocking. The wire shape is byte-identical:
//! same HTTP/1.1 framing, same chunked / Content-Length / close
//! handling. The TLS layer uses the same `rustls-rustcrypto` provider
//! the rest of the crate uses (see [`crate::tls::build_client_config`]).
//!
//! Gated behind the `http2` feature because that's where tokio +
//! tokio-rustls already live; no point spinning up a separate feature
//! flag for a 100-LoC helper.

#![cfg(feature = "http2")]

use std::sync::Arc;
use std::time::Duration;

use rustls::pki_types::ServerName;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

use crate::client::HttpClient;
use crate::error::TlsFetchError;
use crate::http1::{HttpRequest, HttpResponse};
use crate::socket::SocketFactory;
use crate::tls::{build_client_config, TlsConfig};

/// Parsed `url::Url` minimum-shape we use here.
struct ParsedUrl {
    scheme: String,
    host: String,
    port: u16,
    path: String,
}

fn parse_url(url: &str) -> Result<ParsedUrl, TlsFetchError> {
    let parsed = url::Url::parse(url)
        .map_err(|e| TlsFetchError::InvalidUrl(e.to_string()))?;
    let scheme = parsed.scheme().to_string();
    if scheme != "http" && scheme != "https" {
        return Err(TlsFetchError::InvalidUrl(format!(
            "unsupported scheme: {scheme}"
        )));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| TlsFetchError::InvalidUrl("missing host".into()))?
        .to_string();
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| TlsFetchError::InvalidUrl("missing port".into()))?;
    let path = if let Some(q) = parsed.query() {
        format!("{}?{}", parsed.path(), q)
    } else {
        parsed.path().to_string()
    };
    Ok(ParsedUrl { scheme, host, port, path })
}

impl<F: SocketFactory + Send + Sync + 'static> HttpClient<F> {
    /// Send an HTTP/1.1 request asynchronously, returning the parsed
    /// response. Mirrors the blocking [`HttpClient::send`] but accepts
    /// a full URL string and is driven by tokio.
    ///
    /// Unlike the blocking path this does NOT route through the
    /// [`SocketFactory`] — it uses `tokio::net::TcpStream::connect`
    /// directly. The factory is still part of `Self` for API parity
    /// (other ops do use it), but proxy / SOCKS / `--resolve-to`
    /// rerouting isn't honored here. Add that in a follow-up if a
    /// caller needs it.
    pub async fn send_async(
        &self,
        url: &str,
        method: &str,
        headers: &[(&str, &str)],
        body: Option<&[u8]>,
    ) -> Result<HttpResponse, TlsFetchError> {
        let u = parse_url(url)?;
        let body_owned = body.map(|b| b.to_vec()).unwrap_or_default();

        // Build the H1 request bytes the same way the blocking path does
        // by reusing HttpRequest::encode. This keeps any future header
        // normalization in one place.
        let mut req = HttpRequest {
            method: method.to_string(),
            host:   u.host.clone(),
            path:   u.path.clone(),
            headers: headers
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            body: body_owned,
        };
        // Default Host + Connection: close so the read loop hits EOF.
        let has_host = req
            .headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("host"));
        if !has_host {
            req.headers
                .push(("Host".to_string(), u.host.clone()));
        }
        let has_conn = req
            .headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("connection"));
        if !has_conn {
            req.headers
                .push(("Connection".to_string(), "close".to_string()));
        }
        let wire = req.encode();

        // TCP connect (with a default 30s connect timeout to match the
        // RequestOptions default behavior).
        let connect_timeout = Duration::from_secs(30);
        let tcp = tokio::time::timeout(
            connect_timeout,
            TcpStream::connect((u.host.as_str(), u.port)),
        )
        .await
        .map_err(|_| TlsFetchError::Io(format!("connect {}:{} timed out", u.host, u.port)))?
        .map_err(|e| TlsFetchError::Io(format!("connect {}:{}: {e}", u.host, u.port)))?;
        tcp.set_nodelay(true)
            .map_err(|e| TlsFetchError::Io(e.to_string()))?;

        match u.scheme.as_str() {
            "http" => write_request_and_read_response_plaintext(tcp, &wire).await,
            "https" => {
                let tls_cfg = TlsConfig {
                    sni: Some(u.host.clone()),
                    insecure_skip_verify: false,
                    alpn: vec![b"http/1.1".to_vec()],
                    fingerprint: None,
                };
                let config = build_client_config(&tls_cfg, &u.host)?;
                let connector = TlsConnector::from(Arc::new(config));
                let server_name: ServerName<'static> = ServerName::try_from(u.host.clone())
                    .map_err(|e| TlsFetchError::InvalidDnsName(e.to_string()))?;
                let tls = connector
                    .connect(server_name, tcp)
                    .await
                    .map_err(|e| TlsFetchError::HandshakeFailed(e.to_string()))?;
                write_request_and_read_response_tls(tls, &wire).await
            }
            other => Err(TlsFetchError::InvalidUrl(format!(
                "unsupported scheme: {other}"
            ))),
        }
    }
}

async fn write_request_and_read_response_plaintext(
    mut stream: TcpStream,
    wire: &[u8],
) -> Result<HttpResponse, TlsFetchError> {
    stream
        .write_all(wire)
        .await
        .map_err(|e| TlsFetchError::Io(format!("write: {e}")))?;
    stream
        .flush()
        .await
        .map_err(|e| TlsFetchError::Io(format!("flush: {e}")))?;
    let raw = read_all(&mut stream).await?;
    parse_response_bytes(&raw)
}

async fn write_request_and_read_response_tls<S>(
    mut stream: tokio_rustls::client::TlsStream<S>,
    wire: &[u8],
) -> Result<HttpResponse, TlsFetchError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    stream
        .write_all(wire)
        .await
        .map_err(|e| TlsFetchError::Io(format!("write: {e}")))?;
    stream
        .flush()
        .await
        .map_err(|e| TlsFetchError::Io(format!("flush: {e}")))?;
    let raw = read_all_async(&mut stream).await?;
    parse_response_bytes(&raw)
}

async fn read_all<R: tokio::io::AsyncRead + Unpin>(
    r: &mut R,
) -> Result<Vec<u8>, TlsFetchError> {
    let mut buf = Vec::with_capacity(8 * 1024);
    let mut tmp = [0u8; 8 * 1024];
    loop {
        let n = r
            .read(&mut tmp)
            .await
            .map_err(|e| TlsFetchError::Io(format!("read: {e}")))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        // Cap at 16 MiB to defend against runaway servers. Matches the
        // blocking path's intent (it has no explicit cap but limits header
        // buffer to 1 MiB).
        if buf.len() > 16 * 1024 * 1024 {
            return Err(TlsFetchError::Io("response > 16 MiB".into()));
        }
    }
    Ok(buf)
}

async fn read_all_async<R: tokio::io::AsyncRead + Unpin>(
    r: &mut R,
) -> Result<Vec<u8>, TlsFetchError> {
    read_all(r).await
}

/// Parse a raw HTTP/1.1 response buffer. Assumes the full response has
/// been read (i.e. the server closed the connection). Honors
/// `Content-Length` and chunked transfer-encoding for sanity; the
/// caller already consumed past EOF so we mostly just split headers
/// from body and decode chunks if needed.
fn parse_response_bytes(raw: &[u8]) -> Result<HttpResponse, TlsFetchError> {
    use std::collections::HashMap;

    let header_end = find_header_end(raw)
        .ok_or_else(|| TlsFetchError::InvalidHttpResponse("no header terminator".into()))?;

    let mut headers_buf = [httparse::EMPTY_HEADER; 64];
    let mut resp = httparse::Response::new(&mut headers_buf);
    let parsed = resp
        .parse(&raw[..header_end])
        .map_err(|e| TlsFetchError::InvalidHttpResponse(e.to_string()))?;
    if !parsed.is_complete() {
        return Err(TlsFetchError::InvalidHttpResponse(
            "incomplete header parse".into(),
        ));
    }
    let status = resp.code.unwrap_or(0);
    let status_text = resp.reason.unwrap_or("").to_string();
    let mut headers = HashMap::new();
    let mut chunked = false;
    let mut content_length: Option<usize> = None;
    for h in resp.headers.iter() {
        let name = h.name.to_string();
        let value = String::from_utf8_lossy(h.value).to_string();
        if name.eq_ignore_ascii_case("content-length") {
            content_length = value.trim().parse().ok();
        }
        if name.eq_ignore_ascii_case("transfer-encoding")
            && value.to_ascii_lowercase().contains("chunked")
        {
            chunked = true;
        }
        let lc = name.to_ascii_lowercase();
        headers
            .entry(lc)
            .and_modify(|existing: &mut String| {
                existing.push('\n');
                existing.push_str(&value);
            })
            .or_insert(value);
    }

    let body_bytes = &raw[header_end..];
    let body = if chunked {
        decode_chunked(body_bytes)?
    } else if let Some(want) = content_length {
        let take = want.min(body_bytes.len());
        body_bytes[..take].to_vec()
    } else {
        body_bytes.to_vec()
    };

    Ok(HttpResponse {
        status,
        status_text,
        headers,
        body,
    })
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

/// Strict chunked decoder for the buffered-EOF case. Returns the decoded
/// payload (concatenation of all chunk bodies, trailer + final \r\n
/// stripped).
fn decode_chunked(mut buf: &[u8]) -> Result<Vec<u8>, TlsFetchError> {
    let mut out = Vec::with_capacity(buf.len());
    loop {
        let nl = buf
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or_else(|| TlsFetchError::InvalidHttpResponse("chunked: missing size CRLF".into()))?;
        let size_str = std::str::from_utf8(&buf[..nl])
            .map_err(|_| TlsFetchError::InvalidHttpResponse("chunked: non-utf8 size".into()))?
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        let size = usize::from_str_radix(size_str, 16)
            .map_err(|_| TlsFetchError::InvalidHttpResponse(format!("chunked: bad size {size_str:?}")))?;
        buf = &buf[nl + 2..];
        if size == 0 {
            return Ok(out);
        }
        if buf.len() < size + 2 {
            return Err(TlsFetchError::InvalidHttpResponse(
                "chunked: short payload".into(),
            ));
        }
        out.extend_from_slice(&buf[..size]);
        buf = &buf[size + 2..]; // skip body + \r\n
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::socket::{Socket, SocketFactory};
    use std::net::TcpStream as StdTcpStream;
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpListener;

    /// Minimal blocking factory used so we can construct an
    /// `HttpClient<F>` in the test. `send_async` doesn't actually call
    /// the factory (it uses `tokio::net::TcpStream::connect` directly),
    /// but `HttpClient::new` needs SOMETHING that implements
    /// `SocketFactory`.
    #[derive(Clone)]
    struct DummyFactory;

    impl SocketFactory for DummyFactory {
        type Socket = StdTcpStream;
        type Error = std::io::Error;
        fn connect(
            &self,
            _host: &str,
            _port: u16,
            _timeout: Option<std::time::Duration>,
        ) -> Result<Self::Socket, Self::Error> {
            Err(std::io::Error::new(
                std::io::ErrorKind::Unsupported,
                "DummyFactory: blocking connect not exercised by send_async test",
            ))
        }
    }

    // Silence the "Socket is unused" warning — `Socket` is implied by
    // the `SocketFactory::Socket` associated type bound.
    #[allow(dead_code)]
    fn _socket_bound_check<S: Socket>(_s: S) {}

    /// Spin up a plain-HTTP listener that echoes a hardcoded 200
    /// response with a JSON body. The async client should parse it
    /// cleanly.
    #[tokio::test]
    async fn send_async_plaintext_round_trip() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let server = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            // Read until end of headers (we don't care about the body
            // — POST body parsing is out of scope for the smoke).
            let mut buf = [0u8; 4096];
            let mut total = 0;
            loop {
                let n = sock.read(&mut buf[total..]).await.unwrap();
                if n == 0 {
                    break;
                }
                total += n;
                if buf[..total].windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let body = br#"{"ok":true,"n":42}"#;
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            sock.write_all(resp.as_bytes()).await.unwrap();
            sock.write_all(body).await.unwrap();
            sock.flush().await.unwrap();
            // Server closes — `Connection: close` framing makes the
            // client read until EOF.
            drop(sock);
        });

        let client = HttpClient::new(DummyFactory);
        let url = format!("http://127.0.0.1:{port}/v1/test");
        let resp = client
            .send_async(&url, "POST", &[("Content-Type", "application/json")], Some(br#"{"hello":"world"}"#))
            .await
            .expect("send_async");
        server.await.unwrap();

        assert_eq!(resp.status, 200);
        assert_eq!(resp.body, br#"{"ok":true,"n":42}"#);
        assert_eq!(
            resp.headers.get("content-type").map(|s| s.as_str()),
            Some("application/json")
        );
    }

    /// Chunked-encoding parse smoke test for the standalone helper.
    #[test]
    fn decode_chunked_smoke() {
        let raw = b"5\r\nHello\r\n6\r\n World\r\n0\r\n\r\n";
        let out = decode_chunked(raw).unwrap();
        assert_eq!(out, b"Hello World");
    }
}
