export interface HyflariaCodecHandle {
    buildAuthFrame(sessionId: number, nonce: Uint8Array): Uint8Array;
    verifyAuthResponse(bytes: Uint8Array): number;
    buildDataFrame(sessionId: number, seq: bigint, payload: Uint8Array): Uint8Array;
    verifyDataFrame(bytes: Uint8Array, lastSeq: bigint): {
        seq: bigint;
        payload: Uint8Array;
    };
    buildCloseFrame(sessionId: number, seq: bigint): Uint8Array;
}
export interface TlsHandshakeHandle {
    feedInbound(bytes: Uint8Array): void;
    process(): void;
    takeOutbound(): Uint8Array;
    wantsRead(): boolean;
    isComplete(): boolean;
    finish(): TlsConnectionHandle;
}
export interface TlsConnectionHandle {
    feedInbound(bytes: Uint8Array): Uint8Array;
    writePlaintext(bytes: Uint8Array): void;
    takeOutbound(): Uint8Array;
    sendCloseNotify(): void;
}
export interface PumpedDuplexHandle {
    pushInbound(bytes: Uint8Array): void;
    takeOutbound(): Uint8Array;
    close(): void;
    clone(): PumpedDuplexHandle;
}
export interface GrpcChannelHandle {
    callUnary(path: string, body: Uint8Array): Promise<Uint8Array>;
    callUnaryWithHeaders?(path: string, body: Uint8Array, headers: [string, string][]): Promise<Uint8Array>;
}
export interface GrpcTunnel {
    channel: GrpcChannelHandle;
    close: () => void;
}
export interface WssStackOptions {
    url: string;
    authority: string;
    innerTlsHost?: string;
    makeHyflariaCodec: () => HyflariaCodecHandle;
    makeTlsHandshake: (host: string) => TlsHandshakeHandle;
    makePumpedDuplex: () => PumpedDuplexHandle;
    connectGrpcChannel: (duplex: PumpedDuplexHandle, authority: string) => Promise<GrpcChannelHandle>;
    handshakeTimeoutMs?: number;
}
export declare function connectViaWssStack(opts: WssStackOptions): Promise<GrpcTunnel>;
//# sourceMappingURL=wss-stack.d.ts.map