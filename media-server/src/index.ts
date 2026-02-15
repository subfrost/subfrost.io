import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { getHealthStatus } from "./health";
import { validateStreamKey } from "./auth";
import { handleIngest } from "./ingest";

const PORT = parseInt(process.env.PORT || "8080", 10);

const app = express();

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json(getHealthStatus());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade
server.on("upgrade", async (request, socket, head) => {
  try {
    // Parse the stream key from query string
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const streamKey = url.searchParams.get("key");

    if (!streamKey) {
      console.log("[ws] Connection rejected: no stream key provided");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Validate the stream key
    const authResult = await validateStreamKey(streamKey);
    if (!authResult.valid || !authResult.sessionId) {
      console.log("[ws] Connection rejected: invalid stream key");
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const sessionId = authResult.sessionId;

    // Complete the WebSocket upgrade
    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      wss.emit("connection", ws, request);
      handleIngest(ws, streamKey, sessionId);
    });
  } catch (err) {
    console.error("[ws] Error during upgrade:", err);
    socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    socket.destroy();
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`[media-server] Listening on port ${PORT}`);
  console.log(`[media-server] Health check: http://localhost:${PORT}/health`);
  console.log(`[media-server] LOCAL_MODE: ${process.env.LOCAL_MODE ? "enabled" : "disabled"}`);
});

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`[media-server] Received ${signal}, shutting down gracefully...`);

  // Close WebSocket server (stop accepting new connections)
  wss.close(() => {
    console.log("[media-server] WebSocket server closed");
  });

  // Close all existing WebSocket connections
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, "Server shutting down");
    }
  });

  // Close the HTTP server
  server.close(() => {
    console.log("[media-server] HTTP server closed");
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    console.error("[media-server] Forced shutdown after timeout");
    process.exit(1);
  }, 15000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
