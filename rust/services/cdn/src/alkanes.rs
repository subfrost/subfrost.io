//! Metashrew-backed alkane GetData: simulate a contract's data opcode and
//! sniff the returned bytes for a renderable graphic.
//!
//! Upstream is the public metashrew JSON-RPC LB (mainnet.subfrost.io
//! /metashrew), which rewrites `"latest"` to its served height and caches
//! `metashrew_view` responses keyed by block hash — so repeated simulates at
//! tip are answered from the edge cache, exactly the strategy flex described.
//!
//! Wire format: `metashrew_view ["simulate", "0x<MessageContextParcel pb>",
//! "<height>"|"latest"]` -> `0x<SimulateResponse pb>`. Both messages are tiny
//! (alkanes.proto), so the protobuf is hand-rolled here rather than pulling in
//! prost + codegen:
//!   MessageContextParcel { 4: height u64, 5: calldata bytes }   (rest default)
//!   SimulateResponse     { 1: ExtendedCallResponse { 3: data }, 2: gas, 3: error }
//! calldata = LEB128 varint list of the cellpack [block, tx, opcode].

use std::time::Duration;

use serde_json::Value;

pub const DEFAULT_DATA_OPCODE: u128 = 1000;

#[derive(Clone)]
pub struct AlkaneChain {
    http: reqwest::Client,
    url: String,
}

#[derive(Debug, Clone)]
pub struct SimOut {
    pub data: Vec<u8>,
    pub gas: u64,
}

impl AlkaneChain {
    pub fn new(url: String) -> anyhow::Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(20))
                .build()?,
            url,
        })
    }

    async fn rpc(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        let resp: Value = self
            .http
            .post(&self.url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
            }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        if let Some(err) = resp.get("error") {
            anyhow::bail!("{method}: {err}");
        }
        Ok(resp.get("result").cloned().unwrap_or(Value::Null))
    }

    pub async fn tip_height(&self) -> anyhow::Result<u64> {
        let v = self.rpc("metashrew_height", Value::Array(vec![])).await?;
        v.as_u64()
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            .ok_or_else(|| anyhow::anyhow!("bad metashrew_height result"))
    }

    async fn view(&self, name: &str, input: &[u8], tag: &str) -> anyhow::Result<Vec<u8>> {
        let hex_in = format!("0x{}", hex::encode(input));
        let v = self
            .rpc(
                "metashrew_view",
                serde_json::json!([name, hex_in, tag]),
            )
            .await?;
        let s = v.as_str().ok_or_else(|| anyhow::anyhow!("view result not a string"))?;
        Ok(hex::decode(s.trim_start_matches("0x"))?)
    }

    /// Run the `simulate` view for `[block, tx, opcode]` at `tag` ("latest"
    /// or a height string). Ok(None) = the call executed but reverted or
    /// returned nothing (a real "no graphic" answer, distinct from transport
    /// errors which surface as Err).
    pub async fn simulate_call(
        &self,
        block: u128,
        tx: u128,
        opcode: u128,
        tag: &str,
    ) -> anyhow::Result<Option<SimOut>> {
        let parcel = encode_parcel(&[block, tx, opcode]);
        let out = self.view("simulate", &parcel, tag).await?;
        Ok(decode_simulate_response(&out))
    }

    /// Discover the contract's data opcode from its `meta` view (`__meta`
    /// ABI). Defaults to 1000 on any failure or when no data-like method is
    /// declared — per flex, 1000 is the convention and exceptions are rare.
    pub async fn discover_data_opcode(&self, block: u128, tx: u128) -> u128 {
        let parcel = encode_parcel(&[block, tx]);
        let Ok(bytes) = self.view("meta", &parcel, "latest").await else {
            return DEFAULT_DATA_OPCODE;
        };
        let Ok(meta) = serde_json::from_slice::<Value>(&bytes) else {
            return DEFAULT_DATA_OPCODE;
        };
        find_data_opcode(&meta).unwrap_or(DEFAULT_DATA_OPCODE)
    }
}

/// Scan a `__meta` ABI JSON for a data/image getter's opcode. Accepts the
/// common shapes: `{"methods":[{"name":"get_data","opcode":1000},…]}` (name
/// variants: data/get_data/getData/image).
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
/// calldata (5) = LEB-encoded cellpack integers. Matches the ts-sdk's
/// `AlkanesRpc.simulate` defaults (everything else zero).
pub fn encode_parcel(cellpack: &[u128]) -> Vec<u8> {
    let mut calldata = Vec::new();
    for &v in cellpack {
        leb(v, &mut calldata);
    }
    let mut out = Vec::with_capacity(calldata.len() + 12);
    // field 4 (height), varint — a nominal in-range value; state comes from
    // the view's height tag, not this.
    out.push(4 << 3);
    leb(1_000_000, &mut out);
    // field 5 (calldata), length-delimited
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
        let Some(key) = read_varint(buf, &mut i) else { break };
        let field = (key >> 3) as u32;
        let wire = (key & 7) as u8;
        match wire {
            0 => {
                let Some(v) = read_varint(buf, &mut i) else { break };
                out.push((field, wire, v, &buf[0..0]));
            }
            2 => {
                let Some(len) = read_varint(buf, &mut i) else { break };
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

/// Magic-byte sniff for the renderable formats we serve. SVG is detected
/// loosely (leading whitespace/BOM then `<svg` or an XML prolog followed by
/// `<svg`), matching the explorer's wasm `detectGraphicMime`.
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
        "image/svg+xml" => "svg",
        _ => "bin",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parcel_encoding_matches_known_layout() {
        // cellpack [2, 0, 1000]: calldata = 02 00 E8 07 (LEB 1000 = E8 07).
        // parcel = 20 C0 84 3D (field4 height=1_000_000) 2A 04 02 00 E8 07.
        let p = encode_parcel(&[2, 0, 1000]);
        assert_eq!(hex::encode(&p), "20c0843d2a040200e807");
    }

    #[test]
    fn simulate_response_roundtrip() {
        // ExtendedCallResponse{data=[0xde,0xad]} gas=42 -> {1:{3:bytes},2:42}
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
        // error string set -> None even with data present
        let mut buf = vec![0x0a, 0x04, 0x1a, 0x02, 0xde, 0xad];
        buf.extend_from_slice(&[0x1a, 0x04, b'o', b'o', b'p', b's']);
        assert!(decode_simulate_response(&buf).is_none());
    }

    #[test]
    fn sniffs_common_formats() {
        assert_eq!(sniff_mime(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0]), Some("image/png"));
        assert_eq!(sniff_mime(b"GIF89a\x00"), Some("image/gif"));
        assert_eq!(sniff_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some("image/webp"));
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
}
