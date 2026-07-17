// Common types every tunnel adapter implements.
//
// The wasm bundle's `WasmGrpcChannel` is the universal surface —
// the only thing that differs between Node-TCP and browser-WSS
// adapters is the byte pump that gets bytes in and out of the
// `WasmPumpedDuplex` underneath it.
export {};
//# sourceMappingURL=pumped-tunnel.js.map