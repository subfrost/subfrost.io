const MAIN_APP_URL = process.env.MAIN_APP_URL || "https://subfrost.io";
const STREAM_SECRET = process.env.STREAM_SECRET || "";

async function callApi(path: string, body: Record<string, string>): Promise<boolean> {
  try {
    const response = await fetch(`${MAIN_APP_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STREAM_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[callback] ${path} returned ${response.status}: ${text}`);
      return false;
    }

    console.log(`[callback] ${path} succeeded for session ${body.sessionId}`);
    return true;
  } catch (err) {
    console.error(`[callback] Failed to call ${path}:`, err);
    return false;
  }
}

export function notifyLive(sessionId: string): Promise<boolean> {
  return callApi("/api/stream/live", { sessionId });
}

export function notifyStop(sessionId: string): Promise<boolean> {
  return callApi("/api/stream/stop", { sessionId });
}
