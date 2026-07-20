//! Runtime configuration, all from the environment (12-factor). Mirrors
//! the Go cdn-server's `envOrDefault` defaults so this is a drop-in.

#[derive(Clone, Debug)]
pub struct Config {
    /// Listen address. Go default `:8080`.
    pub bind: String,
    /// Public-asset bucket served at `/alkanes/*`. Go `GCS_BUCKET`.
    pub assets_bucket: String,
    /// CDN bucket served at `/docs|media|raw|releases|snapshots|secure/*`.
    /// Go `CDN_BUCKET`.
    pub cdn_bucket: String,
    /// Shared secret for `/secure/*` HMAC tokens. Empty => /secure denies all.
    pub secure_hmac_key: Vec<u8>,
    /// Public metashrew JSON-RPC (metashrew_view/metashrew_height) used for
    /// on-chain alkane graphics (GetData). The mainnet.subfrost.io /metashrew
    /// LB blockhash-caches views upstream, so calling it is already cheap.
    pub metashrew_url: String,
    /// Master switch for the on-chain GetData pipeline. Off => /alkanes/*
    /// behaves exactly like the pre-pipeline server (curated bucket only).
    pub onchain_enabled: bool,
    /// Manifest object key on the assets bucket (source of truth for how each
    /// alkane's graphic is served: static file vs dynamic simulate).
    pub manifest_object: String,
}

impl Config {
    pub fn from_env() -> Self {
        let bind = std::env::var("CDN_BIND")
            .or_else(|_| std::env::var("PORT").map(|p| format!("0.0.0.0:{p}")))
            .unwrap_or_else(|_| "0.0.0.0:8080".to_string());

        let assets_bucket =
            env_or("GCS_BUCKET", "alkane-assets-bucket");
        let cdn_bucket = env_or("CDN_BUCKET", "subfrost-cdn-bucket");

        // SECURE_HMAC_KEY: the shared secret the subfrost.io app signs
        // /secure tokens with. Empty (unset) => /secure denies all, the
        // same fail-closed posture the Go server had when basic-auth was
        // misconfigured.
        let secure_hmac_key = std::env::var("SECURE_HMAC_KEY")
            .unwrap_or_default()
            .into_bytes();

        let metashrew_url = env_or("METASHREW_URL", "https://mainnet.subfrost.io/metashrew");
        let onchain_enabled = std::env::var("ALKANE_ONCHAIN_ENABLED")
            .map(|v| v != "0" && !v.eq_ignore_ascii_case("false"))
            .unwrap_or(true);
        let manifest_object = env_or("ALKANE_MANIFEST_OBJECT", "alkanes/manifest.json");

        Self {
            bind,
            assets_bucket,
            cdn_bucket,
            secure_hmac_key,
            metashrew_url,
            onchain_enabled,
            manifest_object,
        }
    }
}

fn env_or(key: &str, fallback: &str) -> String {
    match std::env::var(key) {
        Ok(v) if !v.is_empty() => v,
        _ => fallback.to_string(),
    }
}
