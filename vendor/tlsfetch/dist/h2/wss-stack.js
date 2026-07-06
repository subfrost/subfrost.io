// Generic WSS → Hyflaria → inner-TLS → h2 → gRPC tunnel stack.
//
// This is the JS-side driver for a four-layer protocol stack used to
// reach a cluster ingress that demands (a) HMAC-authenticated outer
// framing, (b) a second SPKI-pinned TLS hop wrapped inside that
// framing, and (c) h2 + gRPC inside the inner TLS.
//
// Stack:
//
//   ws (outer WSS → CDN edge)
//     └─ Hyflaria framing (HMAC AUTH + DATA seq counter)
//          └─ inner TLS 1.3 (SPKI-pinned, ALPN h2)
//                └─ h2 plaintext bytes
//                     └─ WasmGrpcChannel (gRPC unary calls)
//
// Why JS drives Hyflaria framing (not the Rust
// `connectHyflariaOuterInner` helper):
//   1. The Rust helper tries to use one `PumpedDuplex`
//      bidirectionally, but AsyncRead/AsyncWrite hit separate lanes —
//      it reads its own AUTH frame back out of the same `inbound`
//      lane it just wrote into. Until that's restructured upstream,
//      JS-side framing is the cleanest path.
//   2. JS naturally knows WSS message boundaries (each
//      `ws.on("message")` is exactly one Hyflaria frame). We don't
//      have to fake message boundaries through a byte-oriented duplex.
//
// The inner duplex IS used the right way: h2 writes plaintext to its
// outbound lane (we drain via `takeOutbound`, encrypt through the
// inner TLS connection, wrap in Hyflaria DATA frames, ws.send), and
// h2 reads from its inbound lane (we feed each verified DATA payload
// through the inner TLS connection's decrypt and pushInbound the
// resulting plaintext).
//
// Why this lives in tlsfetch and not in a specific consumer: the
// only consumer-specific bits are the Hyflaria HMAC secret and the
// inner-TLS SPKI pin, which are baked into the consumer's own
// wasm-pack bundle at build time via env vars. This file accepts
// caller-supplied factories so it never touches those raw bytes.
export async function connectViaWssStack(opts) {
    const { url, authority } = opts;
    const innerTlsHost = opts.innerTlsHost ?? authority;
    const timeoutMs = opts.handshakeTimeoutMs ?? 15_000;
    // Polyfill `WebSocket` from the `ws` package on Node ≤ 21.
    let WS = globalThis
        .WebSocket;
    if (!WS) {
        const mod = (await import("ws"));
        WS = (mod.WebSocket ?? mod.default);
        if (!WS)
            throw new Error("ws package present but no WebSocket export");
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
    const codec = opts.makeHyflariaCodec();
    const sessionId = Math.floor(Math.random() * 0xffff_ffff);
    const nonce = new Uint8Array(16);
    crypto.getRandomValues(nonce);
    // -------- Phase 1: Hyflaria AUTH handshake -------------------------
    const authFrame = codec.buildAuthFrame(sessionId, nonce);
    const respPromise = waitForOneMessage(ws, timeoutMs);
    ws.send(authFrame);
    const respBytes = await respPromise;
    // Throws if the server's AUTH_RESPONSE has auth_ok=false or wrong type.
    codec.verifyAuthResponse(respBytes);
    // Track Hyflaria DATA sequence numbers ourselves; the ingress
    // drops the connection if a DATA frame arrives with a
    // non-monotonic seq.
    let lastRxSeq = 0n;
    let txSeq = 0n;
    let closed = false;
    // Helper: wrap a ciphertext blob as a Hyflaria DATA frame + send.
    // Throws if the WS layer has already closed.
    const sendData = (ciphertext) => {
        if (closed || ciphertext.length === 0)
            return;
        txSeq += 1n;
        const frame = codec.buildDataFrame(sessionId, txSeq, ciphertext);
        try {
            ws.send(frame);
        }
        catch (e) {
            closed = true;
            throw e;
        }
    };
    let dataWaiters = [];
    const pendingPayloads = [];
    let postHandshakeSink = null;
    const handleInboundFrame = (bytes) => {
        let frame;
        try {
            frame = codec.verifyDataFrame(bytes, lastRxSeq);
        }
        catch {
            // Non-DATA / replay / non-monotonic — silently ignore so
            // we don't tear down the link on a keepalive frame.
            return;
        }
        lastRxSeq = frame.seq;
        const payload = frame.payload;
        if (postHandshakeSink) {
            postHandshakeSink(payload);
            return;
        }
        const waiter = dataWaiters.shift();
        if (waiter) {
            waiter.resolve(payload);
        }
        else {
            pendingPayloads.push(payload);
        }
    };
    const rejectAllDataWaiters = (err) => {
        const waiters = dataWaiters;
        dataWaiters = [];
        for (const w of waiters)
            w.reject(err);
    };
    ws.addEventListener("message", (ev) => {
        if (closed)
            return;
        const bytes = asUint8(ev.data);
        if (!bytes)
            return;
        handleInboundFrame(bytes);
    });
    ws.addEventListener("close", () => {
        closed = true;
        rejectAllDataWaiters(new Error("wss closed during dial"));
    });
    ws.addEventListener("error", () => {
        closed = true;
        rejectAllDataWaiters(new Error("wss error during dial"));
    });
    const nextDataPayload = (deadlineMs) => {
        return new Promise((resolve, reject) => {
            if (closed) {
                reject(new Error("wss closed before next data payload"));
                return;
            }
            const buffered = pendingPayloads.shift();
            if (buffered) {
                resolve(buffered);
                return;
            }
            const timer = setTimeout(() => {
                const idx = dataWaiters.findIndex((w) => w.resolve === wrappedResolve);
                if (idx >= 0)
                    dataWaiters.splice(idx, 1);
                reject(new Error("inner-TLS handshake: timed out waiting for Hyflaria DATA"));
            }, deadlineMs);
            const wrappedResolve = (b) => {
                clearTimeout(timer);
                resolve(b);
            };
            const wrappedReject = (e) => {
                clearTimeout(timer);
                reject(e);
            };
            dataWaiters.push({
                resolve: wrappedResolve,
                reject: wrappedReject,
            });
        });
    };
    // -------- Phase 2: inner TLS 1.3 handshake (SPKI-pinned, ALPN h2) -----
    // The caller's `makeTlsHandshake` returns a handshake that has
    // the SPKI pin baked in and ALPN=["h2"]. SNI defaults to the
    // host arg, which we align with the gRPC :authority below.
    const hs = opts.makeTlsHandshake(innerTlsHost);
    let tlsConn;
    try {
        const handshakeDeadlineMs = timeoutMs;
        // Hard cap on iterations as a safety net — a real TLS 1.3
        // 1-RTT handshake completes in 2-3 round trips.
        const maxIters = 64;
        // The constructor already drained the ClientHello into
        // outbound. Ship it first before any reads.
        {
            const initial = hs.takeOutbound();
            if (initial.length > 0)
                sendData(initial);
        }
        for (let i = 0; i < maxIters; i += 1) {
            if (hs.isComplete())
                break;
            // Always wait for the next inbound frame (server
            // response) before processing. After feedInbound +
            // process, drain any new outbound bytes (e.g. client
            // Finished after server's ServerHello..Finished).
            const payload = await nextDataPayload(handshakeDeadlineMs);
            hs.feedInbound(payload);
            hs.process();
            const out = hs.takeOutbound();
            if (out.length > 0)
                sendData(out);
        }
        if (!hs.isComplete()) {
            throw new Error("inner-TLS handshake: did not complete within iteration cap");
        }
        tlsConn = hs.finish();
        // After completion, drain any final outbound TLS bytes the
        // state machine queued (sometimes session tickets / NST hints).
        const trailer = tlsConn.takeOutbound();
        if (trailer.length > 0)
            sendData(trailer);
    }
    catch (e) {
        try {
            ws.close();
        }
        catch {
            /* ignore */
        }
        closed = true;
        throw e;
    }
    // -------- Phase 3: post-handshake pumps + h2 wiring ---------------
    const inner = opts.makePumpedDuplex();
    // Rebind the inbound sink: each Hyflaria DATA payload is now
    // TLS ciphertext; feed through `tlsConn.feedInbound` → plaintext
    // into `inner.pushInbound`. TLS may also want to send
    // post-handshake bytes (KeyUpdate, alerts), so drain its
    // outbound after every decrypt cycle too.
    postHandshakeSink = (ciphertext) => {
        if (closed)
            return;
        try {
            const plain = tlsConn.feedInbound(ciphertext);
            if (plain.length > 0)
                inner.pushInbound(plain);
            const echoOut = tlsConn.takeOutbound();
            if (echoOut.length > 0)
                sendData(echoOut);
        }
        catch (e) {
            // TLS decrypt error or BadRecordMac — surface to h2 by
            // closing inner. h2 will error its pending streams cleanly.
            inner.close();
            closed = true;
            try {
                ws.close();
            }
            catch {
                /* ignore */
            }
            console.error(`[wss-stack] inner-TLS decrypt error: ${e.message ?? e}`);
        }
    };
    // Any payloads that arrived between handshake completion and the
    // sink rebind (rare but possible if the server sent a
    // ChangeCipherSpec or post-handshake message in the same tick).
    while (pendingPayloads.length > 0) {
        const p = pendingPayloads.shift();
        if (p)
            postHandshakeSink(p);
    }
    // Outbound pump: drain inner.outbound (h2 plaintext) → tlsConn
    // encrypt → DATA frame → ws.send. We must `tlsConn.takeOutbound`
    // RIGHT after every writePlaintext so flushes don't sit in the
    // TLS record buffer waiting for a tick boundary that never comes.
    let pumpRunning = true;
    // Macrotask scheduler. In Node, `setImmediate` yields to I/O between
    // iterations. In browsers `setImmediate` is undefined; esbuild's
    // bundler-stub maps it to `queueMicrotask`, which is a MICROTASK —
    // microtasks run to exhaustion before any macrotask (including WS
    // message events), so a self-rescheduling pump starves WS deliveries
    // and the handshake hangs. Use `setTimeout(_, 0)` in browsers so
    // each iteration yields control back to the event loop.
    const scheduleNext = typeof globalThis
        .setImmediate === "function"
        ? globalThis
            .setImmediate
        : (cb) => {
            setTimeout(cb, 0);
        };
    const pump = () => {
        if (!pumpRunning || closed)
            return;
        const plain = inner.takeOutbound();
        if (plain.length > 0) {
            try {
                tlsConn.writePlaintext(plain);
                const wire = tlsConn.takeOutbound();
                if (wire.length > 0)
                    sendData(wire);
            }
            catch (e) {
                console.error(`[wss-stack] outbound TLS encrypt failed: ${e.message ?? e}`);
                pumpRunning = false;
                inner.close();
                closed = true;
                try {
                    ws.close();
                }
                catch {
                    /* ignore */
                }
                return;
            }
        }
        scheduleNext(pump);
    };
    scheduleNext(pump);
    // `connectGrpcChannel` consumes the duplex handle, so mint a
    // sibling handle for h2 to own and keep `inner` alive in JS for
    // the pumps + close().
    const innerForH2 = inner.clone();
    const channel = await opts.connectGrpcChannel(innerForH2, authority);
    return {
        channel,
        close: () => {
            pumpRunning = false;
            if (!closed) {
                try {
                    // TLS close_notify alert through the inner conn,
                    // then a Hyflaria CLOSE to terminate the outer
                    // session politely.
                    tlsConn.sendCloseNotify();
                    const wire = tlsConn.takeOutbound();
                    if (wire.length > 0)
                        sendData(wire);
                }
                catch {
                    /* ignore */
                }
                try {
                    txSeq += 1n;
                    ws.send(codec.buildCloseFrame(sessionId, txSeq));
                }
                catch {
                    /* ignore */
                }
            }
            closed = true;
            inner.close();
            try {
                ws.close();
            }
            catch {
                /* ignore */
            }
        },
    };
}
function asUint8(data) {
    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
        const v = data;
        return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    }
    return null;
}
function waitForOneMessage(ws, timeoutMs) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            ws.removeEventListener("message", onMsg);
            ws.removeEventListener("error", onErr);
            ws.removeEventListener("close", onClose);
            clearTimeout(timer);
        };
        const onMsg = (ev) => {
            const u = asUint8(ev.data);
            if (!u)
                return;
            cleanup();
            resolve(u);
        };
        const onErr = () => {
            cleanup();
            reject(new Error("wss error during handshake"));
        };
        const onClose = () => {
            cleanup();
            reject(new Error("wss closed during handshake"));
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`wss handshake timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        ws.addEventListener("message", onMsg);
        ws.addEventListener("error", onErr);
        ws.addEventListener("close", onClose);
    });
}
//# sourceMappingURL=wss-stack.js.map