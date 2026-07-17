/* @ts-self-types="./hyflaria_web_sys.d.ts" */
import * as wasm from "./hyflaria_web_sys_bg.wasm";
import { __wbg_set_wasm } from "./hyflaria_web_sys_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    HyflariaDataFrame, WasmHyflariaCodec, WasmPumpedDuplex, connectHyflariaOuterInner
} from "./hyflaria_web_sys_bg.js";
