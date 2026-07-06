/**
 * JS-facing gRPC channel handle. Use `connectGrpcChannel` to
 * mint one; then `await channel.callUnary(...)` for each RPC.
 */
export class WasmGrpcChannel {
    static __wrap(ptr) {
        const obj = Object.create(WasmGrpcChannel.prototype);
        obj.__wbg_ptr = ptr;
        WasmGrpcChannelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmGrpcChannelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmgrpcchannel_free(ptr, 0);
    }
    /**
     * Issue a unary gRPC call. `path` is the full
     * `/<service>/<Method>` route. `body` is already-LPM-framed
     * (the 5-byte gRPC LPM header + protobuf payload — use the
     * `frameGrpcMessage` helper exported by the umbrella crate).
     * Returns the framed response body bytes.
     * @param {string} path
     * @param {Uint8Array} body
     * @returns {Promise<Uint8Array>}
     */
    callUnary(path, body) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmgrpcchannel_callUnary(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
}
if (Symbol.dispose) WasmGrpcChannel.prototype[Symbol.dispose] = WasmGrpcChannel.prototype.free;

/**
 * JS-facing wrapper around the pure-Rust `PumpedDuplex`. Holds
 * the same `Rc<RefCell<…>>` so clones share the buffers — the
 * caller hands one clone to `connectGrpcChannel` (which it
 * passes to h2) and keeps the other to push/pull bytes.
 */
export class WasmPumpedDuplex {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPumpedDuplexFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpumpedduplex_free(ptr, 0);
    }
    /**
     * Mark the duplex closed. Pending `callUnary` rejects.
     */
    close() {
        wasm.wasmpumpedduplex_close(this.__wbg_ptr);
    }
    /**
     * @returns {boolean}
     */
    isClosed() {
        const ret = wasm.wasmpumpedduplex_isClosed(this.__wbg_ptr);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.wasmpumpedduplex_new();
        this.__wbg_ptr = ret;
        WasmPumpedDuplexFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * JS push: plaintext bytes (just-decrypted off the outer
     * socket) become inbound payload h2 will read.
     * @param {Uint8Array} bytes
     */
    pushInbound(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmpumpedduplex_pushInbound(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * JS pull: plaintext bytes h2 wants to send. Caller
     * encrypts + writes to the outer socket.
     * @returns {Uint8Array}
     */
    takeOutbound() {
        const ret = wasm.wasmpumpedduplex_takeOutbound(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) WasmPumpedDuplex.prototype[Symbol.dispose] = WasmPumpedDuplex.prototype.free;

/**
 * Async handshake. Spawns the h2 connection driver on the JS
 * event loop via `wasm_bindgen_futures::spawn_local` so it
 * runs continuously alongside the application code. Returns a
 * ready-to-use channel.
 * @param {WasmPumpedDuplex} duplex
 * @param {string} authority
 * @returns {Promise<WasmGrpcChannel>}
 */
export function connectGrpcChannel(duplex, authority) {
    _assertClass(duplex, WasmPumpedDuplex);
    var ptr0 = duplex.__destroy_into_raw();
    const ptr1 = passStringToWasm0(authority, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.connectGrpcChannel(ptr0, ptr1, len1);
    return ret;
}
export function __wbg___wbindgen_is_function_754e9f305ff6029e(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
}
export function __wbg___wbindgen_is_undefined_67b456be8673d3d7(arg0) {
    const ret = arg0 === undefined;
    return ret;
}
export function __wbg___wbindgen_throw_1506f2235d1bdba0(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
}
export function __wbg__wbg_cb_unref_61db23ac97f16c31(arg0) {
    arg0._wbg_cb_unref();
}
export function __wbg_call_9c758de292015997() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments); }
export function __wbg_new_typed_bf31d18f92484486(arg0, arg1) {
    try {
        var state0 = {a: arg0, b: arg1};
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return wasm_bindgen__convert__closures_____invoke__h2167e2dc5d4504c9(a, state0.b, arg0, arg1);
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return ret;
    } finally {
        state0.a = 0;
    }
}
export function __wbg_queueMicrotask_35c611f4a14830b2(arg0) {
    queueMicrotask(arg0);
}
export function __wbg_queueMicrotask_404ed0a58e0b63cc(arg0) {
    const ret = arg0.queueMicrotask;
    return ret;
}
export function __wbg_resolve_25a7e548d5881dca(arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
}
export function __wbg_static_accessor_GLOBAL_9d53f2689e622ca1() {
    const ret = typeof global === 'undefined' ? null : global;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a() {
    const ret = typeof globalThis === 'undefined' ? null : globalThis;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_static_accessor_SELF_4c59f6c7ea29a144() {
    const ret = typeof self === 'undefined' ? null : self;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_static_accessor_WINDOW_e70ae9f2eb052253() {
    const ret = typeof window === 'undefined' ? null : window;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_then_ac7b025999b52837(arg0, arg1) {
    const ret = arg0.then(arg1);
    return ret;
}
export function __wbg_wasmgrpcchannel_new(arg0) {
    const ret = WasmGrpcChannel.__wrap(arg0);
    return ret;
}
export function __wbindgen_cast_0000000000000001(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 150, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__hb43641daaf1cdf5c);
    return ret;
}
export function __wbindgen_cast_0000000000000002(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
}
export function __wbindgen_cast_0000000000000003(arg0, arg1) {
    var v0 = getArrayU8FromWasm0(arg0, arg1).slice();
    wasm.__wbindgen_free(arg0, arg1 * 1, 1);
    // Cast intrinsic for `Vector(U8) -> Externref`.
    const ret = v0;
    return ret;
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
function wasm_bindgen__convert__closures_____invoke__hb43641daaf1cdf5c(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__hb43641daaf1cdf5c(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h2167e2dc5d4504c9(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h2167e2dc5d4504c9(arg0, arg1, arg2, arg3);
}

const WasmGrpcChannelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmgrpcchannel_free(ptr, 1));
const WasmPumpedDuplexFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpumpedduplex_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
