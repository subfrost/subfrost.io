/* @ts-self-types="./tlsfetch_h2_web_sys.d.ts" */
import * as wasm from "./tlsfetch_h2_web_sys_bg.wasm";
import { __wbg_set_wasm } from "./tlsfetch_h2_web_sys_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    WasmGrpcChannel, WasmPumpedDuplex, connectGrpcChannel
} from "./tlsfetch_h2_web_sys_bg.js";
