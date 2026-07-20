//! The alkane-graphics manifest — a single JSON object on the assets bucket
//! (`alkanes/manifest.json`), the source of truth for how each alkane's
//! graphic is served (static file vs per-tip simulate vs none).
//!
//! Ported from `rust/services/cdn/src/manifest.rs`. Concurrency is the same:
//! generation-preconditioned read-modify-write via GCS `ifGenerationMatch`,
//! retrying on 412. There is NO in-process read cache here — tlsd instantiates
//! the component per request, so `static` state wouldn't survive anyway; the
//! manifest is fetched fresh each request (and fronted by CDN edge caching).

use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::gcs::Gcs;

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
    pub opcode: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    #[serde(default)]
    pub curated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classifier: Option<String>,
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

const RMW_ATTEMPTS: usize = 4;

/// Fetch the manifest + its GCS generation (absent => empty, generation 0,
/// which is GCS's only-if-absent create precondition).
pub fn load(gcs: &Gcs, bucket: &str, object: &str) -> Result<(Manifest, i64), String> {
    match gcs.fetch_with_generation(bucket, object)? {
        Some((bytes, gen)) => {
            let m = serde_json::from_slice::<Manifest>(&bytes).unwrap_or_default();
            Ok((m, gen))
        }
        None => Ok((Manifest::default(), 0)),
    }
}

/// Look up one entry.
pub fn get(gcs: &Gcs, bucket: &str, object: &str, id: &str) -> Result<Option<Entry>, String> {
    let (m, _) = load(gcs, bucket, object)?;
    Ok(m.entries.get(id).cloned())
}

/// Insert/replace one entry with generation-preconditioned RMW (412 refetches).
pub fn upsert(
    gcs: &Gcs,
    bucket: &str,
    object: &str,
    id: &str,
    entry: Entry,
) -> Result<(), String> {
    for _ in 0..RMW_ATTEMPTS {
        let (mut m, generation) = load(gcs, bucket, object)?;
        m.version = m.version.max(1);
        m.entries.insert(id.to_string(), entry.clone());
        let body = serde_json::to_vec_pretty(&m).map_err(|e| format!("manifest encode: {e}"))?;
        if gcs.upload(bucket, object, body, "application/json", Some(generation))? {
            return Ok(());
        }
        // 412 — someone else wrote; refetch and merge again.
    }
    Err(format!("manifest RMW lost {RMW_ATTEMPTS} generation races"))
}

/// RFC3339 UTC timestamp from the wasi wall-clock (no chrono dependency).
pub fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    rfc3339(secs)
}

/// Format epoch seconds as `YYYY-MM-DDThh:mm:ssZ` (Howard Hinnant's civil-from-days).
fn rfc3339(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_serde_roundtrip() {
        let mut m = Manifest {
            version: 1,
            entries: BTreeMap::new(),
        };
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

    #[test]
    fn rfc3339_epoch() {
        assert_eq!(rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339(1_600_000_000), "2020-09-13T12:26:40Z");
    }
}
