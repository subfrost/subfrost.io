use anyhow::{Context, Result};
use redis::aio::ConnectionManager;
use subfrost_meet_session::SessionSigner;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub cfg: Config,
    pub session: SessionSigner,
    pub redis: ConnectionManager,
}

impl AppState {
    pub async fn new(cfg: Config) -> Result<Self> {
        let session = SessionSigner::new(&cfg.session_secret);
        let client = redis::Client::open(cfg.redis_url.clone()).context("open redis client")?;
        let redis = ConnectionManager::new(client)
            .await
            .context("connect redis")?;
        Ok(Self {
            cfg,
            session,
            redis,
        })
    }
}
