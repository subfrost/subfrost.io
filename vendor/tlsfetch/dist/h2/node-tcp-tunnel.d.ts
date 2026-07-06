import type { GrpcTunnel } from "./pumped-tunnel.js";
export interface NodeTcpOptions {
    host: string;
    port: number;
    authority: string;
    connectTimeoutMs?: number;
}
export declare function connectViaTcp(opts: NodeTcpOptions): Promise<GrpcTunnel>;
//# sourceMappingURL=node-tcp-tunnel.d.ts.map