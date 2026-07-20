//! The opportunistic on-chain alkane-graphics pipeline (flex's design), ported
//! from `rust/services/cdn/src/onchain.rs` and adapted to the one-shot wasm
//! model: there is no background `tokio::spawn`, so the first request for an
//! unseen alkane resolves **inline** — capture GetData, save it to the assets
//! bucket NO MATTER WHAT (`alkanes/onchain/…`), write the manifest verdict, and
//! serve the result in the same request. Subsequent requests read the manifest.
//!
//!   * Curated art (`alkanes/mainnet/<b>-<t>.png`) always wins when present.
//!   * static  -> serve the saved capture forever.
//!   * dynamic -> per-tip simulate through the blockhash-cached LB.
//!   * none    -> fall through (curated file or 404).
//!
//! Single-flight across concurrent resolves is handled by GCS itself: the
//! capture upload is create-only where it matters and the manifest RMW is
//! generation-preconditioned, so racers converge instead of clobbering.

use crate::alkanes::{ext_for_mime, sniff_mime, AlkaneChain, SimOut};
use crate::gcs::Gcs;
use crate::manifest::{self, Entry, Status};

/// Historical probe offsets for differential classification (~1 day, ~1 week).
const PROBE_OFFSETS: [u64; 2] = [144, 1008];

/// What the request handler should do for GET /alkanes/<b>_<t>.
pub enum Serve {
    /// Proxy this object from the assets bucket (curated or saved capture).
    Stored(String),
    /// Serve these bytes directly (dynamic / freshly-resolved). Short cache.
    Bytes { data: Vec<u8>, mime: String },
    /// Not ours to answer — legacy behavior (curated object then 404).
    Fallthrough,
}

pub struct Onchain {
    chain: AlkaneChain,
    gcs: Gcs,
    assets_bucket: String,
    manifest_object: String,
}

impl Onchain {
    pub fn new(chain: AlkaneChain, gcs: Gcs, assets_bucket: String, manifest_object: String) -> Self {
        Self {
            chain,
            gcs,
            assets_bucket,
            manifest_object,
        }
    }

    fn curated_object(block: u128, tx: u128) -> String {
        format!("alkanes/mainnet/{block}-{tx}.png")
    }

    fn capture_object(block: u128, tx: u128, ext: &str) -> String {
        format!("alkanes/onchain/{block}-{tx}.{ext}")
    }

    fn get_entry(&self, id: &str) -> Result<Option<Entry>, String> {
        manifest::get(&self.gcs, &self.assets_bucket, &self.manifest_object, id)
    }

    fn upsert_entry(&self, id: &str, entry: Entry) -> Result<(), String> {
        manifest::upsert(&self.gcs, &self.assets_bucket, &self.manifest_object, id, entry)
    }

    /// Decide how to serve GET /alkanes/<block>_<tx>.
    pub fn serve(&self, block: u128, tx: u128) -> Serve {
        let id = format!("{block}:{tx}");
        match self.get_entry(&id) {
            Ok(Some(e)) => self.serve_entry(block, tx, &e),
            // Never resolved: capture + classify + serve inline (this request).
            Ok(None) => self.resolve_and_serve(block, tx),
            // Manifest unreachable — degrade to legacy (curated file or 404).
            Err(_) => Serve::Fallthrough,
        }
    }

    fn serve_entry(&self, block: u128, tx: u128, e: &Entry) -> Serve {
        if e.curated {
            return Serve::Stored(Self::curated_object(block, tx));
        }
        match e.status {
            Status::Static | Status::Pending => match &e.object {
                Some(obj) => Serve::Stored(obj.clone()),
                None => Serve::Fallthrough,
            },
            Status::None => Serve::Fallthrough,
            Status::Dynamic => self.serve_dynamic(block, tx, e),
        }
    }

    /// Dynamic: re-simulate at tip through the blockhash-cached LB.
    fn serve_dynamic(&self, block: u128, tx: u128, e: &Entry) -> Serve {
        match self
            .chain
            .simulate_call(block, tx, u128::from(e.opcode), "latest")
        {
            Ok(Some(SimOut { data, .. })) => {
                let mime = sniff_mime(&data)
                    .unwrap_or("application/octet-stream")
                    .to_string();
                Serve::Bytes { data, mime }
            }
            // Reverted at tip or chain error — fall back to the last capture.
            _ => match &e.object {
                Some(obj) => Serve::Stored(obj.clone()),
                None => Serve::Fallthrough,
            },
        }
    }

