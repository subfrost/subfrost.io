const MAIN_APP_URL = process.env.MAIN_APP_URL || "https://subfrost.io";
const STREAM_SECRET = process.env.STREAM_SECRET || "";

export interface AuthResult {
  valid: boolean;
  sessionId?: string;
}

export async function validateStreamKey(streamKey: string): Promise<AuthResult> {
  // Fallback: accept shared secret from env
  if (STREAM_SECRET && streamKey === STREAM_SECRET) {
    // Generate a session ID from the secret-based auth
    const sessionId = `secret-${Date.now().toString(36)}`;
    console.log(`[auth] Stream key validated via shared secret, sessionId=${sessionId}`);
    return { valid: true, sessionId };
  }

  // Primary: validate against the main application API
  try {
    const url = `${MAIN_APP_URL}/api/stream/status`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${streamKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.log(`[auth] Stream status API returned ${response.status}`);
      return { valid: false };
    }

    const data = (await response.json()) as {
      active?: boolean;
      sessionId?: string;
      streamKey?: string;
    };

    if (data.active && data.sessionId) {
      console.log(`[auth] Stream key validated via API, sessionId=${data.sessionId}`);
      return { valid: true, sessionId: data.sessionId };
    }

    // Check if the stream key matches
    if (data.streamKey === streamKey && data.sessionId) {
      console.log(`[auth] Stream key matched via API, sessionId=${data.sessionId}`);
      return { valid: true, sessionId: data.sessionId };
    }

    return { valid: false };
  } catch (err) {
    console.error(`[auth] Failed to validate stream key against API:`, err);
    return { valid: false };
  }
}
