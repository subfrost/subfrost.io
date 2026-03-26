/**
 * API Route: Room Chat
 *
 * GET: Returns recent chat messages for a room. Supports polling via ?after= param.
 * POST: Send a chat message to a room. Requires x-room-token header.
 *
 * Chat is room-scoped and works without a stream session.
 * Messages stored in Redis alongside room state.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { getRoom, authenticateParticipant } from '@/lib/room-utils';

interface RoomChatMessage {
  id: string;
  participantId: string;
  displayName: string;
  walletAddress: string | null;
  message: string;
  createdAt: string;
}

const CHAT_CACHE_PREFIX = 'room-chat:';
const CHAT_TTL = 86400; // 24 hours (same as room)
const MAX_MESSAGES = 500;
const MAX_MESSAGE_LENGTH = 500;

// In-memory rate limiting: participantId -> last message timestamp
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 1_000;

// Clean stale rate limit entries every 60s
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [id, ts] of rateLimitMap) {
      if (ts < cutoff) rateLimitMap.delete(id);
    }
  }, 60_000);
}

function chatCacheKey(roomId: string): string {
  return `${CHAT_CACHE_PREFIX}${roomId}`;
}

async function getChatMessages(roomId: string): Promise<RoomChatMessage[]> {
  return (await cacheGet<RoomChatMessage[]>(chatCacheKey(roomId))) ?? [];
}

async function saveChatMessages(roomId: string, messages: RoomChatMessage[]): Promise<void> {
  // Keep only the last MAX_MESSAGES
  const trimmed = messages.length > MAX_MESSAGES
    ? messages.slice(messages.length - MAX_MESSAGES)
    : messages;
  await cacheSet(chatCacheKey(roomId), trimmed, CHAT_TTL);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const token = request.headers.get('x-room-token');

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const room = await getRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (!authenticateParticipant(room, token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // Support polling: ?after=<ISO timestamp> returns only newer messages
    const afterParam = request.nextUrl.searchParams.get('after');
    const messages = await getChatMessages(roomId);

    if (afterParam) {
      const afterDate = new Date(afterParam).getTime();
      const filtered = messages.filter(m => new Date(m.createdAt).getTime() > afterDate);
      return NextResponse.json({ messages: filtered });
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[Room Chat GET] Error:', error);
    return NextResponse.json({ error: 'Failed to get messages' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const token = request.headers.get('x-room-token');

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const room = await getRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const participantId = authenticateParticipant(room, token);
    if (!participantId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // Rate limit by participant
    const now = Date.now();
    const lastMsg = rateLimitMap.get(participantId);
    if (lastMsg && now - lastMsg < RATE_LIMIT_MS) {
      return NextResponse.json({ error: 'Too many messages. Please wait.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { message } = body as { message?: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const trimmedMsg = message.trim().slice(0, MAX_MESSAGE_LENGTH);
    const participant = room.participants[participantId];

    const chatMsg: RoomChatMessage = {
      id: `${roomId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
      participantId,
      displayName: participant.displayName,
      walletAddress: participant.walletAddress,
      message: trimmedMsg,
      createdAt: new Date().toISOString(),
    };

    const messages = await getChatMessages(roomId);
    messages.push(chatMsg);
    await saveChatMessages(roomId, messages);

    rateLimitMap.set(participantId, now);

    return NextResponse.json(chatMsg, { status: 201 });
  } catch (error) {
    console.error('[Room Chat POST] Error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
