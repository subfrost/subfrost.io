import type { GrpcTunnel } from "./pumped-tunnel.js";
export interface WssOptions {
    url: string;
    authority: string;
    handshakeTimeoutMs?: number;
    hyflariaSecret?: Uint8Array;
    hyflariaSessionId?: number;
}
export declare function connectViaWss(opts: WssOptions): Promise<GrpcTunnel>;
//# sourceMappingURL=wss-tunnel.d.ts.map