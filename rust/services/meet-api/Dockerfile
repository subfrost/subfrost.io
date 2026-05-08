# syntax=docker/dockerfile:1.7
FROM rust:1.91-slim AS builder
WORKDIR /build

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the workspace
COPY rust /build/rust

WORKDIR /build/rust
RUN --mount=type=cache,target=/build/rust/target \
    --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --bin meet-api && \
    cp target/release/meet-api /tmp/meet-api

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /tmp/meet-api /usr/local/bin/meet-api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/meet-api"]
