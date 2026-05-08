use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeRequest {
    pub address: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeResponse {
    pub message: String,
    pub timestamp: i64,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyRequest {
    pub address: String,
    pub message: String,
    pub signature: String,
    pub timestamp: i64,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResponse {
    pub bearer: String,
    pub expires_at: i64,
}
