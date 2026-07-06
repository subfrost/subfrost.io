// Browser-side tunnel adapter — opens a native `WebSocket` and
// pumps bytes through the wasm-side gRPC client. Identical
// wire format to mobile through `wss-tls.subfrost.io`.
//
// This adapter targets BOTH browsers (uses globalThis.WebSocket)
// AND Node 22+ (which has globalThis.WebSocket natively). For Node
// 20 callers, polyfill with `globalThis.WebSocket = require('ws')`
// before calling `connectViaWss`.
//
// Hyflaria mode: if `hyflariaSecret` is supplied (the 32-byte HMAC
// secret shared with the cluster's WSS ingress), the adapter runs
// the AUTH+DATA framing handshake before the gRPC h2 preface goes
// out. Required for the production `wss-tls.subfrost.io` endpoint.
//
// IMPORTANT cross-bundle caveat: `WasmPumpedDuplex` is exported by
// BOTH `tlsfetch-h2-web-sys` (the h2 pkg) AND `hyflaria-web-sys`
// (the hyflaria pkg), but each wasm-bindgen bundle ships its own
// distinct JS class with its own underlying wasm-linear-memory
// instance. They are NOT pointer-compatible. We therefore mint two
// duplex pairs:
//
//   * `hyOuter` / `hyInner` belong to the hyflaria bundle. They
//     are what `connectHyflariaOuterInner` drives.
//   * `gDuplex` belongs to the h2 bundle. It's what
//     `connectGrpcChannel` reads/writes.
//
// We bridge `hyInner` ↔ `gDuplex` with a tiny JS pump (drain
// outbound bytes from one and push them inbound to the other every
// event-loop turn). Bytes never cross the wasm-linear-memory
// boundary directly — JS owns the in-flight Uint8Array copies.
import { WasmPumpedDuplex as H2WasmPumpedDuplex, connectGrpcChannel, } from "../../pkg-h2-node/tlsfetch_h2_web_sys.js";
import { WasmPumpedDuplex as HyflariaWasmPumpedDuplex, connectHyflariaOuterInner, } from "../../pkg-hyflaria-node/hyflaria_web_sys.js";
function pumpDuplexToDuplex(src, dst, stop) {
    const tick = () => {
        if (stop.stopped || src.isClosed() || dst.isClosed())
            return;
        const b = src.takeOutbound();
        if (b.length > 0)
            dst.pushInbound(b);
        queueMicrotask(tick);
    };
    queueMicrotask(tick);
}
export async function connectViaWss(opts) {
    const { url, authority } = opts;
    const timeoutMs = opts.handshakeTimeoutMs ?? 10_000;
    const WS = globalThis.WebSocket;
    if (!WS) {
        throw new Error("WebSocket not available — polyfill via `globalThis.WebSocket = (await import('ws')).WebSocket` before calling connectViaWss");
    }
    if (opts.hyflariaSecret && opts.hyflariaSecret.length !== 32) {
        throw new Error(`hyflariaSecret must be exactly 32 bytes, got ${opts.hyflariaSecret.length}`);
    }
    const ws = new WS(url);
    ws.binaryType = "arraybuffer";
    await new Promise((resolve, reject) => {
        const cleanup = () => {
            ws.removeEventListener("open", onOpen);
            ws.removeEventListener("error", onErr);
            clearTimeout(timer);
        };
        const onOpen = () => {
            cleanup();
            resolve();
        };
        const onErr = (e) => {
            cleanup();
            reject(new Error(`wss open failed: ${String(e)}`));
        };
        const timer = setTimeout(() => {
            cleanup();
            try {
                ws.close();
            }
            catch {
                /* ignore */
            }
            reject(new Error(`wss open to ${url} timed out`));
        }, timeoutMs);
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onErr);
    });
    const stop = { stopped: false };
    const drains = [];
    if (opts.hyflariaSecret) {
        // Hyflaria mode.
        const hyOuter = new HyflariaWasmPumpedDuplex();
        const hyInner = new HyflariaWasmPumpedDuplex();
        const gDuplex = new H2WasmPumpedDuplex();
        // WSS ⇄ hyOuter
        ws.addEventListener("message", (ev) => {
            const data = ev.data;
            if (data instanceof ArrayBuffer) {
                hyOuter.pushInbound(new Uint8Array(data));
            }
            else if (ArrayBuffer.isView(data)) {
                const v = data;
                hyOuter.pushInbound(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
            }
        });
        ws.addEventListener("close", () => {
            hyOuter.close();
        });
        ws.addEventListener("error", () => hyOuter.close());
        const sendPump = () => {
            if (stop.stopped || ws.readyState !== WS.OPEN)
                return;
            const out = hyOuter.takeOutbound();
            if (out.length > 0)
                ws.send(out);
            queueMicrotask(sendPump);
        };
        queueMicrotask(sendPump);
        // hyInner ⇄ gDuplex (cross-bundle bridge — bytes copied via JS)
        pumpDuplexToDuplex(hyInner, gDuplex, stop);
        pumpDuplexToDuplex(gDuplex, hyInner, stop);
        drains.push(() => {
            hyOuter.close();
            hyInner.close();
            gDuplex.close();
        });
        const sessionId = opts.hyflariaSessionId ??
            Math.floor(Math.random() * 0xffff_ffff);
        const nonce = new Uint8Array(16);
        const cryptoApi = globalThis.crypto;
        if (!cryptoApi) {
            throw new Error("globalThis.crypto.getRandomValues not available");
        }
        cryptoApi.getRandomValues(nonce);
        await connectHyflariaOuterInner(hyOuter, hyInner, opts.hyflariaSecret, sessionId, nonce);
        const channel = await connectGrpcChannel(gDuplex, authority);
        return {
            channel,
            close: () => {
                stop.stopped = true;
                drains.forEach((d) => d());
                try {
                    ws.close();
                }
                catch {
                    /* ignore */
                }
            },
        };
    }
    else {
        // Raw mode (dev endpoints only) — gRPC writes go straight
        // to the WebSocket via a single h2 duplex.
        const duplex = new H2WasmPumpedDuplex();
        ws.addEventListener("message", (ev) => {
            const data = ev.data;
            if (data instanceof ArrayBuffer) {
                duplex.pushInbound(new Uint8Array(data));
            }
            else if (ArrayBuffer.isView(data)) {
                const v = data;
                duplex.pushInbound(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
            }
        });
        ws.addEventListener("close", () => duplex.close());
        ws.addEventListener("error", () => duplex.close());
        const pump = () => {
            if (stop.stopped || ws.readyState !== WS.OPEN)
                return;
            const out = duplex.takeOutbound();
            if (out.length > 0)
                ws.send(out);
            queueMicrotask(pump);
        };
        queueMicrotask(pump);
        const channel = await connectGrpcChannel(duplex, authority);
        return {
            channel,
            close: () => {
                stop.stopped = true;
                duplex.close();
                try {
                    ws.close();
                }
                catch {
                    /* ignore */
                }
            },
        };
    }
}
//# sourceMappingURL=wss-tunnel.js.map