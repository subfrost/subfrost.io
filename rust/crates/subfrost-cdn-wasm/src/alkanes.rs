//! Metashrew-backed alkane GetData: simulate a contract's data opcode and
//! sniff the returned bytes for a renderable graphic.
//!
//! Ported from `rust/services/cdn/src/alkanes.rs`. The pure protobuf/mime code
//! is identical; the RPC transport is re-expressed over `wasi:http` (the axum
//! copy used reqwest). Upstream is `$METASHREW_URL`
//! (`https://mainnet.subfrost.io/v4/subfrost`), whose LB rewrites `"latest"` to
//! the served height and blockhash-caches `metashrew_view` — so repeated
//! simulates at tip are answered from its edge cache.
//!
//! Wire: `metashrew_view ["simulate", "0x<MessageContextParcel pb>", tag]`
//! -> `0x<SimulateResponse pb>`. calldata = LEB128 cellpack `[block, tx, opcode]`.

use serde_json::Value;

use crate::http::request;
use crate::wasi::http::types::{Method, Scheme};

pub const DEFAULT_DATA_OPCODE: u128 = 1000;

#[derive(Debug, Clone)]
pub struct SimOut {
    pub data: Vec<u8>,
    pub gas: u64,
}

/// Parsed metashrew endpoint (scheme + authority + path), from `$METASHREW_URL`.
pub struct AlkaneChain {
    scheme: Scheme,
    authority: String,
    path: String,
}

impl AlkaneChain {
    /// Parse a full URL like `https://mainnet.subfrost.io/v4/subfrost`.
    pub fn new(url: &str) -> Result<Self, String> {
        let (scheme, rest) = if let Some(r) = url.strip_prefix("https://") {
            (Scheme::Https, r)
        } else if let Some(r) = url.strip_prefix("http://") {
            (Scheme::Http, r)
        } else {
            return Err(format!("metashrew url missing scheme: {url}"));
        };
        let (authority, path) = match rest.find('/') {
            Some(i) => (rest[..i].to_string(), rest[i..].to_string()),
            None => (rest.to_string(), "/".to_string()),
        };
        if authority.is_empty() {
            return Err(format!("metashrew url missing host: {url}"));
        }
        Ok(Self {
            scheme,
            authority,
            path,
        })
    }

    fn rpc(&self, method: &str, params: Value) -> Result<Value, String> {
        let envelope = serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
        });
        let body = serde_json::to_vec(&envelope).map_err(|e| format!("rpc encode: {e}"))?;
        let resp = request(
            Method::Post,
            self.scheme.clone(),
            &self.authority,
            &self.path,
            &[("content-type", b"application/json")],
            Some(&body),
        )?;
        if resp.status != 200 {
            return Err(format!("{method}: http {}", resp.status));
        }
        let v: Value = serde_json::from_slice(&resp.body).map_err(|e| format!("rpc json: {e}"))?;
        if let Some(err) = v.get("error") {
            if !err.is_null() {
                return Err(format!("{method}: {err}"));
            }
        }
        Ok(v.get("result").cloned().unwrap_or(Value::Null))
    }

    pub fn tip_height(&self) -> Result<u64, String> {
        let v = self.rpc("metashrew_height", Value::Array(vec![]))?;
        v.as_u64()
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            .ok_or_else(|| "bad metashrew_height result".to_string())
    }

    fn view(&self, name: &str, input: &[u8], tag: &str) -> Result<Vec<u8>, String> {
        let hex_in = format!("0x{}", hex::encode(input));
        let v = self.rpc("metashrew_view", serde_json::json!([name, hex_in, tag]))?;
        let s = v.as_str().ok_or("view result not a string")?;
        hex::decode(s.trim_start_matches("0x")).map_err(|e| format!("view hex: {e}"))
    }

    /// Run `simulate` for `[block, tx, opcode]` at `tag`. Ok(None) = executed
    /// but reverted/empty (a real "no graphic"); transport errors are Err.
    pub fn simulate_call(
        &self,
        block: u128,
        tx: u128,
        opcode: u128,
        tag: &str,
    ) -> Result<Option<SimOut>, String> {
        let parcel = encode_parcel(&[block, tx, opcode]);
        let out = self.view("simulate", &parcel, tag)?;
        Ok(decode_simulate_response(&out))
    }

    /// Discover the data opcode from the contract's `__meta` ABI. Defaults to
    /// 1000 on any failure or when no data-like method is declared.
    pub fn discover_data_opcode(&self, block: u128, tx: u128) -> u128 {
        let parcel = encode_parcel(&[block, tx]);
        let Ok(bytes) = self.view("meta", &parcel, "latest") else {
            return DEFAULT_DATA_OPCODE;
        };
        let Ok(meta) = serde_json::from_slice::<Value>(&bytes) else {
            return DEFAULT_DATA_OPCODE;
        };
        find_data_opcode(&meta).unwrap_or(DEFAULT_DATA_OPCODE)
    }
}

