/**
 * E2E Conference Tests
 *
 * Full lifecycle tests for the conference room system:
 *   1. Room create/join/status API flow
 *   2. Admin permissions and kick
 *   3. Wallet-verified room operations
 *   4. Multi-participant scenarios (admin + viewer)
 *   5. Start stream
 *
 * Uses mocked Redis (in-memory) and mocked Prisma.
 * No external services required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

// In-memory room store (replaces Redis)
const roomStore = new Map<string, any>();

vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(async (key: string) => roomStore.get(key) ?? null),
  cacheSet: vi.fn(async (key: string, value: any) => { roomStore.set(key, value); }),
}));

vi.mock('@/lib/community-bridge', () => ({
  lookupCommunityData: vi.fn(async () => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streamSession: {
      create: vi.fn(async (args: any) => ({
        id: 'session-' + Date.now(),
        streamKey: args.data.streamKey,
        title: args.data.title,
        status: args.data.status,
      })),
      update: vi.fn(async () => ({})),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST as createRoom } from '@/app/api/room/create/route';
import { POST as joinRoom } from '@/app/api/room/join/route';
import { GET as getChallenge } from '@/app/api/room/wallet-challenge/route';
import { GET as getRoomStatus } from '@/app/api/room/[id]/route';
import { POST as setPermissions } from '@/app/api/room/[id]/permissions/route';
import { POST as kickParticipant } from '@/app/api/room/[id]/kick/route';
import { POST as startStream } from '@/app/api/room/[id]/start-stream/route';

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

/** Create params promise matching Next.js 15 dynamic route signature */
function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E Conference Room Lifecycle', () => {
  beforeEach(() => {
    roomStore.clear();
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. BASIC ROOM CREATE + JOIN
  // =========================================================================

  describe('Room create → join → status flow', () => {
    it('admin creates room, viewer joins, both see each other in status', async () => {
      // --- Admin creates room ---
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', {
          displayName: 'Alice (Admin)',
          name: 'Test Room',
        })
      );
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.roomId).toBeTruthy();
      expect(created.password).toHaveLength(6);
      expect(created.adminToken).toBeTruthy();
      expect(created.participantId).toBeTruthy();

      const { roomId, password, adminToken, participantId: adminPid } = created;

      // --- Admin checks room status ---
      const adminStatusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(adminStatusRes.status).toBe(200);
      const adminStatus = await adminStatusRes.json();
      expect(adminStatus.room.name).toBe('Test Room');
      expect(adminStatus.room.participants).toHaveLength(1);
      expect(adminStatus.self.isAdmin).toBe(true);
      expect(adminStatus.self.permissions.mic).toBe(true);
      expect(adminStatus.self.permissions.screen).toBe(true);

      // --- Viewer joins room ---
      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId,
          password,
          displayName: 'Bob (Viewer)',
        })
      );
      expect(joinRes.status).toBe(201);
      const joined = await joinRes.json();
      expect(joined.participantId).toBeTruthy();
      expect(joined.token).toBeTruthy();
      expect(joined.room.participants).toHaveLength(2);

      const { token: viewerToken, participantId: viewerPid } = joined;

      // --- Viewer checks status: should NOT be admin ---
      const viewerStatusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      expect(viewerStatusRes.status).toBe(200);
      const viewerStatus = await viewerStatusRes.json();
      expect(viewerStatus.self.isAdmin).toBe(false);
      expect(viewerStatus.self.permissions.mic).toBe(false);
      expect(viewerStatus.self.permissions.screen).toBe(false);
      expect(viewerStatus.room.participants).toHaveLength(2);

      // Both participants visible
      const names = viewerStatus.room.participants.map((p: any) => p.displayName).sort();
      expect(names).toEqual(['Alice (Admin)', 'Bob (Viewer)']);
    });

    it('join with wrong password is rejected', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId } = await createRes.json();

      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId,
          password: 'WRONG1',
          displayName: 'Bob',
        })
      );
      expect(joinRes.status).toBe(403);
    });

    it('join with case-insensitive password works', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, password } = await createRes.json();

      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId,
          password: password.toLowerCase(),
          displayName: 'Bob',
        })
      );
      expect(joinRes.status).toBe(201);
    });

    it('join non-existent room returns 404', async () => {
      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId: 'nonexist',
          password: 'ABCDEF',
          displayName: 'Bob',
        })
      );
      expect(joinRes.status).toBe(404);
    });

    it('status with invalid token returns 403', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId } = await createRes.json();

      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': 'bad-token' }),
        routeParams(roomId)
      );
      expect(statusRes.status).toBe(403);
    });

    it('status without token returns 401', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId } = await createRes.json();

      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`),
        routeParams(roomId)
      );
      expect(statusRes.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. ADMIN PERMISSIONS
  // =========================================================================

  describe('Admin permission management', () => {
    let roomId: string, password: string, adminToken: string, adminPid: string;
    let viewerToken: string, viewerPid: string;

    beforeEach(async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice', name: 'Perms Test' })
      );
      const created = await createRes.json();
      roomId = created.roomId;
      password = created.password;
      adminToken = created.adminToken;
      adminPid = created.participantId;

      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId, password, displayName: 'Bob',
        })
      );
      const joined = await joinRes.json();
      viewerToken = joined.token;
      viewerPid = joined.participantId;
    });

    it('admin grants mic permission', async () => {
      const res = await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: viewerPid, mic: true,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(res.status).toBe(200);

      // Verify via status
      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      const status = await statusRes.json();
      expect(status.self.permissions.mic).toBe(true);
      expect(status.self.permissions.screen).toBe(false);
    });

    it('admin grants screen permission — viewer becomes presenter', async () => {
      const res = await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: viewerPid, screen: true,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(res.status).toBe(200);

      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      const status = await statusRes.json();
      expect(status.self.permissions.screen).toBe(true);
      expect(status.room.activePresenter).toBe(viewerPid);
    });

    it('granting screen to new participant revokes from previous', async () => {
      // Grant screen to viewer
      await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: viewerPid, screen: true,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Add a third participant
      const join2Res = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId, password, displayName: 'Charlie',
        })
      );
      const joined2 = await join2Res.json();

      // Grant screen to Charlie — should revoke from Bob
      await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: joined2.participantId, screen: true,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Check Bob lost screen permission
      const bobStatus = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      const bobData = await bobStatus.json();
      expect(bobData.self.permissions.screen).toBe(false);
      expect(bobData.room.activePresenter).toBe(joined2.participantId);
    });

    it('non-admin cannot set permissions', async () => {
      const res = await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: adminPid, mic: true,
        }, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. KICK PARTICIPANT
  // =========================================================================

  describe('Kick participant', () => {
    it('admin kicks viewer — viewer disappears from participant list', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, password, adminToken } = await createRes.json();

      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', { roomId, password, displayName: 'Bob' })
      );
      const { participantId: viewerPid, token: viewerToken } = await joinRes.json();

      // Kick Bob
      const kickRes = await kickParticipant(
        postJson(`http://localhost/api/room/${roomId}/kick`, {
          participantId: viewerPid,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(kickRes.status).toBe(200);

      // Admin sees only themselves
      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const status = await statusRes.json();
      expect(status.room.participants).toHaveLength(1);

      // Kicked viewer gets 403
      const viewerStatusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      expect(viewerStatusRes.status).toBe(403);
    });

    it('admin cannot kick themselves', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, adminToken, participantId } = await createRes.json();

      const kickRes = await kickParticipant(
        postJson(`http://localhost/api/room/${roomId}/kick`, {
          participantId,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(kickRes.status).toBe(400);
    });

    it('kicking the active presenter clears activePresenter', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, password, adminToken } = await createRes.json();

      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', { roomId, password, displayName: 'Bob' })
      );
      const { participantId: viewerPid } = await joinRes.json();

      // Make Bob the presenter
      await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: viewerPid, screen: true,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Kick Bob
      await kickParticipant(
        postJson(`http://localhost/api/room/${roomId}/kick`, {
          participantId: viewerPid,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const status = await statusRes.json();
      expect(status.room.activePresenter).toBeNull();
    });

    it('non-admin cannot kick', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, password, participantId: adminPid } = await createRes.json();

      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', { roomId, password, displayName: 'Bob' })
      );
      const { token: viewerToken } = await joinRes.json();

      const kickRes = await kickParticipant(
        postJson(`http://localhost/api/room/${roomId}/kick`, {
          participantId: adminPid,
        }, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      expect(kickRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. START STREAM
  // =========================================================================

  describe('Start stream', () => {
    it('admin starts stream — gets sessionId and streamKey', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, adminToken } = await createRes.json();

      const streamRes = await startStream(
        postJson(`http://localhost/api/room/${roomId}/start-stream`, {}, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(streamRes.status).toBe(200);
      const streamData = await streamRes.json();
      expect(streamData.streamSessionId).toBeTruthy();
      expect(streamData.streamKey).toBeTruthy();

      // Verify room state updated
      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const status = await statusRes.json();
      expect(status.room.streamSessionId).toBe(streamData.streamSessionId);
    });

    it('calling start-stream twice returns same session', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, adminToken } = await createRes.json();

      const res1 = await startStream(
        postJson(`http://localhost/api/room/${roomId}/start-stream`, {}, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const data1 = await res1.json();

      const res2 = await startStream(
        postJson(`http://localhost/api/room/${roomId}/start-stream`, {}, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const data2 = await res2.json();

      expect(data2.streamSessionId).toBe(data1.streamSessionId);
      expect(data2.streamKey).toBe(data1.streamKey);
    });

    it('non-admin cannot start stream', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, password } = await createRes.json();

      const joinRes = await joinRoom(
        postJson('http://localhost/api/room/join', { roomId, password, displayName: 'Bob' })
      );
      const { token: viewerToken } = await joinRes.json();

      const streamRes = await startStream(
        postJson(`http://localhost/api/room/${roomId}/start-stream`, {}, { 'x-room-token': viewerToken }),
        routeParams(roomId)
      );
      expect(streamRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. WALLET-VERIFIED ROOM OPERATIONS
  // =========================================================================

  describe('Wallet-verified operations', () => {
    const walletAddress = 'bcrt1p8wpt9v4frpzs3nfdynqhgasnwd0se73qmf0e2s5wlcy2qyng53sxqrr3m';

    it('wallet challenge returns valid message and timestamp', async () => {
      const res = await getChallenge(
        getReq('http://localhost/api/room/wallet-challenge?action=create')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain('subfrost.io conference');
      expect(data.message).toContain('create');
      expect(typeof data.timestamp).toBe('number');
      expect(Date.now() - data.timestamp).toBeLessThan(5000);
    });

    it('create room with wallet address auto-generates display name', async () => {
      const res = await createRoom(
        postJson('http://localhost/api/room/create', { walletAddress })
      );
      expect(res.status).toBe(201);

      const { roomId, adminToken } = await res.json();
      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const status = await statusRes.json();
      // Should be truncated: "bcrt1p...r3m"
      expect(status.self.displayName).toContain('...');
    });

    it('create room with wallet + signature sets walletVerified', async () => {
      const timestamp = Date.now();
      const message = `subfrost.io conference: create at ${timestamp}`;

      const res = await createRoom(
        postJson('http://localhost/api/room/create', {
          walletAddress,
          walletSignature: 'bW9jay1zaWduYXR1cmUtdGVzdC12YWx1ZQ==',
          walletTimestamp: timestamp,
          walletMessage: message,
        })
      );
      expect(res.status).toBe(201);

      const { roomId, adminToken } = await res.json();
      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const status = await statusRes.json();
      expect(status.self.walletVerified).toBe(true);
      expect(status.self.walletAddress).toBe(walletAddress);
    });

    it('join with same wallet address reuses existing participant (rejoin)', async () => {
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice' })
      );
      const { roomId, password } = await createRes.json();

      // First join
      const join1 = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId, password, displayName: 'Bob', walletAddress,
        })
      );
      const data1 = await join1.json();

      // Second join with same wallet — should get same participant
      const join2 = await joinRoom(
        postJson('http://localhost/api/room/join', {
          roomId, password, displayName: 'Bob Updated', walletAddress,
        })
      );
      expect(join2.status).toBe(200); // rejoin returns 200, not 201
      const data2 = await join2.json();
      expect(data2.participantId).toBe(data1.participantId);
      expect(data2.token).toBe(data1.token);
    });

    it('create with no displayName and no wallet returns 400', async () => {
      const res = await createRoom(
        postJson('http://localhost/api/room/create', {})
      );
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 6. MULTI-PARTICIPANT FULL FLOW
  // =========================================================================

  describe('Full multi-participant flow', () => {
    it('admin creates room, 3 viewers join, admin manages permissions, kicks one, starts stream', async () => {
      // Admin creates
      const createRes = await createRoom(
        postJson('http://localhost/api/room/create', { displayName: 'Alice', name: 'Full Test' })
      );
      const { roomId, password, adminToken } = await createRes.json();

      // 3 viewers join
      const viewers: { pid: string; token: string; name: string }[] = [];
      for (const name of ['Bob', 'Charlie', 'Dave']) {
        const joinRes = await joinRoom(
          postJson('http://localhost/api/room/join', { roomId, password, displayName: name })
        );
        const data = await joinRes.json();
        viewers.push({ pid: data.participantId, token: data.token, name });
      }

      // Verify 4 participants
      const statusRes = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect((await statusRes.json()).room.participants).toHaveLength(4);

      // Grant Bob mic
      await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: viewers[0].pid, mic: true,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Grant Charlie screen (becomes presenter)
      await setPermissions(
        postJson(`http://localhost/api/room/${roomId}/permissions`, {
          participantId: viewers[1].pid, screen: true,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Kick Dave
      await kickParticipant(
        postJson(`http://localhost/api/room/${roomId}/kick`, {
          participantId: viewers[2].pid,
        }, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );

      // Verify state: 3 participants, Charlie is presenter
      const finalStatus = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      const finalData = await finalStatus.json();
      expect(finalData.room.participants).toHaveLength(3);
      expect(finalData.room.activePresenter).toBe(viewers[1].pid);

      // Bob has mic, no screen
      const bobStatus = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewers[0].token }),
        routeParams(roomId)
      );
      const bobData = await bobStatus.json();
      expect(bobData.self.permissions.mic).toBe(true);
      expect(bobData.self.permissions.screen).toBe(false);

      // Charlie has screen
      const charlieStatus = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewers[1].token }),
        routeParams(roomId)
      );
      const charlieData = await charlieStatus.json();
      expect(charlieData.self.permissions.screen).toBe(true);

      // Dave is gone
      const daveStatus = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewers[2].token }),
        routeParams(roomId)
      );
      expect(daveStatus.status).toBe(403);

      // Admin starts stream
      const streamRes = await startStream(
        postJson(`http://localhost/api/room/${roomId}/start-stream`, {}, { 'x-room-token': adminToken }),
        routeParams(roomId)
      );
      expect(streamRes.status).toBe(200);
      const streamData = await streamRes.json();
      expect(streamData.streamSessionId).toBeTruthy();
      expect(streamData.streamKey).toBeTruthy();

      // Presenter (Charlie) can see streamKey in status
      const presenterStatus = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewers[1].token }),
        routeParams(roomId)
      );
      const presenterData = await presenterStatus.json();
      expect(presenterData.room.streamSessionId).toBe(streamData.streamSessionId);

      // Non-presenter (Bob) does NOT see streamKey
      const nonPresenterStatus = await getRoomStatus(
        getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewers[0].token }),
        routeParams(roomId)
      );
      const nonPresenterData = await nonPresenterStatus.json();
      expect(nonPresenterData.room.streamKey).toBeNull();
    });
  });
});