    /// Inline capture + classify + serve for a never-seen alkane.
    fn resolve_and_serve(&self, block: u128, tx: u128) -> Serve {
        let id = format!("{block}:{tx}");
        let curated_obj = Self::curated_object(block, tx);
        let curated = self
            .gcs
            .object_exists(&self.assets_bucket, &curated_obj)
            .unwrap_or(false);

        // Curated art wins and needs no on-chain fetch: record it so subsequent
        // requests short-circuit, and serve the curated file.
        if curated {
            let _ = self.upsert_entry(
                &id,
                Entry {
                    status: Status::Static,
                    opcode: 1000,
                    object: Some(curated_obj.clone()),
                    mime: None,
                    bytes: None,
                    curated: true,
                    classifier: Some("curated".to_string()),
                    height: None,
                    updated_at: manifest::now_iso(),
                },
            );
            return Serve::Stored(curated_obj);
        }

        let opcode = self.chain.discover_data_opcode(block, tx);
        let tip = self.chain.tip_height().ok();

        let sim = match self.chain.simulate_call(block, tx, opcode, "latest") {
            Ok(s) => s,
            // Transport error: don't poison the manifest — just fall through so
            // a later request retries.
            Err(_) => return Serve::Fallthrough,
        };

        let Some(SimOut { data, gas }) = sim else {
            // Executed but nothing came back — record "none" so cold requests
            // for an imageless alkane stop re-simulating.
            let _ = self.upsert_entry(&id, self.none_entry(opcode, None, tip));
            return Serve::Fallthrough;
        };

        let Some(mime) = sniff_mime(&data) else {
            // Data, but not a graphic — same "none" serving outcome.
            let _ = self.upsert_entry(&id, self.none_entry(opcode, Some(data.len() as u64), tip));
            return Serve::Fallthrough;
        };

        // Save the instantaneous capture no matter what.
        let object = Self::capture_object(block, tx, ext_for_mime(mime));
        let _ = self
            .gcs
            .upload(&self.assets_bucket, &object, data.clone(), mime, None);

        // Classify (identical bytes + gas across historical heights => static).
        let verdict = self.classify(block, tx, opcode, &data, gas);
        let _ = self.upsert_entry(
            &id,
            Entry {
                status: verdict,
                opcode: opcode as u64,
                object: Some(object),
                mime: Some(mime.to_string()),
                bytes: Some(data.len() as u64),
                curated: false,
                classifier: Some("differential-v1".to_string()),
                height: tip,
                updated_at: manifest::now_iso(),
            },
        );

        Serve::Bytes {
            data,
            mime: mime.to_string(),
        }
    }

    fn none_entry(&self, opcode: u128, bytes: Option<u64>, height: Option<u64>) -> Entry {
        Entry {
            status: Status::None,
            opcode: opcode as u64,
            object: None,
            mime: None,
            bytes,
            curated: false,
            classifier: None,
            height,
            updated_at: manifest::now_iso(),
        }
    }

    /// Conservative differential probe. Static only when EVERY successful
    /// historical probe reproduces the exact bytes and gas; unprovable or any
    /// mismatch => dynamic (mis-marking dynamic costs latency, not correctness).
    fn classify(&self, block: u128, tx: u128, opcode: u128, baseline: &[u8], baseline_gas: u64) -> Status {
        let Ok(tip) = self.chain.tip_height() else {
            return Status::Dynamic;
        };
        let mut confirmed = 0usize;
        for off in PROBE_OFFSETS {
            let Some(h) = tip.checked_sub(off) else {
                continue;
            };
            match self.chain.simulate_call(block, tx, opcode, &h.to_string()) {
                Ok(Some(SimOut { data, gas })) => {
                    if data != baseline || gas != baseline_gas {
                        return Status::Dynamic;
                    }
                    confirmed += 1;
                }
                // Reverted at that height (likely pre-creation) — no signal.
                Ok(None) => {}
                Err(_) => {}
            }
        }
        if confirmed > 0 {
            Status::Static
        } else {
            Status::Dynamic
        }
    }
}
