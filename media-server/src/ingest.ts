import WebSocket from "ws";
import { Transcoder } from "./transcoder";

const PREFIX_SCREEN = 0x01;
const PREFIX_CAMERA = 0x02;
const PREFIX_PING = 0x00;

export function handleIngest(ws: WebSocket, streamKey: string, sessionId: string): void {
  console.log(`[ingest] New connection for session=${sessionId}, streamKey=${streamKey.slice(0, 8)}...`);

  let screenTranscoder: Transcoder | null = null;
  let cameraTranscoder: Transcoder | null = null;
  let connected = true;

  // Lazily initialize transcoders on first data for each track
  function getScreenTranscoder(): Transcoder {
    if (!screenTranscoder) {
      screenTranscoder = new Transcoder(sessionId, "screen");
    }
    return screenTranscoder;
  }

  function getCameraTranscoder(): Transcoder {
    if (!cameraTranscoder) {
      cameraTranscoder = new Transcoder(sessionId, "camera");
    }
    return cameraTranscoder;
  }

  ws.on("message", (data: WebSocket.RawData) => {
    if (!connected) return;

    try {
      // Expect binary messages
      let buffer: Buffer;
      if (Buffer.isBuffer(data)) {
        buffer = data;
      } else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(data);
      } else if (Array.isArray(data)) {
        buffer = Buffer.concat(data);
      } else {
        console.warn(`[ingest][${sessionId}] Unexpected message type`);
        return;
      }

      if (buffer.length < 1) {
        console.warn(`[ingest][${sessionId}] Empty message received`);
        return;
      }

      const prefix = buffer[0];
      const payload = buffer.subarray(1);

      switch (prefix) {
        case PREFIX_PING:
          // Respond with pong
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(Buffer.from([0x00]));
          }
          break;

        case PREFIX_SCREEN:
          if (payload.length > 0) {
            getScreenTranscoder().write(payload);
          }
          break;

        case PREFIX_CAMERA:
          if (payload.length > 0) {
            getCameraTranscoder().write(payload);
          }
          break;

        default:
          console.warn(`[ingest][${sessionId}] Unknown prefix byte: 0x${prefix.toString(16).padStart(2, "0")}`);
      }
    } catch (err) {
      console.error(`[ingest][${sessionId}] Error processing message:`, err);
    }
  });

  ws.on("close", async (code, reason) => {
    connected = false;
    console.log(`[ingest][${sessionId}] Connection closed: code=${code}, reason=${reason.toString()}`);

    // Finalize transcoders
    const stopPromises: Promise<void>[] = [];
    if (screenTranscoder) {
      stopPromises.push(screenTranscoder.stop());
    }
    if (cameraTranscoder) {
      stopPromises.push(cameraTranscoder.stop());
    }

    try {
      await Promise.all(stopPromises);
      console.log(`[ingest][${sessionId}] All transcoders stopped`);
    } catch (err) {
      console.error(`[ingest][${sessionId}] Error stopping transcoders:`, err);
    }
  });

  ws.on("error", (err) => {
    console.error(`[ingest][${sessionId}] WebSocket error:`, err);
    connected = false;
  });

  // Send ready signal
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ready", sessionId }));
  }
}
