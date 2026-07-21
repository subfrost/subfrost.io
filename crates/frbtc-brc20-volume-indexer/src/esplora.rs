//! Minimal Esplora tx model — the subset of `esplora_tx` / `esplora_address::txs`
//! the volume model reads. Production history is pulled with the `esplora_*`
//! JSON-RPC in alkanes-cli (self-hosted esplora via the subfrost RPC), never
//! mempool.space.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Tx {
    pub txid: String,
    pub vin: Vec<Vin>,
    pub vout: Vec<Vout>,
    #[serde(default)]
    pub status: Status,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Status {
    pub block_height: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Vin {
    /// The output this input spends — carries the funding script/address, so we
    /// can tell a signer-funded spend from an external deposit.
    #[serde(default)]
    pub prevout: Option<Vout>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Vout {
    /// script_pubkey, hex.
    pub scriptpubkey: String,
    #[serde(default)]
    pub scriptpubkey_address: Option<String>,
    #[serde(default)]
    pub scriptpubkey_type: Option<String>,
    pub value: u64,
}

impl Vout {
    /// Decode the hex `scriptpubkey` to raw bytes.
    pub fn scriptpubkey_bytes(&self) -> Option<Vec<u8>> {
        hex_decode(&self.scriptpubkey)
    }
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let b = s.as_bytes();
    let val = |c: u8| -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            b'A'..=b'F' => Some(c - b'A' + 10),
            _ => None,
        }
    };
    let mut i = 0;
    while i < b.len() {
        out.push((val(b[i])? << 4) | val(b[i + 1])?);
        i += 2;
    }
    Some(out)
}
