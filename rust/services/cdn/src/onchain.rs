//! The opportunistic on-chain alkane-graphics pipeline (flex's design):
//!
//!   * First time an alkane is resolved here, capture its GetData output and
//!     save it to the assets bucket NO MATTER WHAT (`alkanes/onchain/…`).
//!   * A classification routine decides how it gets SERVED from then on:
//!     static segment -> the saved file forever; dynamic (rare) -> per-tip
//!     simulate through the blockhash-cached /metashrew LB; nothing
//!     renderable -> fall through (curated file or 404).
//!   * Curated art (`alkanes/mainnet/<b>-<t>.png`) always wins when present —
//!     the pipeline only changes behavior for alkanes with no curated asset.
//!
//! Classification here is `differential-v1`: identical bytes AND gas across
//! historical heights. It's conservative — anything unprovable is marked
//! dynamic, which still serves correct images (just via the cached simulate
//! path). The full wasm static-segment analyzer (subfrost gRPC backend) can
//! overwrite entries with a stronger verdict; the manifest's `classifier`
//! field records which routine ruled.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

use crate::alkanes::{ext_for_mime, sniff_mime, AlkaneChain, SimOut};
use crate::gcs::GcsClient;
use crate::manifest::{now_iso, Entry, ManifestStore, Status};

/// What the request handler should do for GET /alkanes/<b>_<t>.
pub enum Serve {
    /// Proxy this object from the assets bucket (curated or saved capture).
    Stored(String),
    /// Serve these bytes directly (dynamic simulate result). Short cache.
    Bytes { data: Arc<Vec<u8>>, mime: String },
    /// Not ours to answer — legacy behavior (curated object then 404).
    Fallthrough,
}

pub struct Onchain {
    chain: AlkaneChain,
    gcs: GcsClient,
    manifest: Arc<ManifestStore>,
    assets_bucket: String,
    /// (id, tip-height) -> dynamic simulate result. Small and short-lived —
    /// the upstream LB is the real cache; this only absorbs request bursts.
    dyn_cache: Mutex<DynCache>,
    /// Tip height poll memo.
    tip: Mutex<Option<(Instant, u64)>>,
    /// Alkanes with a resolve/classify task in flight (single-flight).
    inflight: Arc<Mutex<HashSet<String>>>,
}

type DynCache = HashMap<(String, u64), (Instant, Arc<Vec<u8>>, String)>;

const DYN_CACHE_TTL: Duration = Duration::from_secs(30);
const DYN_CACHE_MAX: usize = 256;
const TIP_TTL: Duration = Duration::from_secs(15);
/// Historical probe offsets for differential classification (~1 day, ~1 week).
const PROBE_OFFSETS: [u64; 2] = [144, 1008];

