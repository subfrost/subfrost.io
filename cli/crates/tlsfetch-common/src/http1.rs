//! Tiny HTTP/1.1 request/response support. Just enough to do a GET
//! and parse the headers + body. Used by `https_get` and the CLI.

use std::collections::HashMap;

use crate::error::TlsFetchError;
use crate::tls::HttpStream;

#[derive(Debug, Clone)]
pub struct HttpRequest {
    pub method: String,
    pub host: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpRequest {
    pub fn get(host: &str, path: &str) -> Self {
        HttpRequest {
            method: "GET".to_string(),
            host: host.to_string(),
            path: path.to_string(),
            headers: vec![
                ("User-Agent".to_string(), "tlsfetch/0.1".to_string()),
                ("Accept".to_string(), "*/*".to_string()),
                ("Connection".to_string(), "close".to_string()),
            ],
            body: Vec::new(),
        }
    }

    pub fn post(host: &str, path: &str, body: Vec<u8>) -> Self {
        let mut req = HttpRequest::get(host, path);
        req.method = "POST".to_string();
        req.body = body;
        req
    }

    pub fn header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.to_string(), value.to_string()));
        self
    }

    /// Serialize to wire bytes. Adds a Host header if missing and a
    /// Content-Length if there's a body.
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(256 + self.body.len());
        out.extend_from_slice(self.method.as_bytes());
        out.push(b' ');
        out.extend_from_slice(self.path.as_bytes());
        out.extend_from_slice(b" HTTP/1.1\r\n");

        let has_host = self.headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("host"));
        if !has_host {
            out.extend_from_slice(b"Host: ");
            out.extend_from_slice(self.host.as_bytes());
            out.extend_from_slice(b"\r\n");
        }

        let has_cl = self
            .headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("content-length"));

        for (k, v) in &self.headers {
            out.extend_from_slice(k.as_bytes());
            out.extend_from_slice(b": ");
            out.extend_from_slice(v.as_bytes());
            out.extend_from_slice(b"\r\n");
        }

        if !self.body.is_empty() && !has_cl {
            out.extend_from_slice(format!("Content-Length: {}\r\n", self.body.len()).as_bytes());
        }
        out.extend_from_slice(b"\r\n");
        out.extend_from_slice(&self.body);
        out
    }
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

impl HttpResponse {
    /// Read and parse a complete HTTP/1.1 response from a TLS connection.
    /// Supports identity (Content-Length) and `Connection: close` framings.
    /// Chunked transfer-encoding is supported.
    pub fn read_from<R: HttpStream>(conn: &mut R) -> Result<Self, TlsFetchError> {
        // Slurp the header block.
        let mut buf = Vec::with_capacity(4096);
        let mut tmp = [0u8; 8 * 1024];
        let header_end;
        loop {
            let n = conn.read(&mut tmp)?;
            if n == 0 {
                return Err(TlsFetchError::ConnectionClosed("response_header"));
            }
            buf.extend_from_slice(&tmp[..n]);
            if let Some(idx) = find_header_end(&buf) {
                header_end = idx;
                break;
            }
            if buf.len() > 1024 * 1024 {
                return Err(TlsFetchError::InvalidHttpResponse("headers >1MB".into()));
            }
        }

        // Parse headers.
        let mut headers_buf = [httparse::EMPTY_HEADER; 64];
        let mut resp = httparse::Response::new(&mut headers_buf);
        let parsed = resp
            .parse(&buf[..header_end])
            .map_err(|e| TlsFetchError::InvalidHttpResponse(e.to_string()))?;
        if !parsed.is_complete() {
            return Err(TlsFetchError::InvalidHttpResponse("incomplete header parse".into()));
        }
        let status = resp.code.unwrap_or(0);
        let status_text = resp.reason.unwrap_or("").to_string();
        let mut headers = HashMap::new();
        let mut content_length: Option<usize> = None;
        let mut chunked = false;
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
            // For Set-Cookie and other multi-value headers, join with
            // newline so callers can split. HashMap::insert would lose
            // all but the last duplicate.
            let lc = name.to_ascii_lowercase();
            headers
                .entry(lc)
                .and_modify(|existing: &mut String| {
                    existing.push('\n');
                    existing.push_str(&value);
                })
                .or_insert(value);
        }

        // Initial body bytes already in `buf` after the header block.
        let mut body = buf[header_end..].to_vec();

        if chunked {
            log::trace!("http1: chunked body");
            body = read_chunked(conn, body)?;
        } else if let Some(want) = content_length {
            log::trace!("http1: content-length={} initial-body={}", want, body.len());
            while body.len() < want {
                let n = conn.read(&mut tmp)?;
                log::trace!("http1: read {} bytes (have {}/{})", n, body.len() + n, want);
                if n == 0 {
                    break;
                }
                body.extend_from_slice(&tmp[..n]);
            }
            body.truncate(want);
        } else {
            log::trace!("http1: connection-close framing");
            loop {
                let n = conn.read(&mut tmp)?;
                log::trace!("http1: read {} bytes (close-frame, have {})", n, body.len() + n);
                if n == 0 {
                    break;
                }
                body.extend_from_slice(&tmp[..n]);
            }
        }

        Ok(HttpResponse {
            status,
            status_text,
            headers,
            body,
        })
    }
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

