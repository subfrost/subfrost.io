//! The alkane-graphics manifest — a single JSON object on the assets bucket
//! (`alkanes/manifest.json` by default), the source of truth for how each
//! alkane's graphic is served:
//!
//!   static  — GetData is a constant segment; serve the saved capture forever.
//!   dynamic — GetData can change (rare); serve per-tip via simulate.
//!   pending — captured + saved, classification still running; served like
//!             static until the verdict lands.
//!   none    — the alkane answers GetData with nothing renderable.
//!
//! Concurrency: replicas do read-modify-write with GCS `ifGenerationMatch`
//! preconditions (a 412 refetches and retries), so concurrent resolves can't
//! clobber each other. Reads are cached in-process for a short TTL — the
//! manifest only changes when a new alkane resolves or a verdict lands.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::gcs::GcsClient;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Static,
    Dynamic,
    Pending,
    None,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Entry {
    pub status: Status,
    /// The data opcode used (1000 unless `__meta` declared otherwise).
    pub opcode: u64,
    /// Saved capture's object key on the assets bucket (static/pending/dynamic
    /// all save the instantaneous capture; dynamic just doesn't serve it).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    /// Whether a curated asset (alkanes/mainnet/<b>-<t>.png) existed at
    /// resolve time — curated art keeps winning over on-chain captures.
    #[serde(default)]
    pub curated: bool,
    /// Which routine produced the static/dynamic verdict. This service writes
    /// "differential-v1" (same bytes+gas across historical heights); the full
    /// wasm static-segment analyzer can overwrite with its own tag.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classifier: Option<String>,
    /// Metashrew height the capture ran at.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u64>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub version: u32,
    /// Keyed by "block:tx".
    #[serde(default)]
    pub entries: BTreeMap<String, Entry>,
}

struct Cached {
    at: Instant,
    generation: i64,
    manifest: Arc<Manifest>,
}

pub struct ManifestStore {
    gcs: GcsClient,
    bucket: String,
    object: String,
    cache: RwLock<Option<Cached>>,
}

const CACHE_TTL: Duration = Duration::from_secs(20);
const RMW_ATTEMPTS: usize = 4;

impl ManifestStore {
    pub fn new(gcs: GcsClient, bucket: String, object: String) -> Self {
        Self { gcs, bucket, object, cache: RwLock::new(None) }
    }

    async fn load(&self) -> anyhow::Result<(Arc<Manifest>, i64)> {
        {
            let guard = self.cache.read().await;
            if let Some(c) = guard.as_ref() {
                if c.at.elapsed() < CACHE_TTL {
                    return Ok((c.manifest.clone(), c.generation));
                }
            }
        }
        let fetched = self
            .gcs
            .fetch_bytes_with_generation(&self.bucket, &self.object)
            .await?;
        let (manifest, generation) = match fetched {
            Some((bytes, gen)) => (
                serde_json::from_slice::<Manifest>(&bytes).unwrap_or_default(),
                gen,
            ),
            // Absent manifest = empty, generation 0 (ifGenerationMatch=0 is
            // GCS's only-if-absent create).
            None => (Manifest::default(), 0),
        };
        let arc = Arc::new(manifest);
        *self.cache.write().await = Some(Cached {
            at: Instant::now(),
            generation,
            manifest: arc.clone(),
        });
        Ok((arc, generation))
    }

    pub async fn get(&self, id: &str) -> Option<Entry> {
        let (m, _) = self.load().await.ok()?;
        m.entries.get(id).cloned()
    }

    /// Insert/replace one entry with generation-preconditioned RMW.
    pub async fn upsert(&self, id: &str, entry: Entry) -> anyhow::Result<()> {
        for _ in 0..RMW_ATTEMPTS {
            // Bypass the read cache: RMW must see the live generation.
            *self.cache.write().await = None;
            let (current, generation) = self.load().await?;
            let mut next = (*current).clone();
            next.version = next.version.max(1);
            next.entries.insert(id.to_string(), entry.clone());
            let body = serde_json::to_vec_pretty(&next)?;
            let ok = self
                .gcs
                .upload_object(
                    &self.bucket,
                    &self.object,
                    body,
                    "application/json",
                    Some(generation),
                )
                .await?;
            if ok {
                *self.cache.write().await = None; // next read refetches
                return Ok(());
            }
            // 412 — someone else wrote; refetch and merge again.
        }
        anyhow::bail!("manifest RMW lost {} generation races", RMW_ATTEMPTS)
    }
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_serde_roundtrip() {
        let mut m = Manifest { version: 1, entries: BTreeMap::new() };
        m.entries.insert(
            "2:0".into(),
            Entry {
                status: Status::Static,
                opcode: 1000,
                object: Some("alkanes/onchain/2-0.png".into()),
                mime: Some("image/png".into()),
                bytes: Some(81244),
                curated: true,
                classifier: Some("differential-v1".into()),
                height: Some(956_900),
                updated_at: "2026-07-20T00:00:00Z".into(),
            },
        );
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains(r#""status":"static""#));
        let back: Manifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.entries["2:0"].status, Status::Static);
        assert!(back.entries["2:0"].curated);
    }

    #[test]
    fn unknown_fields_and_missing_optionals_tolerated() {
        let json = r#"{"entries":{"4:797":{"status":"dynamic","opcode":1000,"updated_at":"x","future_field":1}}}"#;
        let m: Manifest = serde_json::from_str(json).unwrap();
        assert_eq!(m.entries["4:797"].status, Status::Dynamic);
        assert!(!m.entries["4:797"].curated);
    }
}
