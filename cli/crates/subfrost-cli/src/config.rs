//! CLI configuration: the subfrost.io base URL + the shared admin secret.
//!
//! Resolution order (first hit wins per field):
//!   1. Environment: `SUBFROST_API_URL`, `SUBFROST_API_KEY`,
//!      `SUBFROST_ADMIN_SECRET`.
//!   2. `~/.config/subfrost/config.toml` (a tiny hand-rolled `key = "value"`
//!      parser — we deliberately avoid a `toml` crate dep since the file is
//!      a few flat keys and `toml` isn't in the workspace dep set).
//!
//! Auth precedence: when an `api_key` is present the client sends
//! `Authorization: Bearer <key>` against the `/api/v1` REST surface; the
//! `admin_secret` is the fallback for the `x-admin-secret` bootstrap routes
//! (and so is no longer strictly required when an api_key is configured).
//!
//! The base URL is parsed into (host, port, https) so `client.rs` can dial
//! directly via tlsfetch without an `http`/`url` round-trip.

use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};

const DEFAULT_API_URL: &str = "https://subfrost.io";

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub https: bool,
    /// Bearer API key (`sk_...`) for the `/api/v1` REST surface. When set it
    /// takes precedence over `admin_secret`.
    pub api_key: Option<String>,
    /// Shared admin secret for the `x-admin-secret` bootstrap routes. Optional
    /// once an `api_key` is configured.
    pub admin_secret: Option<String>,
}

impl Config {
    /// Build the effective config from env + the optional config file.
    pub fn load() -> Result<Self> {
        let file = FileConfig::load_default();

        let api_url = std::env::var("SUBFROST_API_URL")
            .ok()
            .or(file.api_url)
            .unwrap_or_else(|| DEFAULT_API_URL.to_string());

        let api_key = std::env::var("SUBFROST_API_KEY").ok().or(file.api_key);

        let admin_secret = std::env::var("SUBFROST_ADMIN_SECRET")
            .ok()
            .or(file.admin_secret);

        if api_key.is_none() && admin_secret.is_none() {
            return Err(anyhow!(
                "no credentials: set SUBFROST_API_KEY (Bearer key for /api/v1) or \
                 SUBFROST_ADMIN_SECRET (for the bootstrap routes), or add \
                 `api_key`/`admin_secret` to ~/.config/subfrost/config.toml"
            ));
        }

        let (host, port, https) = parse_base_url(&api_url)
            .with_context(|| format!("invalid SUBFROST_API_URL: {api_url}"))?;

        Ok(Config {
            host,
            port,
            https,
            api_key,
            admin_secret,
        })
    }
}

/// Raw values read out of the config file (both optional).
#[derive(Default)]
struct FileConfig {
    api_url: Option<String>,
    api_key: Option<String>,
    admin_secret: Option<String>,
}

impl FileConfig {
    fn load_default() -> Self {
        match config_path() {
            Some(path) => match std::fs::read_to_string(&path) {
                Ok(contents) => parse_file(&contents),
                Err(_) => FileConfig::default(), // absent / unreadable -> defaults
            },
            None => FileConfig::default(),
        }
    }
}

fn config_path() -> Option<PathBuf> {
    // Prefer XDG_CONFIG_HOME, else ~/.config.
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return Some(PathBuf::from(xdg).join("subfrost").join("config.toml"));
        }
    }
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".config").join("subfrost").join("config.toml"))
}

/// Minimal `key = "value"` parser. Ignores blank lines and `#` comments.
/// Strips surrounding single or double quotes from the value.
fn parse_file(contents: &str) -> FileConfig {
    let mut cfg = FileConfig::default();
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
        match key {
            "api_url" => cfg.api_url = Some(value),
            "api_key" => cfg.api_key = Some(value),
            "admin_secret" => cfg.admin_secret = Some(value),
            _ => {}
        }
    }
    cfg
}

/// Parse `scheme://host[:port][/...]` into (host, port, https). Defaults:
/// 443 for https, 80 for http. Trailing path is ignored — every route is
/// addressed by absolute path at call time.
pub fn parse_base_url(url: &str) -> Result<(String, u16, bool)> {
    let (scheme, rest) = url
        .split_once("://")
        .ok_or_else(|| anyhow!("URL must include a scheme (https:// or http://)"))?;
    let https = match scheme {
        "https" => true,
        "http" => false,
        other => return Err(anyhow!("unsupported scheme: {other}")),
    };

    // Drop any path/query: keep only the authority component.
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    if authority.is_empty() {
        return Err(anyhow!("URL is missing a host"));
    }

    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => {
            let port: u16 = p
                .parse()
                .with_context(|| format!("invalid port in URL: {p}"))?;
            (h.to_string(), port)
        }
        None => (authority.to_string(), if https { 443 } else { 80 }),
    };

    if host.is_empty() {
        return Err(anyhow!("URL is missing a host"));
    }

    Ok((host, port, https))
}
