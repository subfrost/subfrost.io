/**
 * Abstract socket interfaces. Plug in a `NetModule` from any source:
 *   - `nodeNetModule()` — Node's built-in `node:net` + `node:dgram`
 *   - `subzeroNetModule(client)` — @subzero/ts-sdk frtun polyfills
 *   - your own custom thing
 *
 * tlsfetch only ever talks through these interfaces, so the same wasm
 * works in every JS runtime.
 */
export interface TcpSocket {
    /** Read up to `maxBytes` bytes. Resolves with 0 bytes on EOF. */
    read(maxBytes: number): Promise<Uint8Array>;
    /** Write `bytes`. Resolves once flushed to the wire. */
    write(bytes: Uint8Array): Promise<void>;
    /** Half-close write side. */
    end(): Promise<void>;
    /** Hard close. */
    close(): Promise<void>;
}
export interface UdpSocket {
    recv(maxBytes: number): Promise<Uint8Array>;
    send(bytes: Uint8Array): Promise<void>;
    close(): Promise<void>;
}
export interface NetModule {
    /** Open a connected TCP socket. */
    createTcpSocket(host: string, port: number, opts?: {
        timeoutMs?: number;
    }): Promise<TcpSocket>;
    /** Open a connected UDP socket (used for HTTP/3 in Phase 3). */
    createUdpSocket?(host: string, port: number, opts?: {
        timeoutMs?: number;
    }): Promise<UdpSocket>;
}
/**
 * Default NetModule for Node.js — uses `node:net` for TCP and
 * `node:dgram` for UDP.
 */
export declare function nodeNetModule(): Promise<NetModule>;
//# sourceMappingURL=socket.d.ts.map