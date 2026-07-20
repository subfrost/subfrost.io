//! Minimal synchronous outbound HTTP client over `wasi:http/outgoing-handler`.
//!
//! tlsd services the guest's outgoing requests through its own dialer
//! (`outbound::send_via_tlsfetch`: v4-first DNS, HTTP/1.1, standard cert
//! verification), so from here it is an ordinary blocking request/response:
//! build the `OutgoingRequest`, `handle()` it, block on the future, drain the
//! body. There is no async runtime in the component — we drive the pollables
//! directly.
//!
//! The whole response body is buffered into a `Vec<u8>` (tlsd buffers the
//! *component's* response to 64 MiB anyway, and every call site here — GCS
//! JSON API, the metadata token, metashrew simulate — returns small payloads).

use crate::wasi::http::outgoing_handler;
use crate::wasi::http::types::{
    Fields, IncomingBody, Method, OutgoingBody, OutgoingRequest, Scheme,
};
use crate::wasi::io::streams::StreamError;

/// A buffered outbound response.
pub struct Resp {
    pub status: u16,
    pub headers: Vec<(String, Vec<u8>)>,
    pub body: Vec<u8>,
}

impl Resp {
    /// First value of a header (case-insensitive), as a String.
    pub fn header(&self, name: &str) -> Option<String> {
        let name = name.to_ascii_lowercase();
        self.headers
            .iter()
            .find(|(k, _)| k.to_ascii_lowercase() == name)
            .and_then(|(_, v)| String::from_utf8(v.clone()).ok())
    }
}

/// Perform an outbound request and buffer the full response.
///
/// `authority` is host[:port]; `path_and_query` begins with '/'. `headers` are
/// extra request headers (method/scheme/authority/path are set separately).
pub fn request(
    method: Method,
    scheme: Scheme,
    authority: &str,
    path_and_query: &str,
    headers: &[(&str, &[u8])],
    body: Option<&[u8]>,
) -> Result<Resp, String> {
    let hdrs = Fields::new();
    for (k, v) in headers {
        hdrs.append(&k.to_string(), &v.to_vec())
            .map_err(|e| format!("header {k}: {e:?}"))?;
    }

    let req = OutgoingRequest::new(hdrs);
    req.set_method(&method).map_err(|_| "set_method")?;
    req.set_scheme(Some(&scheme)).map_err(|_| "set_scheme")?;
    req.set_authority(Some(authority))
        .map_err(|_| "set_authority")?;
    req.set_path_with_query(Some(path_and_query))
        .map_err(|_| "set_path_with_query")?;

    // Take the body resource before handing the request to the host.
    let out_body = req.body().map_err(|_| "take outgoing body")?;

    let fut = outgoing_handler::handle(req, None).map_err(|e| format!("handle: {e:?}"))?;

    // Write the request body (if any) and finish it.
    if let Some(bytes) = body {
        let stream = out_body.write().map_err(|_| "body write stream")?;
        for chunk in bytes.chunks(4096) {
            stream
                .blocking_write_and_flush(chunk)
                .map_err(|e| format!("write body: {e:?}"))?;
        }
        drop(stream);
    }
    OutgoingBody::finish(out_body, None).map_err(|e| format!("finish body: {e:?}"))?;

    // Block until the response is ready, then unwrap the nested results.
    let pollable = fut.subscribe();
    pollable.block();
    let resp = fut
        .get()
        .ok_or("future not ready after block")?
        .map_err(|_| "future already taken")?
        .map_err(|e| format!("outgoing request failed: {e:?}"))?;

    let status = resp.status();
    let headers = resp.headers().entries();
    let incoming = resp.consume().map_err(|_| "consume response body")?;
    let body = read_body(&incoming)?;
    // Drop the stream (held inside read_body) before finishing the body.
    let _ = IncomingBody::finish(incoming);

    Ok(Resp {
        status,
        headers,
        body,
    })
}

/// Drain an incoming body to EOF. `blocking_read` returns `Err(Closed)` at end
/// of stream; any other stream error is a real transport failure.
fn read_body(incoming: &IncomingBody) -> Result<Vec<u8>, String> {
    let stream = incoming.stream().map_err(|_| "incoming body stream")?;
    let mut buf = Vec::new();
    loop {
        match stream.blocking_read(65536) {
            Ok(chunk) => {
                if chunk.is_empty() {
                    // No data yet — wait for readiness to avoid a busy spin.
                    stream.subscribe().block();
                } else {
                    buf.extend_from_slice(&chunk);
                }
            }
            Err(StreamError::Closed) => break,
            Err(StreamError::LastOperationFailed(e)) => {
                return Err(format!("read body: {:?}", e.to_debug_string()));
            }
        }
    }
    Ok(buf)
}
