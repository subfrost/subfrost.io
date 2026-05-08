use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use subfrost_meet_proto::rtc::{
    IceConfigResponse, IceServer, SignalGetResponse, SignalSendRequest,
};

use crate::{auth::ApiError, auth::AuthedSession, signal_bus, state::AppState, turn};

pub async fn ice_config(
    State(state): State<AppState>,
    AuthedSession(session): AuthedSession,
) -> Result<Json<IceConfigResponse>, ApiError> {
    let cred = turn::mint(&state.cfg.turn_secret, &session.address, state.cfg.turn_ttl_secs);
    let mut servers = Vec::new();
    // Public STUN as fallback for non-China hosts. China clients should still
    // get TURN candidates via the relay servers below.
    servers.push(IceServer {
        urls: vec!["stun:stun.l.google.com:19302".into()],
        username: None,
        credential: None,
    });
    servers.push(IceServer {
        urls: state.cfg.turn_urls.clone(),
        username: Some(cred.username),
        credential: Some(cred.credential),
    });
    Ok(Json(IceConfigResponse {
        ice_servers: servers,
        ttl_seconds: state.cfg.turn_ttl_secs,
    }))
}

#[derive(Debug, Deserialize)]
pub struct SignalGetParams {
    pub room_id: String,
    #[serde(default)]
    pub since: u64,
}

pub async fn signal_get(
    State(state): State<AppState>,
    AuthedSession(_session): AuthedSession,
    Query(params): Query<SignalGetParams>,
) -> Result<Json<SignalGetResponse>, ApiError> {
    let mut conn = state.redis.clone();
    let (head_seq, envelopes) = signal_bus::since(&mut conn, &params.room_id, params.since)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(SignalGetResponse {
        head_seq,
        envelopes,
    }))
}

pub async fn signal_send(
    State(state): State<AppState>,
    AuthedSession(session): AuthedSession,
    Json(req): Json<SignalSendRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut conn = state.redis.clone();
    let seq = signal_bus::append(
        &mut conn,
        &req.room_id,
        &session.address,
        &req.to,
        req.kind,
        req.data,
    )
    .await
    .map_err(ApiError::internal)?;
    Ok(Json(serde_json::json!({ "seq": seq })))
}
