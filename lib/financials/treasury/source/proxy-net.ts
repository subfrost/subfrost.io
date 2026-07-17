// Residential-proxy `NetModule` for tlsfetch.
//
// The treasury snapshot reaches the BSC RPC (NodeReal, behind Cloudflare) via
// tlsfetch's wasm TLS engine. From the GKE pod the datacenter NAT IP is now
// Cloudflare-blocked, so a direct dial hangs. This module tunnels the TCP leg
// through the IPROYAL residential HTTP proxy via an HTTP CONNECT, then hands
// tlsfetch the *tunneled* socket so the wasm TLS handshake runs end-to-end over
// a clean residential IP. Direct-dial (dev/local) still uses `nodeNetModule()`.
//
// tlsfetch only ever talks through the `NetModule` / `TcpSocket` interfaces
// (see ~/tlsfetch/ts-sdk/src/socket.ts), so wrapping the post-CONNECT socket in
// the same read/write/end/close buffering the default Node module uses is all
// that's required.

import type { NetModule, TcpSocket } from "tlsfetch"

/** Parse the `IPROYAL_PROXY` URL into dial target + Basic-auth header value. */
function parseProxy(raw: string): { host: string; port: number; auth: string } {
  const u = new URL(raw)
  const user = decodeURIComponent(u.username)
  const pass = decodeURIComponent(u.password)
  const auth = Buffer.from(`${user}:${pass}`).toString("base64")
  return { host: u.hostname, port: u.port ? parseInt(u.port, 10) : 8080, auth }
}

/** Wrap an already-connected `node:net` socket (with any bytes read *after* the
 *  CONNECT response pre-seeded in `seed`) in the `TcpSocket` read/write/end/close
 *  buffering tlsfetch expects. This mirrors `nodeNetModule()`'s adapter so the
 *  wasm TLS handshake behaves identically over the tunnel. */
function wrapSocket(sock: import("node:net").Socket, seed: Uint8Array): TcpSocket {
  const buf: Buffer[] = []
  if (seed.length > 0) buf.push(Buffer.from(seed))
  const waiters: Array<(b: Uint8Array) => void> = []
  let ended = false
  let errored: Error | null = null

  const drain = (): Uint8Array | null => {
    if (buf.length === 0) return ended ? new Uint8Array() : null
    const out = Buffer.concat(buf)
    buf.length = 0
    return new Uint8Array(out)
  }

  sock.on("data", (chunk: Buffer) => {
    buf.push(chunk)
    while (waiters.length > 0) {
      const got = drain()
      if (got === null) break
      waiters.shift()!(got)
    }
  })
  sock.on("end", () => {
    ended = true
    while (waiters.length > 0) waiters.shift()!(new Uint8Array())
  })
  sock.on("error", (e) => {
    errored = e
    ended = true
    while (waiters.length > 0) waiters.shift()!(new Uint8Array())
  })

  return {
    async read(_maxBytes) {
      if (errored) throw errored
      const got = drain()
      if (got !== null) return got
      return new Promise((resolve) => waiters.push(resolve))
    },
    async write(bytes) {
      if (errored) throw errored
      await new Promise<void>((resolve, reject) => {
        sock.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()))
      })
    },
    async end() {
      await new Promise<void>((resolve) => sock.end(() => resolve()))
    },
    async close() {
      sock.destroy()
    },
  }
}

/** Build a `NetModule` whose `createTcpSocket` dials the target *through* the
 *  IPROYAL residential proxy via HTTP CONNECT. `opts.timeoutMs` bounds the whole
 *  proxy-connect + tunnel-establish phase (rejects on expiry, never hangs). */
export async function proxyNetModule(proxyUrl: string): Promise<NetModule> {
  const net = await import("node:net")
  const { host: proxyHost, port: proxyPort, auth } = parseProxy(proxyUrl)

  return {
    async createTcpSocket(host, port, opts) {
      const sock = net.createConnection({ host: proxyHost, port: proxyPort })
      sock.setNoDelay(true)

      const timeoutMs = opts?.timeoutMs
      let timer: NodeJS.Timeout | null = null

      const seed = await new Promise<Uint8Array>((resolve, reject) => {
        let settled = false
        const cleanup = () => {
          if (timer) clearTimeout(timer)
          sock.removeListener("data", onData)
          sock.removeListener("error", onError)
          sock.removeListener("connect", onConnect)
        }
        const fail = (e: Error) => {
          if (settled) return
          settled = true
          cleanup()
          sock.destroy()
          reject(e)
        }
        const succeed = (leftover: Uint8Array) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(leftover)
        }

        if (timeoutMs) {
          timer = setTimeout(
            () => fail(new Error(`proxy connect timeout ${timeoutMs}ms`)),
            timeoutMs,
          )
        }

        let acc = Buffer.alloc(0)
        const onData = (chunk: Buffer) => {
          acc = Buffer.concat([acc, chunk])
          const sep = acc.indexOf("\r\n\r\n")
          if (sep === -1) return // headers not complete yet
          const head = acc.subarray(0, sep).toString("utf8")
          const statusLine = head.split("\r\n")[0] ?? ""
          // Expect e.g. "HTTP/1.1 200 Connection established".
          const m = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})/)
          if (!m || m[1] !== "200") {
            fail(new Error(`proxy CONNECT failed: ${statusLine || "no status line"}`))
            return
          }
          // Any bytes past the header terminator belong to the tunnel — hand
          // them to the wrapped socket so nothing is lost. (For TLS the client
          // speaks first, so this is normally empty.)
          const leftover = acc.subarray(sep + 4)
          succeed(new Uint8Array(leftover))
        }
        const onError = (e: Error) => fail(e)
        const onConnect = () => {
          const req =
            `CONNECT ${host}:${port} HTTP/1.1\r\n` +
            `Host: ${host}:${port}\r\n` +
            `Proxy-Authorization: Basic ${auth}\r\n` +
            `Proxy-Connection: keep-alive\r\n\r\n`
          sock.write(req)
        }

        sock.on("data", onData)
        sock.on("error", onError)
        sock.once("connect", onConnect)
      })

      return wrapSocket(sock, seed)
    },
  }
}
