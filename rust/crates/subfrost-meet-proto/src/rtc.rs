use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceServer {
    pub urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceConfigResponse {
    pub ice_servers: Vec<IceServer>,
    pub ttl_seconds: u32,
}

/// Signaling envelope. Mirrors snorchat's wire shape so the wasm client port is mechanical.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalEnvelope {
    pub seq: u64,
    pub from: String,
    pub to: String,
    pub kind: SignalKind,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SignalKind {
    Offer,
    Answer,
    Candidate,
    Leave,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalSendRequest {
    pub room_id: String,
    pub to: String,
    pub kind: SignalKind,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalGetResponse {
    pub head_seq: u64,
    pub envelopes: Vec<SignalEnvelope>,
}
