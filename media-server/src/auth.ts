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
    const url = `${MAIN_APP_URL}/api/stream/status?streamKey=${encodeURIComponent(streamKey)}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`[auth] Stream status API returned ${response.status}`);
      return { valid: false };
    }

    const data = (await response.json()) as {
      live?: boolean;
      session?: {
        id?: string;
        streamKey?: string;
        status?: string;
      };
    };

    const session = data.session;
    if (!session?.id) {
      console.log(`[auth] No active session found`);
      return { valid: false };
    }

    // Check if the stream key matches the active session
    if (session.streamKey === streamKey) {
      console.log(`[auth] Stream key matched via API, sessionId=${session.id}`);
      return { valid: true, sessionId: session.id };
    }

    return { valid: false };
  } catch (err) {
    console.error(`[auth] Failed to validate stream key against API:`, err);
    return { valid: false };
  }
}
