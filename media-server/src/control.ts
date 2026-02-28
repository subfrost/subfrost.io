const MAIN_APP_URL = process.env.MAIN_APP_URL || "https://subfrost.io";
const STREAM_SECRET = process.env.STREAM_SECRET || "";

export async function notifyFocusChange(
  sessionId: string,
  target: string,
  autofocus: boolean
): Promise<boolean> {
  try {
    const response = await fetch(`${MAIN_APP_URL}/api/stream/focus`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STREAM_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId, target, autofocus }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[control] /api/stream/focus returned ${response.status}: ${text}`);
      return false;
    }

    console.log(`[control] Focus change succeeded for session ${sessionId}: target=${target}, autofocus=${autofocus}`);
    return true;
  } catch (err) {
    console.error(`[control] Failed to notify focus change:`, err);
    return false;
  }
}
