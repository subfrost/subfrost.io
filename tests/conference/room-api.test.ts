/**
 * Tests for room API routes: create, join, wallet-challenge
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis before importing routes
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { POST as createRoom } from '@/app/api/room/create/route';
import { POST as joinRoom } from '@/app/api/room/join/route';
import { GET as getChallenge } from '@/app/api/room/wallet-challenge/route';
import { NextRequest } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';

function makeRequest(body: any, method = 'POST', url = 'http://localhost/api/room/create') {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

describe('room API', () => {
  beforeEach(() => {
    vi.mocked(cacheGet).mockReset();
    vi.mocked(cacheSet).mockResolvedValue(undefined as any);
  });

  describe('POST /api/room/create', () => {
    it('creates a room with display name', async () => {
      const req = makeRequest({ displayName: 'Alice' });
      const res = await createRoom(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.roomId).toBeTruthy();
      expect(data.password).toBeTruthy();
      expect(data.adminToken).toBeTruthy();
      expect(data.participantId).toBeTruthy();
    });

    it('creates a room with wallet address, defaults display name', async () => {
      const req = makeRequest({
        walletAddress: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
      });
      const res = await createRoom(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.roomId).toBeTruthy();
      // Display name should be auto-generated from truncated address
    });

    it('creates a room with wallet verification', async () => {
      const timestamp = Date.now();
      const message = `subfrost.io conference: create at ${timestamp}`;
      const req = makeRequest({
        displayName: 'Alice',
        walletAddress: 'bc1ptestaddress1234567890abcdef',
        walletSignature: 'base64signaturevaluehere1234567890',
        walletTimestamp: timestamp,
        walletMessage: message,
      });
      const res = await createRoom(req);
      expect(res.status).toBe(201);
    });

    it('rejects when no displayName and no wallet', async () => {
      const req = makeRequest({});
      const res = await createRoom(req);
      expect(res.status).toBe(400);
    });

    it('stores room in cache', async () => {
      const req = makeRequest({ displayName: 'Alice' });
      await createRoom(req);
      expect(cacheSet).toHaveBeenCalled();
    });
  });

  describe('POST /api/room/join', () => {
    it('rejects when roomId or password missing', async () => {
      const req = makeRequest({ displayName: 'Bob' }, 'POST', 'http://localhost/api/room/join');
      const res = await joinRoom(req);
      expect(res.status).toBe(400);
    });

    it('rejects when room not found', async () => {
      vi.mocked(cacheGet).mockResolvedValueOnce(null);
      const req = makeRequest(
        { roomId: 'nonexistent', password: 'ABCDEF', displayName: 'Bob' },
        'POST',
        'http://localhost/api/room/join',
      );
      const res = await joinRoom(req);
      expect(res.status).toBe(404);
    });

    it('rejects wrong password', async () => {
      vi.mocked(cacheGet).mockResolvedValueOnce({
        id: 'test-room',
        password: 'CORRECT',
        participants: {},
        adminToken: 'admin-token',
        name: 'Test Room',
        streamKey: null,
        streamSessionId: null,
        activePresenter: null,
        createdAt: new Date().toISOString(),
      });
      const req = makeRequest(
        { roomId: 'test-room', password: 'WRONG', displayName: 'Bob' },
        'POST',
        'http://localhost/api/room/join',
      );
      const res = await joinRoom(req);
      expect(res.status).toBe(403);
    });

    it('joins successfully with correct password', async () => {
      vi.mocked(cacheGet).mockResolvedValueOnce({
        id: 'test-room',
        password: 'ABCDEF',
        participants: {},
        adminToken: 'admin-token',
        name: 'Test Room',
        streamKey: null,
        streamSessionId: null,
        activePresenter: null,
        createdAt: new Date().toISOString(),
      });
      const req = makeRequest(
        { roomId: 'test-room', password: 'ABCDEF', displayName: 'Bob' },
        'POST',
        'http://localhost/api/room/join',
      );
      const res = await joinRoom(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.participantId).toBeTruthy();
      expect(data.token).toBeTruthy();
      expect(data.room).toBeTruthy();
    });

    it('joins with wallet and defaults display name', async () => {
      vi.mocked(cacheGet).mockResolvedValueOnce({
        id: 'test-room',
        password: 'ABCDEF',
        participants: {},
        adminToken: 'admin-token',
        name: 'Test Room',
        streamKey: null,
        streamSessionId: null,
        activePresenter: null,
        createdAt: new Date().toISOString(),
      });
      const req = makeRequest(
        {
          roomId: 'test-room',
          password: 'ABCDEF',
          walletAddress: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
        },
        'POST',
        'http://localhost/api/room/join',
      );
      const res = await joinRoom(req);
      expect(res.status).toBe(201);
    });

    it('password comparison is case-insensitive', async () => {
      vi.mocked(cacheGet).mockResolvedValueOnce({
        id: 'test-room',
        password: 'ABCDEF',
        participants: {},
        adminToken: 'admin-token',
        name: 'Test Room',
        streamKey: null,
        streamSessionId: null,
        activePresenter: null,
        createdAt: new Date().toISOString(),
      });
      const req = makeRequest(
        { roomId: 'test-room', password: 'abcdef', displayName: 'Bob' },
        'POST',
        'http://localhost/api/room/join',
      );
      const res = await joinRoom(req);
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/room/wallet-challenge', () => {
    it('returns a challenge message and timestamp', async () => {
      const req = new NextRequest('http://localhost/api/room/wallet-challenge?action=join');
      const res = await getChallenge(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain('subfrost.io conference');
      expect(data.message).toContain('join');
      expect(typeof data.timestamp).toBe('number');
    });

    it('defaults action to "join"', async () => {
      const req = new NextRequest('http://localhost/api/room/wallet-challenge');
      const res = await getChallenge(req);
      const data = await res.json();
      expect(data.message).toContain('join');
    });

    it('uses the action parameter', async () => {
      const req = new NextRequest('http://localhost/api/room/wallet-challenge?action=create');
      const res = await getChallenge(req);
      const data = await res.json();
      expect(data.message).toContain('create');
    });
  });
});
