// HTTP/2 + gRPC tunnel adapters that bridge whatever the host
// platform's socket primitive is — Node `net.Socket`, browser
// `WebSocket`, browser `WebTransport` — into the wasm-side
// `WasmPumpedDuplex` / `WasmGrpcChannel` exposed by
// `tlsfetch-h2-web-sys`.
//
// Each adapter:
//   1. opens its concrete socket,
//   2. mints a `WasmPumpedDuplex`,
//   3. wires a bidirectional pump (`socket.onmessage` →
//      `duplex.pushInbound`; periodic `duplex.takeOutbound` →
//      `socket.send`),
//   4. awaits `connectGrpcChannel(duplex, authority)` and returns
//      the channel handle plus a `close()` function the caller
//      invokes on shutdown.
//
// The wasm bundle does all the protocol work — h2 framing, gRPC
// LPM, trailers — so each adapter is just byte plumbing.
export { connectViaTcp } from "./node-tcp-tunnel.js";
export { connectViaWss } from "./wss-tunnel.js";
export { connectViaWssStack } from "./wss-stack.js";
//# sourceMappingURL=index.js.map