//! Per-room signaling ring buffer, Redis-backed.
//!
//! Mirrors snorchat's `SignalRoomBus` shape (proposal-aligned): each room holds
//! up to `MAX_ENVELOPES` signal envelopes in a Redis Stream, indexed by `seq`.
//! Clients long-poll `signal-get?room_id=X&since=Y` and receive everything > Y.

use anyhow::{Context, Result};
use redis::{aio::ConnectionManager, AsyncCommands};
use subfrost_meet_proto::rtc::SignalEnvelope;

pub const MAX_ENVELOPES: usize = 512;

fn key(room_id: &str) -> String {
    format!("subfrost:meet:room:{room_id}:signals")
}

fn seq_key(room_id: &str) -> String {
    format!("subfrost:meet:room:{room_id}:seq")
}

pub async fn append(
    conn: &mut ConnectionManager,
    room_id: &str,
    from: &str,
    to: &str,
    kind: subfrost_meet_proto::rtc::SignalKind,
    data: serde_json::Value,
) -> Result<u64> {
    let seq: u64 = conn.incr(seq_key(room_id), 1u64).await?;
    let envelope = SignalEnvelope {
        seq,
        from: from.to_string(),
        to: to.to_string(),
        kind,
        data,
    };
    let payload = serde_json::to_string(&envelope).context("encode envelope")?;

    // RPUSH then LTRIM to keep at most MAX_ENVELOPES.
    let _: () = conn.rpush(key(room_id), payload).await?;
    let _: () = conn
        .ltrim(key(room_id), -(MAX_ENVELOPES as isize), -1)
        .await?;
    Ok(seq)
}

pub async fn since(
    conn: &mut ConnectionManager,
    room_id: &str,
    since: u64,
) -> Result<(u64, Vec<SignalEnvelope>)> {
    let raw: Vec<String> = conn.lrange(key(room_id), 0, -1).await?;
    let mut envelopes: Vec<SignalEnvelope> = raw
        .into_iter()
        .filter_map(|s| serde_json::from_str(&s).ok())
        .filter(|e: &SignalEnvelope| e.seq > since)
        .collect();
    envelopes.sort_by_key(|e| e.seq);
    let head = envelopes.last().map(|e| e.seq).unwrap_or(since);
    Ok((head, envelopes))
}
