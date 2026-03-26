/**
 * E2E Chat Tests
 *
 * Tests room-scoped chat:
 *   1. Send and receive messages within a room
 *   2. Auth required (token validation)
 *   3. Polling with ?after= returns only new messages
 *   4. Rate limiting
 *   5. Messages isolated between rooms
 *   6. Chat works without a stream session (pre-stream)
 *   7. Multi-participant chat
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const roomStore = new Map<string, any>();

vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(async (key: string) => roomStore.get(key) ?? null),
  cacheSet: vi.fn(async (key: string, value: any) => { roomStore.set(key, value); }),
}));

vi.mock('@/lib/community-bridge', () => ({
  lookupCommunityData: vi.fn(async () => null),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST as createRoom } from '@/app/api/room/create/route';
import { POST as joinRoom } from '@/app/api/room/join/route';
import { GET as getChatMessages, POST as sendChatMessage } from '@/app/api/room/[id]/chat/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postJson(url: string, body: any, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function getReq(url: string, headers?: Record<string, string>) {
  return new NextRequest(url, { method: 'GET', headers });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTestRoom(displayName = 'Alice') {
  const res = await createRoom(
    postJson('http://localhost/api/room/create', { displayName })
  );
  return res.json();
}

async function joinTestRoom(roomId: string, password: string, displayName: string) {
  const res = await joinRoom(
    postJson('http://localhost/api/room/join', { roomId, password, displayName })
  );
  return res.json();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Room-Scoped Chat', () => {
  beforeEach(() => {
    roomStore.clear();
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('GET without token returns 401', async () => {
      const { roomId } = await createTestRoom();
      const res = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`),
        routeParams(roomId)
      );
      expect(res.status).toBe(401);
    });

    it('POST without token returns 401', async () => {
      const { roomId } = await createTestRoom();
      const res = await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'hello' }),
        routeParams(roomId)
      );
      expect(res.status).toBe(401);
    });

    it('GET with invalid token returns 403', async () => {
      const { roomId } = await createTestRoom();
      const res = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`, { 'x-room-token': 'bad' }),
        routeParams(roomId)
      );
      expect(res.status).toBe(403);
    });

    it('POST with invalid token returns 403', async () => {
      const { roomId } = await createTestRoom();
      const res = await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'hello' }, { 'x-room-token': 'bad' }),
        routeParams(roomId)
      );
      expect(res.status).toBe(403);
    });

    it('non-existent room returns 404', async () => {
      const res = await getChatMessages(
        getReq('http://localhost/api/room/nope/chat', { 'x-room-token': 'tok' }),
        routeParams('nope')
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Send and receive messages', () => {
    it('admin sends a message and retrieves it', async () => {
      const { roomId, adminToken } = await createTestRoom();

      // Send
      const sendRes = await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'Hello world!' }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(sendRes.status).toBe(201);
      const sent = await sendRes.json();
      expect(sent.message).toBe('Hello world!');
      expect(sent.displayName).toBe('Alice');
      expect(sent.id).toBeTruthy();
      expect(sent.createdAt).toBeTruthy();

      // Retrieve
      const getRes = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(getRes.status).toBe(200);
      const data = await getRes.json();
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].message).toBe('Hello world!');
      expect(data.messages[0].displayName).toBe('Alice');
    });

    it('empty message returns 400', async () => {
      const { roomId, adminToken } = await createTestRoom();
      const res = await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: '' }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(res.status).toBe(400);
    });

    it('missing message returns 400', async () => {
      const { roomId, adminToken } = await createTestRoom();
      const res = await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, {}, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(res.status).toBe(400);
    });

    it('message is truncated at 500 chars', async () => {
      const { roomId, adminToken } = await createTestRoom();
      const longMsg = 'x'.repeat(600);
      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: longMsg }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      const getRes = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const data = await getRes.json();
      expect(data.messages[0].message).toHaveLength(500);
    });
  });

  describe('Polling with ?after= parameter', () => {
    it('returns only messages after the given timestamp', async () => {
      // Use two different participants to avoid rate limiting
      const { roomId, password, adminToken } = await createTestRoom();
      const bob = await joinTestRoom(roomId, password, 'Bob');

      // Admin sends first message
      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'msg1' }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Get all messages to capture timestamp
      const allRes = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const allData = await allRes.json();
      const afterTs = allData.messages[0].createdAt;

      // Small delay for distinct timestamp
      await new Promise(r => setTimeout(r, 5));

      // Bob sends second message (different participant, no rate limit)
      const sendRes = await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'msg2' }, { 'x-room-token': bob.token }),
        routeParams(roomId)
      );
      expect(sendRes.status).toBe(201);

      // Poll with ?after= should return only msg2
      const pollRes = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat?after=${encodeURIComponent(afterTs)}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const pollData = await pollRes.json();
      expect(pollData.messages).toHaveLength(1);
      expect(pollData.messages[0].message).toBe('msg2');
    });

    it('returns empty array when no new messages', async () => {
      const { roomId, adminToken } = await createTestRoom();

      const futureTs = new Date(Date.now() + 100000).toISOString();
      const res = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat?after=${encodeURIComponent(futureTs)}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const data = await res.json();
      expect(data.messages).toHaveLength(0);
    });
  });

  describe('Room isolation', () => {
    it('messages are scoped to their room', async () => {
      // Create two rooms
      const room1 = await createTestRoom('Alice');
      const room2 = await createTestRoom('Bob');

      // Send message in room 1
      await sendChatMessage(
        postJson(`http://localhost/api/room/${room1.roomId}/chat`, { message: 'Room 1 msg' }, { 'x-room-token': room1.adminToken }),
        routeParams(room1.roomId)
      );

      // Send message in room 2
      await sendChatMessage(
        postJson(`http://localhost/api/room/${room2.roomId}/chat`, { message: 'Room 2 msg' }, { 'x-room-token': room2.adminToken }),
        routeParams(room2.roomId)
      );

      // Room 1 only has its message
      const res1 = await getChatMessages(
        getReq(`http://localhost/api/room/${room1.roomId}/chat`, { 'x-room-token': room1.adminToken }),
        routeParams(room1.roomId)
      );
      const data1 = await res1.json();
      expect(data1.messages).toHaveLength(1);
      expect(data1.messages[0].message).toBe('Room 1 msg');

      // Room 2 only has its message
      const res2 = await getChatMessages(
        getReq(`http://localhost/api/room/${room2.roomId}/chat`, { 'x-room-token': room2.adminToken }),
        routeParams(room2.roomId)
      );
      const data2 = await res2.json();
      expect(data2.messages).toHaveLength(1);
      expect(data2.messages[0].message).toBe('Room 2 msg');
    });
  });

  describe('Chat works pre-stream (no stream session needed)', () => {
    it('chat messages flow without starting a stream', async () => {
      const { roomId, password, adminToken } = await createTestRoom('Alice');

      // Join as viewer
      const joined = await joinTestRoom(roomId, password, 'Bob');

      // Admin sends
      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'Welcome!' }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Viewer sends
      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'Thanks!' }, { 'x-room-token': joined.token }),
        routeParams(roomId)
      );

      // Both see both messages
      const res = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`, { 'x-room-token': joined.token }),
        routeParams(roomId)
      );
      const data = await res.json();
      expect(data.messages).toHaveLength(2);

      const names = data.messages.map((m: any) => m.displayName);
      expect(names).toEqual(['Alice', 'Bob']);
    });
  });

  describe('Multi-participant chat', () => {
    it('3 participants send messages, all see all messages', async () => {
      const { roomId, password, adminToken } = await createTestRoom('Alice');
      const bob = await joinTestRoom(roomId, password, 'Bob');
      const charlie = await joinTestRoom(roomId, password, 'Charlie');

      // Each sends a message
      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'Hi from Alice' }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'Hi from Bob' }, { 'x-room-token': bob.token }),
        routeParams(roomId)
      );
      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'Hi from Charlie' }, { 'x-room-token': charlie.token }),
        routeParams(roomId)
      );

      // All see all 3 messages
      const res = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`, { 'x-room-token': charlie.token }),
        routeParams(roomId)
      );
      const data = await res.json();
      expect(data.messages).toHaveLength(3);
      expect(data.messages.map((m: any) => m.displayName)).toEqual(['Alice', 'Bob', 'Charlie']);
      expect(data.messages.map((m: any) => m.message)).toEqual(['Hi from Alice', 'Hi from Bob', 'Hi from Charlie']);
    });

    it('kicked participant cannot send messages', async () => {
      const { roomId, password, adminToken } = await createTestRoom('Alice');
      const bob = await joinTestRoom(roomId, password, 'Bob');

      // Kick Bob
      const { POST: kickParticipant } = await import('@/app/api/room/[id]/kick/route');
      await kickParticipant(
        postJson(`http://localhost/api/room/${roomId}/kick`, { participantId: bob.participantId }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Bob tries to send — should get 403
      const sendRes = await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'am I still here?' }, { 'x-room-token': bob.token }),
        routeParams(roomId)
      );
      expect(sendRes.status).toBe(403);
    });
  });

  describe('Message includes participant identity', () => {
    it('messages include displayName and walletAddress', async () => {
      const walletAddress = 'bcrt1p8wpt9v4frpzs3nfdynqhgasnwd0se73qmf0e2s5wlcy2qyng53sxqrr3m';
      const res = await createRoom(
        postJson('http://localhost/api/room/create', {
          displayName: 'WalletUser',
          walletAddress,
        })
      );
      const { roomId, adminToken } = await res.json();

      await sendChatMessage(
        postJson(`http://localhost/api/room/${roomId}/chat`, { message: 'gm' }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      const getRes = await getChatMessages(
        getReq(`http://localhost/api/room/${roomId}/chat`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const data = await getRes.json();
      expect(data.messages[0].displayName).toBe('WalletUser');
      expect(data.messages[0].walletAddress).toBe(walletAddress);
      expect(data.messages[0].participantId).toBeTruthy();
    });
  });
});
