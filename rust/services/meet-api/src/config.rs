use anyhow::{anyhow, Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub bind: String,
    pub session_secret: Vec<u8>,
    pub bearer_ttl_ms: i64,
    pub turn_secret: String,
    pub turn_urls: Vec<String>,
    pub turn_ttl_secs: u32,
    pub redis_url: String,
    pub challenge_ttl_secs: i64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let bind = std::env::var("MEET_API_BIND").unwrap_or_else(|_| "0.0.0.0:8080".to_string());

        let session_secret = std::env::var("MEET_API_SESSION_SECRET")
            .context("MEET_API_SESSION_SECRET env required")?
            .into_bytes();
        if session_secret.len() < 32 {
            return Err(anyhow!("MEET_API_SESSION_SECRET must be at least 32 bytes"));
        }

        let bearer_ttl_ms = std::env::var("MEET_API_BEARER_TTL_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(24 * 60 * 60 * 1000);

        let turn_secret = std::env::var("MEET_API_TURN_SECRET")
            .context("MEET_API_TURN_SECRET env required (shared with coturn use-auth-secret)")?;

        let turn_urls = std::env::var("MEET_API_TURN_URLS")
            .unwrap_or_else(|_| "turn:turn-hk.subfrost.io:3478,turns:turn-hk.subfrost.io:443?transport=tcp".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let turn_ttl_secs = std::env::var("MEET_API_TURN_TTL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3600);

        let redis_url = std::env::var("MEET_API_REDIS_URL")
            .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

        let challenge_ttl_secs = std::env::var("MEET_API_CHALLENGE_TTL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(300);

        Ok(Self {
            bind,
            session_secret,
            bearer_ttl_ms,
            turn_secret,
            turn_urls,
            turn_ttl_secs,
            redis_url,
            challenge_ttl_secs,
        })
    }
}
