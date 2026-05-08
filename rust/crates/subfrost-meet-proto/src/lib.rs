//! Wire schema for subfrost.io meeting control plane.
//!
//! Hand-rolled prost `Message` derives — no protoc build dep.
//! JSON over HTTP is the v1 signaling transport (long-poll, like snorchat).
//! Protobuf is reserved for the gRPC control-plane upgrade later.

pub mod auth;
pub mod rtc;
pub mod room;
