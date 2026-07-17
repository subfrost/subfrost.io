/**
 * tlsfetch — pure-Rust TLS+HTTP client compiled to wasm.
 *
 * Wraps the wasm-bindgen state machine in `tlsfetch-web-sys` and
 * drives it via a JS-supplied `NetModule` (Node's `node:net` by
 * default; the @subzero/ts-sdk frtun polyfills, or any other source
 * if you provide one).
 */
import { NetModule } from "./socket.js";
export type { NetModule, TcpSocket, UdpSocket } from "./socket.js";
export { nodeNetModule } from "./socket.js";
export type FingerprintPreset = "okhttp5" | "chrome120" | "firefox120" | "safari_ios17";
export interface TlsOptions {
    /** Skip cert verification (testing / self-signed). */
    insecure?: boolean;
    /** ALPN candidate list (default: `["http/1.1"]`). */
    alpn?: string[];
    /** SNI override (default: URL host). */
    sni?: string;
    /** JA3 fingerprint preset. Customizes the rustls CryptoProvider's
     *  cipher suite order so the ClientHello matches the named client. */
    fingerprint?: FingerprintPreset;
}
export interface FetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array | string;
    /** Connect-only timeout in ms. */
    connectTimeoutMs?: number;
    /** Skip TLS verification. */
    insecure?: boolean;
    /** Override the SNI host. */
    sni?: string;
    /** Override DNS for `host:port` and dial `addr` instead. */
    resolve?: {
        host: string;
        port: number;
        addr: string;
    };
    /** JA3 fingerprint preset (e.g. "okhttp5"). */
    fingerprint?: FingerprintPreset;
}
export interface FetchResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: Uint8Array;
    /** Decode the body as UTF-8. */
    text(): string;
    /** Decode the body as JSON. */
    json(): unknown;
}
/**
 * High-level: do an HTTPS GET/POST/etc against `url` using `net` for
 * the underlying TCP transport. The TLS handshake runs entirely in
 * Rust (compiled to wasm) regardless of the JS runtime.
 */
export declare function tlsfetch(url: string | URL, init?: FetchOptions, net?: NetModule): Promise<FetchResponse>;
//# sourceMappingURL=index.d.ts.map