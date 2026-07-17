/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_wasmtlsconnection_free: (a: number, b: number) => void;
export const __wbg_wasmtlshandshake_free: (a: number, b: number) => void;
export const version: () => [number, number];
export const wasmtlsconnection_feedInbound: (a: number, b: number, c: number) => [number, number, number, number];
export const wasmtlsconnection_sendCloseNotify: (a: number) => [number, number];
export const wasmtlsconnection_takeOutbound: (a: number) => [number, number];
export const wasmtlsconnection_writePlaintext: (a: number, b: number, c: number) => [number, number];
export const wasmtlshandshake_feedInbound: (a: number, b: number, c: number) => [number, number];
export const wasmtlshandshake_finish: (a: number) => [number, number, number];
export const wasmtlshandshake_isComplete: (a: number) => number;
export const wasmtlshandshake_new: (a: number, b: number, c: any) => [number, number, number];
export const wasmtlshandshake_process: (a: number) => [number, number];
export const wasmtlshandshake_wantsRead: (a: number) => number;
export const init: () => void;
export const wasmtlshandshake_takeOutbound: (a: number) => [number, number];
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
