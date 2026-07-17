/**
 * Abstract socket interfaces. Plug in a `NetModule` from any source:
 *   - `nodeNetModule()` — Node's built-in `node:net` + `node:dgram`
 *   - `subzeroNetModule(client)` — @subzero/ts-sdk frtun polyfills
 *   - your own custom thing
 *
 * tlsfetch only ever talks through these interfaces, so the same wasm
 * works in every JS runtime.
 */
/**
 * Default NetModule for Node.js — uses `node:net` for TCP and
 * `node:dgram` for UDP.
 */
export async function nodeNetModule() {
    const net = await import("node:net");
    const dgram = await import("node:dgram");
    return {
        async createTcpSocket(host, port, opts) {
            const sock = net.createConnection({ host, port });
            const buf = [];
            const waiters = [];
            let ended = false;
            let errored = null;
            const drain = () => {
                if (buf.length === 0)
                    return ended ? new Uint8Array() : null;
                const out = Buffer.concat(buf);
                buf.length = 0;
                return new Uint8Array(out);
            };
            sock.on("data", (chunk) => {
                buf.push(chunk);
                while (waiters.length > 0) {
                    const got = drain();
                    if (got === null)
                        break;
                    waiters.shift()(got);
                }
            });
            sock.on("end", () => {
                ended = true;
                while (waiters.length > 0)
                    waiters.shift()(new Uint8Array());
            });
            sock.on("error", (e) => {
                errored = e;
                ended = true;
                while (waiters.length > 0)
                    waiters.shift()(new Uint8Array());
            });
            await new Promise((resolve, reject) => {
                const timer = opts?.timeoutMs
                    ? setTimeout(() => reject(new Error(`connect timeout ${opts.timeoutMs}ms`)), opts.timeoutMs)
                    : null;
                sock.once("connect", () => {
                    if (timer)
                        clearTimeout(timer);
                    resolve();
                });
                sock.once("error", (e) => {
                    if (timer)
                        clearTimeout(timer);
                    reject(e);
                });
            });
            return {
                async read(_maxBytes) {
                    if (errored)
                        throw errored;
                    const got = drain();
                    if (got !== null)
                        return got;
                    return new Promise((resolve) => waiters.push(resolve));
                },
                async write(bytes) {
                    if (errored)
                        throw errored;
                    await new Promise((resolve, reject) => {
                        sock.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
                    });
                },
                async end() {
                    await new Promise((resolve) => sock.end(() => resolve()));
                },
                async close() {
                    sock.destroy();
                },
            };
        },
        async createUdpSocket(host, port) {
            const sock = dgram.createSocket("udp4");
            sock.connect(port, host);
            const buf = [];
            const waiters = [];
            sock.on("message", (msg) => {
                if (waiters.length > 0) {
                    waiters.shift()(new Uint8Array(msg));
                }
                else {
                    buf.push(msg);
                }
            });
            await new Promise((resolve, reject) => {
                sock.once("connect", () => resolve());
                sock.once("error", reject);
            });
            return {
                async recv(_maxBytes) {
                    if (buf.length > 0)
                        return new Uint8Array(buf.shift());
                    return new Promise((resolve) => waiters.push(resolve));
                },
                async send(bytes) {
                    await new Promise((resolve, reject) => sock.send(Buffer.from(bytes), (err) => (err ? reject(err) : resolve())));
                },
                async close() {
                    sock.close();
                },
            };
        },
    };
}
//# sourceMappingURL=socket.js.map