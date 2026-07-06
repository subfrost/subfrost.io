// Node-only tunnel adapter — opens a plain TCP `net.Socket` (NO
// outer TLS, NO Hyflaria) and pumps raw bytes through the wasm
// HTTP/2 client. Used by `subfrost-bindgen-cli` to verify the
// wasm bundle's data view layer against a `kubectl port-forward
// svc/subfrost-wallet-api 8081` backend.
//
// The browser extension uses `connectViaWss` instead, which dials
// `wss-tls.subfrost.io` with the full inner-TLS + Hyflaria stack.
import * as net from "node:net";
import { WasmPumpedDuplex, connectGrpcChannel, } from "../../pkg-h2-node/tlsfetch_h2_web_sys.js";
export async function connectViaTcp(opts) {
    const { host, port, authority } = opts;
    const timeoutMs = opts.connectTimeoutMs ?? 5_000;
    const socket = net.createConnection({ host, port, allowHalfOpen: false });
    // Wait for the TCP handshake before letting h2 start dialing.
    await new Promise((resolve, reject) => {
        const onErr = (e) => {
            cleanup();
            reject(e);
        };
        const onTimeout = () => {
            cleanup();
            socket.destroy();
            reject(new Error(`tcp connect to ${host}:${port} timed out`));
        };
        const onConnect = () => {
            cleanup();
            resolve();
        };
        const cleanup = () => {
            socket.removeListener("error", onErr);
            socket.removeListener("connect", onConnect);
            clearTimeout(timer);
        };
        const timer = setTimeout(onTimeout, timeoutMs);
        socket.once("error", onErr);
        socket.once("connect", onConnect);
    });
    const duplex = new WasmPumpedDuplex();
    // Inbound: every byte off the socket gets pushed straight into
    // the wasm duplex as plaintext (no TLS in this adapter — plain
    // h2 over TCP). The wasm-side h2 client reads from there.
    socket.on("data", (chunk) => {
        duplex.pushInbound(chunk);
    });
    socket.on("end", () => duplex.close());
    socket.on("close", () => duplex.close());
    socket.on("error", () => duplex.close());
    // Outbound: drain the wasm duplex on every tick and write to
    // the socket. We use a microtask-yield loop (setImmediate) so
    // we don't busy-spin but still flush h2's outbound bytes fast.
    let pumpRunning = true;
    const pump = () => {
        if (!pumpRunning || socket.destroyed)
            return;
        const outbound = duplex.takeOutbound();
        if (outbound.length > 0) {
            socket.write(Buffer.from(outbound));
        }
        setImmediate(pump);
    };
    setImmediate(pump);
    // Dial h2 over the duplex. `connectGrpcChannel` returns once
    // the h2 handshake (PRI * HTTP/2.0 + SETTINGS exchange)
    // completes, then internally spawns the connection driver via
    // `wasm_bindgen_futures::spawn_local`.
    const channel = await connectGrpcChannel(duplex, authority);
    return {
        channel,
        close: () => {
            pumpRunning = false;
            duplex.close();
            socket.destroy();
        },
    };
}
//# sourceMappingURL=node-tcp-tunnel.js.map