impl Onchain {
    pub fn new(
        chain: AlkaneChain,
        gcs: GcsClient,
        manifest: Arc<ManifestStore>,
        assets_bucket: String,
    ) -> Self {
        Self {
            chain,
            gcs,
            manifest,
            assets_bucket,
            dyn_cache: Mutex::new(HashMap::new()),
            tip: Mutex::new(None),
            inflight: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    fn curated_object(block: u128, tx: u128) -> String {
        format!("alkanes/mainnet/{block}-{tx}.png")
    }

    fn capture_object(block: u128, tx: u128, ext: &str) -> String {
        format!("alkanes/onchain/{block}-{tx}.{ext}")
    }

    /// Decide how to serve GET /alkanes/<block>_<tx>.
    pub async fn serve(self: &Arc<Self>, block: u128, tx: u128) -> Serve {
        let id = format!("{block}:{tx}");

        match self.manifest.get(&id).await {
            Some(e) if e.curated => Serve::Stored(Self::curated_object(block, tx)),
            Some(e) => match e.status {
                Status::Static | Status::Pending => match e.object {
                    Some(obj) => Serve::Stored(obj),
                    None => Serve::Fallthrough,
                },
                Status::None => Serve::Fallthrough,
                Status::Dynamic => self.serve_dynamic(&id, block, tx, &e).await,
            },
            // Never resolved: keep today's behavior for this request (curated
            // object or 404) and kick the capture+classify off in background.
            None => {
                self.spawn_resolve(block, tx);
                Serve::Fallthrough
            }
        }
    }

    async fn tip_height(&self) -> Option<u64> {
        {
            let memo = self.tip.lock().await;
            if let Some((at, h)) = *memo {
                if at.elapsed() < TIP_TTL {
                    return Some(h);
                }
            }
        }
        match self.chain.tip_height().await {
            Ok(h) => {
                *self.tip.lock().await = Some((Instant::now(), h));
                Some(h)
            }
            Err(e) => {
                tracing::warn!(error = %e, "metashrew_height failed");
                None
            }
        }
    }

    async fn serve_dynamic(&self, id: &str, block: u128, tx: u128, e: &Entry) -> Serve {
        let Some(tip) = self.tip_height().await else {
            // Chain unreachable — degrade to the saved capture if any.
            return match &e.object {
                Some(obj) => Serve::Stored(obj.clone()),
                None => Serve::Fallthrough,
            };
        };
        let key = (id.to_string(), tip);
        {
            let cache = self.dyn_cache.lock().await;
            if let Some((at, data, mime)) = cache.get(&key) {
                if at.elapsed() < DYN_CACHE_TTL {
                    return Serve::Bytes { data: data.clone(), mime: mime.clone() };
                }
            }
        }
        // "latest" is rewritten to the served height by the /metashrew LB and
        // cached by block hash there — this is the ingress-does-the-caching
        // path; worst case (edge cold) it's one real simulate.
        match self.chain.simulate_call(block, tx, u128::from(e.opcode), "latest").await {
            Ok(Some(SimOut { data, .. })) => {
                let mime = sniff_mime(&data).unwrap_or("application/octet-stream").to_string();
                let data = Arc::new(data);
                let mut cache = self.dyn_cache.lock().await;
                if cache.len() >= DYN_CACHE_MAX {
                    cache.retain(|_, (at, _, _)| at.elapsed() < DYN_CACHE_TTL);
                    if cache.len() >= DYN_CACHE_MAX {
                        cache.clear();
                    }
                }
                cache.insert(key, (Instant::now(), data.clone(), mime.clone()));
                Serve::Bytes { data, mime }
            }
            Ok(None) => match &e.object {
                Some(obj) => Serve::Stored(obj.clone()), // reverted at tip — last capture
                None => Serve::Fallthrough,
            },
            Err(err) => {
                tracing::warn!(id, error = %err, "dynamic simulate failed");
                match &e.object {
                    Some(obj) => Serve::Stored(obj.clone()),
                    None => Serve::Fallthrough,
                }
            }
        }
    }

    /// Fire the capture+classify task once per alkane per process.
    fn spawn_resolve(self: &Arc<Self>, block: u128, tx: u128) {
        let this = self.clone();
        tokio::spawn(async move {
            let id = format!("{block}:{tx}");
            {
                let mut inflight = this.inflight.lock().await;
                if !inflight.insert(id.clone()) {
                    return; // already resolving
                }
            }
            if let Err(e) = this.resolve(block, tx).await {
                tracing::warn!(id, error = %e, "alkane resolve failed");
            }
            this.inflight.lock().await.remove(&id);
        });
    }

    /// Capture GetData, save it unconditionally, write the manifest entry,
    /// then classify static vs dynamic.
    async fn resolve(&self, block: u128, tx: u128) -> anyhow::Result<()> {
        let id = format!("{block}:{tx}");
        let curated = self
            .gcs
            .object_exists(&self.assets_bucket, &Self::curated_object(block, tx))
            .await
            .unwrap_or(false);
        let opcode = self.chain.discover_data_opcode(block, tx).await;
        let tip = self.tip_height().await;

        let sim = self.chain.simulate_call(block, tx, opcode, "latest").await?;
        let Some(SimOut { data, gas }) = sim else {
            // Executed but nothing came back — record "none" so we don't
            // re-simulate on every cold request for an imageless alkane.
            self.manifest
                .upsert(&id, Entry {
                    status: Status::None,
                    opcode: opcode as u64,
                    object: None,
                    mime: None,
                    bytes: None,
                    curated,
                    classifier: None,
                    height: tip,
                    updated_at: now_iso(),
                })
                .await?;
            return Ok(());
        };

        let Some(mime) = sniff_mime(&data) else {
            // Data, but not a graphic — same "none" outcome for serving.
            self.manifest
                .upsert(&id, Entry {
                    status: Status::None,
                    opcode: opcode as u64,
                    object: None,
                    mime: None,
                    bytes: Some(data.len() as u64),
                    curated,
                    classifier: None,
                    height: tip,
                    updated_at: now_iso(),
                })
                .await?;
            return Ok(());
        };

        // Save the instantaneous capture no matter what (flex: "no matter
        // what, whether or not it actually will serve that image").
        let object = Self::capture_object(block, tx, ext_for_mime(mime));
        self.gcs
            .upload_object(&self.assets_bucket, &object, data.clone(), mime, None)
            .await?;

        self.manifest
            .upsert(&id, Entry {
                status: Status::Pending,
                opcode: opcode as u64,
                object: Some(object.clone()),
                mime: Some(mime.to_string()),
                bytes: Some(data.len() as u64),
                curated,
                classifier: None,
                height: tip,
                updated_at: now_iso(),
            })
            .await?;

        // Classify: identical bytes + gas at historical heights => static.
        let verdict = self.classify(block, tx, opcode, &data, gas).await;
        self.manifest
            .upsert(&id, Entry {
                status: verdict,
                opcode: opcode as u64,
                object: Some(object),
                mime: Some(mime.to_string()),
                bytes: Some(data.len() as u64),
                curated,
                classifier: Some("differential-v1".to_string()),
                height: tip,
                updated_at: now_iso(),
            })
            .await?;
        Ok(())
    }

    /// Conservative differential probe. Static only when EVERY successful
    /// historical probe reproduces the exact bytes and gas; unprovable (all
    /// probes failed, e.g. the alkane is younger than the offsets) or any
    /// mismatch => dynamic. Dynamic mis-marks cost latency, never correctness.
    async fn classify(
        &self,
        block: u128,
        tx: u128,
        opcode: u128,
        baseline: &[u8],
        baseline_gas: u64,
    ) -> Status {
        let Some(tip) = self.tip_height().await else {
            return Status::Dynamic;
        };
        let mut confirmed = 0usize;
        for off in PROBE_OFFSETS {
            let Some(h) = tip.checked_sub(off) else { continue };
            match self.chain.simulate_call(block, tx, opcode, &h.to_string()).await {
                Ok(Some(SimOut { data, gas })) => {
                    if data != baseline || gas != baseline_gas {
                        return Status::Dynamic;
                    }
                    confirmed += 1;
                }
                // Reverted at that height (likely pre-creation) — no signal.
                Ok(None) => {}
                Err(e) => {
                    tracing::debug!(error = %e, height = h, "classify probe failed");
                }
            }
        }
        if confirmed > 0 {
            Status::Static
        } else {
            Status::Dynamic
        }
    }
}
