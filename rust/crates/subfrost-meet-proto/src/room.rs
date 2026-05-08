use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRoomRequest {
    pub room_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRoomResponse {
    pub room_id: String,
    pub participants: Vec<String>,
}
