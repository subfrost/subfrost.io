/* tslint:disable */
/* eslint-disable */

/**
 * JS-facing gRPC channel handle. Use `connectGrpcChannel` to
 * mint one; then `await channel.callUnary(...)` for each RPC.
 */
export class WasmGrpcChannel {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Issue a unary gRPC call. `path` is the full
     * `/<service>/<Method>` route. `body` is already-LPM-framed
     * (the 5-byte gRPC LPM header + protobuf payload — use the
     * `frameGrpcMessage` helper exported by the umbrella crate).
     * Returns the framed response body bytes.
     */
    callUnary(path: string, body: Uint8Array): Promise<Uint8Array>;
}

/**
 * JS-facing wrapper around the pure-Rust `PumpedDuplex`. Holds
 * the same `Rc<RefCell<…>>` so clones share the buffers — the
 * caller hands one clone to `connectGrpcChannel` (which it
 * passes to h2) and keeps the other to push/pull bytes.
 */
export class WasmPumpedDuplex {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Mark the duplex closed. Pending `callUnary` rejects.
     */
    close(): void;
    isClosed(): boolean;
    constructor();
    /**
     * JS push: plaintext bytes (just-decrypted off the outer
     * socket) become inbound payload h2 will read.
     */
    pushInbound(bytes: Uint8Array): void;
    /**
     * JS pull: plaintext bytes h2 wants to send. Caller
     * encrypts + writes to the outer socket.
     */
    takeOutbound(): Uint8Array;
}

/**
 * Async handshake. Spawns the h2 connection driver on the JS
 * event loop via `wasm_bindgen_futures::spawn_local` so it
 * runs continuously alongside the application code. Returns a
 * ready-to-use channel.
 */
export function connectGrpcChannel(duplex: WasmPumpedDuplex, authority: string): Promise<WasmGrpcChannel>;
