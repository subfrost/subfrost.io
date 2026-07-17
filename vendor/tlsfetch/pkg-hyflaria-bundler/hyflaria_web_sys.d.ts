/* tslint:disable */
/* eslint-disable */

/**
 * Result of decoding an inbound DATA frame: `seq` is the validated
 * monotonic counter, `payload` is the inner-plaintext bytes the
 * caller should hand to the inner-TLS engine.
 */
export class HyflariaDataFrame {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly payload: Uint8Array;
    readonly seq: bigint;
}

/**
 * Manual-mode codec: callers drive the framing themselves, one
 * outbound WSS frame at a time. Use this if you need finer
 * control than `connect_hyflaria_outer_inner` gives you.
 */
export class WasmHyflariaCodec {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Server-side: accept an inbound AUTH frame. Returns the
     * session_id on success.
     */
    acceptAuth(bytes: Uint8Array): number;
    /**
     * Build the client-side AUTH frame. `nonce` MUST be 16 bytes;
     * the caller is expected to source it from
     * `crypto.getRandomValues(new Uint8Array(16))`.
     */
    buildAuthFrame(session_id: number, nonce: Uint8Array): Uint8Array;
    /**
     * Server-side: build an AUTH_RESPONSE frame.
     */
    buildAuthResponse(ok: boolean, msg: string, session_id: number): Uint8Array;
    /**
     * Build a CLOSE frame.
     */
    buildCloseFrame(session_id: number, seq: bigint): Uint8Array;
    /**
     * Build a DATA frame for an outbound payload chunk.
     */
    buildDataFrame(session_id: number, seq: bigint, payload: Uint8Array): Uint8Array;
    /**
     * `secret` MUST be exactly 32 bytes. Throws otherwise.
     */
    constructor(secret: Uint8Array);
    /**
     * Verify a server AUTH_RESPONSE. Returns the session_id on
     * success.
     */
    verifyAuthResponse(bytes: Uint8Array): number;
    /**
     * Verify an inbound DATA frame given the receiver's
     * last-seen sequence number. Returns the new seq + decoded
     * payload; throws on bad mac / replay / malformed.
     */
    verifyDataFrame(bytes: Uint8Array, last_seq: bigint): HyflariaDataFrame;
}

/**
 * JS-facing wrapper that mirrors `tlsfetch-h2-web-sys::WasmPumpedDuplex`.
 * We re-export here so callers that import only this crate still get
 * a `WasmPumpedDuplex` constructor — the underlying type is the same
 * `Rc<RefCell<…>>` from `tlsfetch-h2-common::duplex`.
 */
export class WasmPumpedDuplex {
    free(): void;
    [Symbol.dispose](): void;
    close(): void;
    isClosed(): boolean;
    constructor();
    pushInbound(bytes: Uint8Array): void;
    takeOutbound(): Uint8Array;
}

/**
 * High-level driver: spawns `wasm_bindgen_futures::spawn_local` tasks
 * that bridge `outer` (WSS plaintext, one frame per
 * `pushInbound`/`takeOutbound` chunk) with `inner` (caller-facing
 * plaintext). Inner-bound bytes get Hyflaria-framed before going
 * out; inbound WSS bytes get unframed before reaching `inner`.
 *
 * The caller drives `outer` from JS the same way they drive any
 * other `WasmPumpedDuplex`: each WSS message gets pushed in via
 * `outer.pushInbound(...)`, and any bytes the driver wants to
 * send come out via `outer.takeOutbound()` for the JS side to
 * ship over the WebSocket.
 *
 * `inner` is symmetric on the caller's side: caller writes
 * plaintext via `inner.pushInbound(...)` to send it through
 * hyflaria, and reads inbound plaintext via `inner.takeOutbound()`.
 *
 * AUTH is performed first; if it fails the returned Promise
 * rejects and neither duplex is left open.
 */
export function connectHyflariaOuterInner(outer: WasmPumpedDuplex, inner: WasmPumpedDuplex, secret: Uint8Array, session_id: number, auth_nonce: Uint8Array): Promise<void>;
