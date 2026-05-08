use axum::{routing::{get, post}, Router};
use std::net::SocketAddr;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

mod auth;
mod config;
mod rtc;
mod signal_bus;
mod state;
mod turn;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("meet_api=info,tower_http=info")))
        .with(fmt::layer())
        .init();

    let cfg = Config::from_env()?;
    tracing::info!(bind = %cfg.bind, "meet-api starting");

    let state = AppState::new(cfg.clone()).await?;

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/v1/auth/challenge", post(auth::challenge))
        .route("/v1/auth/verify", post(auth::verify))
        .route("/v1/rtc/ice-config", get(rtc::ice_config))
        .route("/v1/rtc/signal-send", post(rtc::signal_send))
        .route("/v1/rtc/signal-get", get(rtc::signal_get))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = cfg.bind.parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}
