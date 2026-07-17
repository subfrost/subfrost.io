import type { WasmGrpcChannel } from "../../pkg-h2-node/tlsfetch_h2_web_sys.js";
export type GrpcChannelHandle = WasmGrpcChannel;
export interface GrpcTunnel {
    channel: GrpcChannelHandle;
    close: () => void;
}
//# sourceMappingURL=pumped-tunnel.d.ts.map