fn read_chunked<R: HttpStream>(
    conn: &mut R,
    mut buf: Vec<u8>,
) -> Result<Vec<u8>, TlsFetchError> {
    let mut out = Vec::with_capacity(buf.capacity());
    let mut tmp = [0u8; 8 * 1024];

    loop {
        // Find size line "<hex>\r\n".
        let nl = loop {
            if let Some(p) = buf.windows(2).position(|w| w == b"\r\n") {
                break p;
            }
            let n = conn.read(&mut tmp)?;
            if n == 0 {
                return Err(TlsFetchError::ConnectionClosed("chunked_size"));
            }
            buf.extend_from_slice(&tmp[..n]);
        };
        let size_str = std::str::from_utf8(&buf[..nl])
            .map_err(|_| TlsFetchError::InvalidHttpResponse("non-utf8 chunk size".into()))?;
        let size_str = size_str.split(';').next().unwrap_or("");
        let size = usize::from_str_radix(size_str.trim(), 16)
            .map_err(|_| TlsFetchError::InvalidHttpResponse(format!("bad chunk size: {:?}", size_str)))?;
        // Drop "<hex>\r\n"
        buf.drain(..nl + 2);
        if size == 0 {
            // trailer + final \r\n. Best-effort: try to find the next \r\n.
            loop {
                if buf.windows(2).any(|w| w == b"\r\n") {
                    break;
                }
                let n = conn.read(&mut tmp)?;
                if n == 0 {
                    break;
                }
                buf.extend_from_slice(&tmp[..n]);
            }
            return Ok(out);
        }
        // Need `size` bytes + trailing \r\n.
        while buf.len() < size + 2 {
            let n = conn.read(&mut tmp)?;
            if n == 0 {
                return Err(TlsFetchError::ConnectionClosed("chunked_body"));
            }
            buf.extend_from_slice(&tmp[..n]);
        }
        out.extend_from_slice(&buf[..size]);
        buf.drain(..size + 2);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tls::HttpStream;

    /// In-memory HttpStream backed by a Vec<u8> for parser tests.
    /// `read` returns one chunk per call (up to `chunk_size`) so we
    /// can exercise the read-loop's append-and-retry path.
    struct VecStream {
        bytes: std::collections::VecDeque<u8>,
        chunk_size: usize,
        write_buf: Vec<u8>,
    }
    impl VecStream {
        fn new(payload: &[u8], chunk_size: usize) -> Self {
            Self {
                bytes: payload.iter().copied().collect(),
                chunk_size,
                write_buf: Vec::new(),
            }
        }
    }
    impl HttpStream for VecStream {
        fn read(&mut self, buf: &mut [u8]) -> Result<usize, TlsFetchError> {
            let want = buf.len().min(self.chunk_size).min(self.bytes.len());
            for i in 0..want {
                buf[i] = self.bytes.pop_front().unwrap();
            }
            Ok(want)
        }
        fn write_all(&mut self, data: &[u8]) -> Result<(), TlsFetchError> {
            self.write_buf.extend_from_slice(data);
            Ok(())
        }
        fn close(&mut self) -> Result<(), TlsFetchError> {
            Ok(())
        }
    }

    #[test]
    fn content_length_response_parses() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nContent-Type: text/plain\r\n\r\nhello";
        let mut s = VecStream::new(raw, 9999);
        let resp = HttpResponse::read_from(&mut s).expect("parse");
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body, b"hello");
        assert_eq!(resp.headers.get("content-type").unwrap(), "text/plain");
    }

    #[test]
    fn content_length_response_handles_split_reads() {
        // Same as above but the reader hands out 4 bytes at a time —
        // forces the header-collection loop to make many trips, and
        // the body loop to do the same.
        let raw = b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello";
        let mut s = VecStream::new(raw, 4);
        let resp = HttpResponse::read_from(&mut s).expect("parse");
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body, b"hello");
    }

    #[test]
    fn chunked_response_parses() {
        let raw = b"HTTP/1.1 200 OK\r\n\
            Transfer-Encoding: chunked\r\n\
            \r\n\
            5\r\n\
            Hello\r\n\
            8\r\n\
            , world!\r\n\
            0\r\n\
            \r\n";
        let mut s = VecStream::new(raw, 9999);
        let resp = HttpResponse::read_from(&mut s).expect("parse");
        assert_eq!(resp.status, 200);
        assert_eq!(&resp.body, b"Hello, world!");
    }

    #[test]
    fn connection_close_framing_parses() {
        // No Content-Length, no Transfer-Encoding — read until EOF.
        let raw = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nbody-bytes-here";
        let mut s = VecStream::new(raw, 9999);
        let resp = HttpResponse::read_from(&mut s).expect("parse");
        assert_eq!(resp.status, 200);
        assert_eq!(&resp.body, b"body-bytes-here");
    }

    #[test]
    fn multi_set_cookie_concatenates_with_newline() {
        // Three Set-Cookie headers — the HashMap-based store keeps
        // them under one key joined by '\n'.
        let raw = b"HTTP/1.1 200 OK\r\n\
            Content-Length: 0\r\n\
            Set-Cookie: a=1\r\n\
            Set-Cookie: b=2\r\n\
            Set-Cookie: c=3\r\n\
            \r\n";
        let mut s = VecStream::new(raw, 9999);
        let resp = HttpResponse::read_from(&mut s).expect("parse");
        let cookies = resp.headers.get("set-cookie").expect("set-cookie present");
        let split: Vec<&str> = cookies.split('\n').collect();
        assert_eq!(split, vec!["a=1", "b=2", "c=3"]);
    }
}
