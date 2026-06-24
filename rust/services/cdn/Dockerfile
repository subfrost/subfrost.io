# syntax=docker/dockerfile:1.7
# subfrost-cdn — Rust container port of cdn.subfrost.io. Build context is
# the REPO ROOT (the COPY pulls in the whole `rust` workspace).
FROM rust:1.91-slim AS builder
WORKDIR /build

# rustls is used (no OpenSSL), so only the basics are needed to compile.
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY rust /build/rust

WORKDIR /build/rust
RUN --mount=type=cache,target=/build/rust/target \
    --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --bin subfrost-cdn && \
    cp target/release/subfrost-cdn /tmp/subfrost-cdn

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /tmp/subfrost-cdn /usr/local/bin/subfrost-cdn
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/subfrost-cdn"]
