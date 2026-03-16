/**
 * Tests for room types and utilities
 */
import { describe, it, expect } from 'vitest';
import { roomCacheKey } from '@/lib/room-types';
import type { Participant, ParticipantInfo, Room, RoomInfo } from '@/lib/room-types';

describe('room-types', () => {
  describe('roomCacheKey', () => {
    it('generates the correct cache key', () => {
      expect(roomCacheKey('abc123')).toBe('room:abc123');
    });
  });

  describe('Participant type', () => {
    it('includes walletVerified field', () => {
      const participant: Participant = {
        id: 'p1',
        displayName: 'Test User',
        walletAddress: 'bc1ptest',
        walletVerified: true,
        token: 'token123',
        permissions: { mic: true, screen: false },
        isAdmin: false,
        joinedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };
      expect(participant.walletVerified).toBe(true);
    });

    it('allows walletAddress to be null', () => {
      const participant: Participant = {
        id: 'p2',
        displayName: 'No Wallet User',
        walletAddress: null,
        walletVerified: false,
        token: 'token456',
        permissions: { mic: false, screen: false },
        isAdmin: false,
        joinedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };
      expect(participant.walletAddress).toBeNull();
      expect(participant.walletVerified).toBe(false);
    });
  });

  describe('ParticipantInfo type', () => {
    it('includes walletVerified and communityGroup fields', () => {
      const info: ParticipantInfo = {
        id: 'p1',
        displayName: 'Test User',
        walletAddress: 'bc1ptest',
        walletVerified: true,
        communityGroup: 'ALPHA',
        permissions: { mic: true, screen: false },
        isAdmin: false,
        joinedAt: new Date().toISOString(),
      };
      expect(info.walletVerified).toBe(true);
      expect(info.communityGroup).toBe('ALPHA');
    });

    it('allows communityGroup to be null or undefined', () => {
      const info: ParticipantInfo = {
        id: 'p1',
        displayName: 'Test User',
        walletAddress: null,
        walletVerified: false,
        communityGroup: null,
        permissions: { mic: false, screen: false },
        isAdmin: false,
        joinedAt: new Date().toISOString(),
      };
      expect(info.communityGroup).toBeNull();
    });
  });
});