/// Scan a `__meta` ABI JSON for a data/image getter's opcode.
pub fn find_data_opcode(meta: &Value) -> Option<u128> {
    let methods = meta.get("methods")?.as_array()?;
    let is_data = |n: &str| {
        let n = n.to_ascii_lowercase();
        n == "data" || n == "get_data" || n == "getdata" || n == "image" || n == "get_image"
    };
    for m in methods {
        let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if is_data(name) {
            let op = m.get("opcode")?;
            return op
                .as_u64()
                .map(u128::from)
                .or_else(|| op.as_str().and_then(|s| s.parse().ok()));
        }
    }
    None
}

// ---- protobuf (hand-rolled, alkanes.proto layouts) ------------------------

fn leb(mut v: u128, out: &mut Vec<u8>) {
    loop {
        let byte = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

/// MessageContextParcel with only the fields simulate needs: height (4) and
/// calldata (5) = LEB-encoded cellpack integers.
pub fn encode_parcel(cellpack: &[u128]) -> Vec<u8> {
    let mut calldata = Vec::new();
    for &v in cellpack {
        leb(v, &mut calldata);
    }
    let mut out = Vec::with_capacity(calldata.len() + 12);
    out.push(4 << 3);
    leb(1_000_000, &mut out);
    out.push((5 << 3) | 2);
    leb(calldata.len() as u128, &mut out);
    out.extend_from_slice(&calldata);
    out
}

/// Minimal protobuf walker: yields (field, wire, varint|slice) over a buffer.
fn pb_fields(buf: &[u8]) -> Vec<(u32, u8, u128, &[u8])> {
    let mut out = Vec::new();
    let mut i = 0usize;
    let read_varint = |buf: &[u8], i: &mut usize| -> Option<u128> {
        let mut v: u128 = 0;
        let mut shift = 0u32;
        loop {
            let b = *buf.get(*i)?;
            *i += 1;
            v |= u128::from(b & 0x7f) << shift;
            if b & 0x80 == 0 {
                return Some(v);
            }
            shift += 7;
            if shift > 126 {
                return None;
            }
        }
    };
    while i < buf.len() {
        let Some(key) = read_varint(buf, &mut i) else {
            break;
        };
        let field = (key >> 3) as u32;
        let wire = (key & 7) as u8;
        match wire {
            0 => {
                let Some(v) = read_varint(buf, &mut i) else {
                    break;
                };
                out.push((field, wire, v, &buf[0..0]));
            }
            2 => {
                let Some(len) = read_varint(buf, &mut i) else {
                    break;
                };
                let len = len as usize;
                if i + len > buf.len() {
                    break;
                }
                out.push((field, wire, 0, &buf[i..i + len]));
                i += len;
            }
            5 => i += 4,
            1 => i += 8,
            _ => break,
        }
    }
    out
}

/// SimulateResponse -> SimOut. None when the execution errored (field 3
/// non-empty) or produced no data bytes.
pub fn decode_simulate_response(buf: &[u8]) -> Option<SimOut> {
    let mut data: Vec<u8> = Vec::new();
    let mut gas = 0u64;
    let mut errored = false;
    for (field, wire, v, slice) in pb_fields(buf) {
        match (field, wire) {
            (1, 2) => {
                for (f2, w2, _, s2) in pb_fields(slice) {
                    if f2 == 3 && w2 == 2 {
                        data = s2.to_vec();
                    }
                }
            }
            (2, 0) => gas = v as u64,
            (3, 2) => errored = !slice.is_empty(),
            _ => {}
        }
    }
    if errored || data.is_empty() {
        return None;
    }
    Some(SimOut { data, gas })
}

// ---- graphic sniff --------------------------------------------------------

/// Magic-byte sniff for the renderable formats we serve.
pub fn sniff_mime(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if data.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    // AVIF / HEIC: ISO-BMFF `ftyp` box (bytes 4..8) whose major or compatible
    // brand mentions avif/avis (AVIF) or heic/heix/heif (HEIC).
    if data.len() >= 12 && &data[4..8] == b"ftyp" {
        let brands = &data[8..data.len().min(40)];
        if brands.windows(4).any(|w| w == b"avif" || w == b"avis") {
            return Some("image/avif");
        }
        if brands.windows(4).any(|w| matches!(w, b"heic" | b"heix" | b"heif" | b"hevc")) {
            return Some("image/heic");
        }
    }
    sniff_svg(data)
}

fn sniff_svg(data: &[u8]) -> Option<&'static str> {
    let head = &data[..data.len().min(512)];
    let text = std::str::from_utf8(head).ok()?;
    let t = text.trim_start_matches('\u{feff}').trim_start();
    if t.starts_with("<svg") || (t.starts_with("<?xml") && text.contains("<svg")) {
        return Some("image/svg+xml");
    }
    None
}

pub fn ext_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/avif" => "avif",
        "image/heic" => "heic",
        "image/svg+xml" => "svg",
        _ => "bin",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parcel_encoding_matches_known_layout() {
        let p = encode_parcel(&[2, 0, 1000]);
        assert_eq!(hex::encode(&p), "20c0843d2a040200e807");
    }

    #[test]
    fn simulate_response_roundtrip() {
        let inner = [0x1a, 0x02, 0xde, 0xad];
        let mut buf = vec![0x0a, inner.len() as u8];
        buf.extend_from_slice(&inner);
        buf.extend_from_slice(&[0x10, 42]);
        let out = decode_simulate_response(&buf).unwrap();
        assert_eq!(out.data, vec![0xde, 0xad]);
        assert_eq!(out.gas, 42);
    }

    #[test]
    fn simulate_response_error_is_none() {
        let mut buf = vec![0x0a, 0x04, 0x1a, 0x02, 0xde, 0xad];
        buf.extend_from_slice(&[0x1a, 0x04, b'o', b'o', b'p', b's']);
        assert!(decode_simulate_response(&buf).is_none());
    }

    #[test]
    fn sniffs_common_formats() {
        assert_eq!(
            sniff_mime(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0]),
            Some("image/png")
        );
        assert_eq!(sniff_mime(b"GIF89a\x00"), Some("image/gif"));
        assert_eq!(sniff_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff_mime(b"\x00\x00\x00\x20ftypavifmif1"), Some("image/avif"));
        assert_eq!(sniff_mime(b"\x00\x00\x00\x18ftypmif1avif"), Some("image/avif"));
        assert_eq!(sniff_mime(b"\x00\x00\x00\x18ftypheic\x00\x00"), Some("image/heic"));
        assert_eq!(sniff_mime(b"  <svg xmlns='x'></svg>"), Some("image/svg+xml"));
        assert_eq!(sniff_mime(b"<?xml version='1.0'?><svg/>"), Some("image/svg+xml"));
        assert_eq!(sniff_mime(b"hello world, not an image"), None);
    }

    #[test]
    fn meta_opcode_discovery() {
        let meta: Value = serde_json::json!({
            "methods": [
                {"name": "initialize", "opcode": 0},
                {"name": "get_data", "opcode": 1002},
            ]
        });
        assert_eq!(find_data_opcode(&meta), Some(1002));
        let none: Value = serde_json::json!({"methods": [{"name": "mint", "opcode": 77}]});
        assert_eq!(find_data_opcode(&none), None);
    }

    #[test]
    fn parses_metashrew_url() {
        let c = AlkaneChain::new("https://mainnet.subfrost.io/v4/subfrost").unwrap();
        assert_eq!(c.authority, "mainnet.subfrost.io");
        assert_eq!(c.path, "/v4/subfrost");
        assert!(AlkaneChain::new("mainnet.subfrost.io/x").is_err());
    }
}
