/**
 * tlsfetch — pure-Rust TLS+HTTP client compiled to wasm.
 *
 * Wraps the wasm-bindgen state machine in `tlsfetch-web-sys` and
 * drives it via a JS-supplied `NetModule` (Node's `node:net` by
 * default; the @subzero/ts-sdk frtun polyfills, or any other source
 * if you provide one).
 */
// @ts-ignore — emitted by wasm-pack at build time
import { WasmTlsHandshake } from "../pkg/tlsfetch_web_sys.js";
import { nodeNetModule } from "./socket.js";
export { nodeNetModule } from "./socket.js";
/**
 * High-level: do an HTTPS GET/POST/etc against `url` using `net` for
 * the underlying TCP transport. The TLS handshake runs entirely in
 * Rust (compiled to wasm) regardless of the JS runtime.
 */
export async function tlsfetch(url, init = {}, net) {
    const u = typeof url === "string" ? new URL(url) : url;
    if (u.protocol !== "https:") {
        throw new Error(`tlsfetch only supports https:// URLs, got ${u.protocol}`);
    }
    const host = u.hostname;
    const port = u.port ? parseInt(u.port, 10) : 443;
    const path = u.pathname + u.search;
    const netMod = net ?? (await nodeNetModule());
    const dialHost = init.resolve?.host === host && init.resolve.port === port ? init.resolve.addr : host;
    const dialPort = init.resolve?.host === host && init.resolve.port === port ? init.resolve.port : port;
    const socket = await netMod.createTcpSocket(dialHost, dialPort, {
        timeoutMs: init.connectTimeoutMs,
    });
    const sniHost = init.sni ?? host;
    let conn;
    {
        // Drive the handshake state machine.
        const hs = new WasmTlsHandshake(sniHost, {
            insecure: init.insecure ?? false,
            alpn: ["http/1.1"],
            fingerprint: init.fingerprint,
        });
        try {
            // Send any initial ClientHello bytes.
            let pending = hs.takeOutbound();
            if (pending.length > 0)
                await socket.write(pending);
            while (!hs.isComplete()) {
                if (hs.wantsRead()) {
                    const chunk = await socket.read(16384);
                    if (chunk.length === 0) {
                        throw new Error("connection closed during handshake");
                    }
                    hs.feedInbound(chunk);
                }
                hs.process();
                pending = hs.takeOutbound();
                if (pending.length > 0)
                    await socket.write(pending);
            }
            conn = hs.finish();
        }
        finally {
            // hs is consumed by finish() on success, no need to free.
        }
    }
    // Build the HTTP/1.1 request.
    const method = (init.method ?? "GET").toUpperCase();
    const headers = {
        Host: port === 443 ? host : `${host}:${port}`,
        "User-Agent": "tlsfetch/0.1",
        Accept: "*/*",
        Connection: "close",
        ...(init.headers ?? {}),
    };
    let body = new Uint8Array();
    if (init.body !== undefined) {
        body = typeof init.body === "string" ? new TextEncoder().encode(init.body) : init.body;
        if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-length")) {
            headers["Content-Length"] = String(body.length);
        }
    }
    let reqStr = `${method} ${path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers))
        reqStr += `${k}: ${v}\r\n`;
    reqStr += "\r\n";
    const reqBytes = new Uint8Array(reqStr.length + body.length);
    reqBytes.set(new TextEncoder().encode(reqStr), 0);
    reqBytes.set(body, reqStr.length);
    conn.writePlaintext(reqBytes);
    let outgoing = conn.takeOutbound();
    if (outgoing.length > 0)
        await socket.write(outgoing);
    // Read response.
    const respChunks = [];
    while (true) {
        const wire = await socket.read(16384);
        if (wire.length === 0)
            break;
        const plain = conn.feedInbound(wire);
        if (plain.length > 0)
            respChunks.push(plain);
        outgoing = conn.takeOutbound();
        if (outgoing.length > 0)
            await socket.write(outgoing);
    }
    try {
        conn.sendCloseNotify();
        const finalOut = conn.takeOutbound();
        if (finalOut.length > 0) {
            try {
                await socket.write(finalOut);
            }
            catch { }
        }
    }
    catch { }
    await socket.close();
    return parseHttpResponse(concatChunks(respChunks));
}
function concatChunks(chunks) {
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return out;
}
function parseHttpResponse(bytes) {
    const headerEnd = findCrlfCrlf(bytes);
    if (headerEnd < 0) {
        throw new Error(`malformed HTTP response (no header terminator, got ${bytes.length} bytes)`);
    }
    const headerText = new TextDecoder("latin1").decode(bytes.subarray(0, headerEnd));
    const lines = headerText.split("\r\n");
    const statusLine = lines[0];
    const m = statusLine.match(/^HTTP\/\d\.\d\s+(\d+)\s*(.*)$/);
    if (!m)
        throw new Error(`malformed status line: ${statusLine}`);
    const status = parseInt(m[1], 10);
    const statusText = m[2];
    const headers = {};
    let contentLength = null;
    let chunked = false;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line)
            continue;
        const idx = line.indexOf(":");
        if (idx < 0)
            continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        headers[k.toLowerCase()] = v;
        if (k.toLowerCase() === "content-length")
            contentLength = parseInt(v, 10);
        if (k.toLowerCase() === "transfer-encoding" && v.toLowerCase().includes("chunked"))
            chunked = true;
    }
    let body = bytes.subarray(headerEnd + 4);
    if (chunked) {
        body = decodeChunked(body);
    }
    else if (contentLength !== null) {
        body = body.subarray(0, contentLength);
    }
    return {
        status,
        statusText,
        headers,
        body,
        text() { return new TextDecoder().decode(body); },
        json() { return JSON.parse(new TextDecoder().decode(body)); },
    };
}
function findCrlfCrlf(b) {
    for (let i = 0; i + 3 < b.length; i++) {
        if (b[i] === 0x0d && b[i + 1] === 0x0a && b[i + 2] === 0x0d && b[i + 3] === 0x0a) {
            return i;
        }
    }
    return -1;
}
function decodeChunked(input) {
    const out = [];
    let i = 0;
    while (i < input.length) {
        // Read size line
        let lineEnd = i;
        while (lineEnd + 1 < input.length && !(input[lineEnd] === 0x0d && input[lineEnd + 1] === 0x0a)) {
            lineEnd++;
        }
        const sizeStr = new TextDecoder("latin1").decode(input.subarray(i, lineEnd));
        const size = parseInt(sizeStr.split(";")[0].trim(), 16);
        i = lineEnd + 2;
        if (Number.isNaN(size) || size === 0)
            break;
        for (let k = 0; k < size; k++)
            out.push(input[i + k]);
        i += size + 2;
    }
    return new Uint8Array(out);
}
//# sourceMappingURL=index.js.map