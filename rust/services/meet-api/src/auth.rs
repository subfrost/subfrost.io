use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts, State},
    http::{request::Parts, StatusCode},
    Json,
};
use rand::RngCore;
use redis::AsyncCommands;
use subfrost_meet_proto::auth::{
    ChallengeRequest, ChallengeResponse, VerifyRequest, VerifyResponse,
};
use subfrost_meet_session::Session;

use crate::state::AppState;

const CHALLENGE_PREFIX: &str = "subfrost.io conference";

pub async fn challenge(
    State(state): State<AppState>,
    Json(req): Json<ChallengeRequest>,
) -> Result<Json<ChallengeResponse>, ApiError> {
    if req.address.trim().is_empty() {
        return Err(ApiError::bad("address required"));
    }
    let timestamp = chrono::Utc::now().timestamp_millis();

    let mut nonce_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = hex::encode(nonce_bytes);

    let message = format!(
        "{CHALLENGE_PREFIX}: {} at {timestamp} nonce={nonce}",
        req.action
    );

    // Track outstanding nonces per address in Redis with the challenge TTL.
    let key = format!("subfrost:meet:nonce:{}:{}", req.address, nonce);
    let mut conn = state.redis.clone();
    let _: () = conn
        .set_ex(&key, timestamp, state.cfg.challenge_ttl_secs as u64)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(ChallengeResponse {
        message,
        timestamp,
        nonce,
    }))
}

pub async fn verify(
    State(state): State<AppState>,
    Json(req): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, ApiError> {
    let now = chrono::Utc::now().timestamp_millis();

    // Freshness window
    let age = now - req.timestamp;
    if age < 0 || age > state.cfg.challenge_ttl_secs * 1000 {
        return Err(ApiError::bad("challenge expired"));
    }

    // Message must include our prefix and the timestamp / nonce we minted.
    if !req.message.starts_with(CHALLENGE_PREFIX) {
        return Err(ApiError::bad("bad challenge prefix"));
    }
    if !req.message.contains(&req.timestamp.to_string()) {
        return Err(ApiError::bad("timestamp mismatch"));
    }
    if !req.message.contains(&req.nonce) {
        return Err(ApiError::bad("nonce mismatch"));
    }

    // Single-use nonce: must exist, then delete.
    let key = format!("subfrost:meet:nonce:{}:{}", req.address, req.nonce);
    let mut conn = state.redis.clone();
    let existed: i64 = conn.del(&key).await.map_err(ApiError::internal)?;
    if existed == 0 {
        return Err(ApiError::bad("nonce already used or unknown"));
    }

    // Real wallet signature verification.
    subfrost_meet_wallet_verify::verify(&req.address, &req.message, &req.signature).map_err(
        |e| {
            tracing::info!(?e, address = %req.address, "wallet verify failed");
            ApiError::unauthorized("signature verification failed")
        },
    )?;

    let bearer = state
        .session
        .mint(&req.address, now, state.cfg.bearer_ttl_ms);
    let expires_at = now + state.cfg.bearer_ttl_ms;

    Ok(Json(VerifyResponse { bearer, expires_at }))
}

// ---------------------------------------------------------------------------
// Bearer extractor — used by /v1/rtc/* handlers.
// ---------------------------------------------------------------------------

pub struct AuthedSession(pub Session);

#[async_trait]
impl<S> FromRequestParts<S> for AuthedSession
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .ok_or_else(|| ApiError::unauthorized("missing Authorization"))?
            .to_str()
            .map_err(|_| ApiError::unauthorized("non-ascii Authorization"))?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(|| ApiError::unauthorized("Authorization must be Bearer"))?;

        let now = chrono::Utc::now().timestamp_millis();
        let session = app_state
            .session
            .verify(token, now)
            .map_err(|e| ApiError::unauthorized(&format!("{e}")))?;
        Ok(AuthedSession(session))
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
}

impl ApiError {
    pub fn bad(msg: &str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: msg.to_string(),
        }
    }
    pub fn unauthorized(msg: &str) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: msg.to_string(),
        }
    }
    pub fn internal<E: std::fmt::Display>(e: E) -> Self {
        tracing::error!(err = %e, "internal error");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: "internal error".to_string(),
        }
    }
}

impl axum::response::IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(serde_json::json!({ "error": self.message })),
        )
            .into_response()
    }
}
