/* @ts-self-types="./hyflaria_web_sys.d.ts" */

/**
 * Result of decoding an inbound DATA frame: `seq` is the validated
 * monotonic counter, `payload` is the inner-plaintext bytes the
 * caller should hand to the inner-TLS engine.
 */
class HyflariaDataFrame {
    static __wrap(ptr) {
        const obj = Object.create(HyflariaDataFrame.prototype);
        obj.__wbg_ptr = ptr;
        HyflariaDataFrameFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HyflariaDataFrameFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hyflariadataframe_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get payload() {
        const ret = wasm.hyflariadataframe_payload(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {bigint}
     */
    get seq() {
        const ret = wasm.hyflariadataframe_seq(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
}
if (Symbol.dispose) HyflariaDataFrame.prototype[Symbol.dispose] = HyflariaDataFrame.prototype.free;
exports.HyflariaDataFrame = HyflariaDataFrame;

/**
 * Manual-mode codec: callers drive the framing themselves, one
 * outbound WSS frame at a time. Use this if you need finer
 * control than `connect_hyflaria_outer_inner` gives you.
 */
class WasmHyflariaCodec {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmHyflariaCodecFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmhyflariacodec_free(ptr, 0);
    }
    /**
     * Server-side: accept an inbound AUTH frame. Returns the
     * session_id on success.
     * @param {Uint8Array} bytes
     * @returns {number}
     */
    acceptAuth(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmhyflariacodec_acceptAuth(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Build the client-side AUTH frame. `nonce` MUST be 16 bytes;
     * the caller is expected to source it from
     * `crypto.getRandomValues(new Uint8Array(16))`.
     * @param {number} session_id
     * @param {Uint8Array} nonce
     * @returns {Uint8Array}
     */
    buildAuthFrame(session_id, nonce) {
        const ptr0 = passArray8ToWasm0(nonce, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmhyflariacodec_buildAuthFrame(this.__wbg_ptr, session_id, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Server-side: build an AUTH_RESPONSE frame.
     * @param {boolean} ok
     * @param {string} msg
     * @param {number} session_id
     * @returns {Uint8Array}
     */
    buildAuthResponse(ok, msg, session_id) {
        const ptr0 = passStringToWasm0(msg, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmhyflariacodec_buildAuthResponse(this.__wbg_ptr, ok, ptr0, len0, session_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Build a CLOSE frame.
     * @param {number} session_id
     * @param {bigint} seq
     * @returns {Uint8Array}
     */
    buildCloseFrame(session_id, seq) {
        const ret = wasm.wasmhyflariacodec_buildCloseFrame(this.__wbg_ptr, session_id, seq);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Build a DATA frame for an outbound payload chunk.
     * @param {number} session_id
     * @param {bigint} seq
     * @param {Uint8Array} payload
     * @returns {Uint8Array}
     */
    buildDataFrame(session_id, seq, payload) {
        const ptr0 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmhyflariacodec_buildDataFrame(this.__wbg_ptr, session_id, seq, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * `secret` MUST be exactly 32 bytes. Throws otherwise.
     * @param {Uint8Array} secret
     */
    constructor(secret) {
        const ptr0 = passArray8ToWasm0(secret, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmhyflariacodec_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmHyflariaCodecFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Verify a server AUTH_RESPONSE. Returns the session_id on
     * success.
     * @param {Uint8Array} bytes
     * @returns {number}
     */
    verifyAuthResponse(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmhyflariacodec_verifyAuthResponse(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Verify an inbound DATA frame given the receiver's
     * last-seen sequence number. Returns the new seq + decoded
     * payload; throws on bad mac / replay / malformed.
     * @param {Uint8Array} bytes
     * @param {bigint} last_seq
     * @returns {HyflariaDataFrame}
     */
    verifyDataFrame(bytes, last_seq) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmhyflariacodec_verifyDataFrame(this.__wbg_ptr, ptr0, len0, last_seq);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return HyflariaDataFrame.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmHyflariaCodec.prototype[Symbol.dispose] = WasmHyflariaCodec.prototype.free;
exports.WasmHyflariaCodec = WasmHyflariaCodec;

/**
 * JS-facing wrapper that mirrors `tlsfetch-h2-web-sys::WasmPumpedDuplex`.
 * We re-export here so callers that import only this crate still get
 * a `WasmPumpedDuplex` constructor — the underlying type is the same
 * `Rc<RefCell<…>>` from `tlsfetch-h2-common::duplex`.
 */
class WasmPumpedDuplex {
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
     * @param {Uint8Array} bytes
     */
    pushInbound(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmpumpedduplex_pushInbound(this.__wbg_ptr, ptr0, len0);
    }
    /**
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
exports.WasmPumpedDuplex = WasmPumpedDuplex;

/**
 * High-level driver: spawns `wasm_bindgen_futures::spawn_local` tasks
 * that bridge `outer` (WSS plaintext, one frame per
 * `pushInbound`/`takeOutbound` chunk) with `inner` (caller-facing
 * plaintext). Inner-bound bytes get Hyflaria-framed before going
 * out; inbound WSS bytes get unframed before reaching `inner`.
 *
 * The caller drives `outer` from JS the same way they drive any
 * other `WasmPumpedDuplex`: each WSS message gets pushed in via
 * `outer.pushInbound(...)`, and any bytes the driver wants to
 * send come out via `outer.takeOutbound()` for the JS side to
 * ship over the WebSocket.
 *
 * `inner` is symmetric on the caller's side: caller writes
 * plaintext via `inner.pushInbound(...)` to send it through
 * hyflaria, and reads inbound plaintext via `inner.takeOutbound()`.
 *
 * AUTH is performed first; if it fails the returned Promise
 * rejects and neither duplex is left open.
 * @param {WasmPumpedDuplex} outer
 * @param {WasmPumpedDuplex} inner
 * @param {Uint8Array} secret
 * @param {number} session_id
 * @param {Uint8Array} auth_nonce
 * @returns {Promise<void>}
 */
function connectHyflariaOuterInner(outer, inner, secret, session_id, auth_nonce) {
    _assertClass(outer, WasmPumpedDuplex);
    var ptr0 = outer.__destroy_into_raw();
    _assertClass(inner, WasmPumpedDuplex);
    var ptr1 = inner.__destroy_into_raw();
    const ptr2 = passArray8ToWasm0(secret, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(auth_nonce, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.connectHyflariaOuterInner(ptr0, ptr1, ptr2, len2, session_id, ptr3, len3);
    return ret;
}
exports.connectHyflariaOuterInner = connectHyflariaOuterInner;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_ef53bc310eb298a0: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_is_function_754e9f305ff6029e: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_undefined_67b456be8673d3d7: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_61db23ac97f16c31: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_call_9c758de292015997: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_new_typed_bf31d18f92484486: function(arg0, arg1) {
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
        },
        __wbg_queueMicrotask_35c611f4a14830b2: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queueMicrotask_404ed0a58e0b63cc: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_resolve_25a7e548d5881dca: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_static_accessor_GLOBAL_9d53f2689e622ca1: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_4c59f6c7ea29a144: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_e70ae9f2eb052253: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_then_ac7b025999b52837: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 40, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__hb43641daaf1cdf5c);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./hyflaria_web_sys_bg.js": import0,
    };
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

const HyflariaDataFrameFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hyflariadataframe_free(ptr, 1));
const WasmHyflariaCodecFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmhyflariacodec_free(ptr, 1));
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
function decodeText(ptr, len) {
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

const wasmPath = `${__dirname}/hyflaria_web_sys_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasmInstance = new WebAssembly.Instance(wasmModule, __wbg_get_imports());
let wasm = wasmInstance.exports;
wasm.__wbindgen_start();
