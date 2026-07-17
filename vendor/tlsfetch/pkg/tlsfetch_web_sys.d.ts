/* tslint:disable */
/* eslint-disable */

/**
 * State-machine handle for a post-handshake TLS connection. Use
 * `writePlaintext` to encrypt application data, `feedInbound` /
 * `readPlaintext` to decrypt incoming bytes from the socket.
 */
export class WasmTlsConnection {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Feed encrypted bytes received from the socket. Returns any new
     * plaintext bytes that came out the other side.
     */
    feedInbound(bytes: Uint8Array): Uint8Array;
    /**
     * Send a TLS close_notify alert. The caller must then write the
     * outbound bytes to the socket to perform a clean shutdown.
     */
    sendCloseNotify(): void;
    /**
     * Bytes the connection wants to send to the socket.
     */
    takeOutbound(): Uint8Array;
    /**
     * Encrypt `data` and add the resulting TLS record bytes to the
     * outbound queue.
     */
    writePlaintext(data: Uint8Array): void;
}

/**
 * State-machine handle for an in-progress TLS handshake.
 */
export class WasmTlsHandshake {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Feed received socket bytes into the handshake. Call
     * `process()` afterwards to advance the state machine.
     */
    feedInbound(bytes: Uint8Array): void;
    /**
     * Consume the handshake and return a TLS connection handle ready
     * for application data. Errors if the handshake hasn't completed.
     */
    finish(): WasmTlsConnection;
    /**
     * True if the handshake has completed and a `WasmTlsConnection`
     * can now be obtained via `finish()`.
     */
    isComplete(): boolean;
    /**
     * Begin a handshake. The host string is used for SNI + cert
     * verification (unless overridden by `options.sni`).
     */
    constructor(host: string, options: any);
    /**
     * Drive the state machine — processes whatever was fed in via
     * `feedInbound`, generates more outbound bytes, may complete the
     * handshake.
     */
    process(): void;
    /**
     * Bytes the handshake wants to send. Drains the buffer; safe to
     * call when there's nothing pending (returns an empty array).
     */
    takeOutbound(): Uint8Array;
    /**
     * Returns true if the handshake state machine wants more bytes
     * from the socket before it can make progress.
     */
    wantsRead(): boolean;
}

export function init(): void;

export function version(): string;
